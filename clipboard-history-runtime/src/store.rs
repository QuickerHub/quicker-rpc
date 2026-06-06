use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use anyhow::{Context, Result};
use rusqlite::{params, Connection};
use tokio::sync::broadcast;

use crate::model::{
    ClipItemDetailDto, ClipItemDto, ClipKind, ClipPatchRequest, ClipRecord, ClipSearchRequest,
    HighlightRange, PagedClipItemsResponse,
};

const DEFAULT_MAX_ITEMS: i64 = 500;

pub struct ClipStore {
    conn: Mutex<Connection>,
    data_dir: PathBuf,
    max_items: i64,
    events: broadcast::Sender<()>,
}

impl ClipStore {
    pub fn open(data_dir: &Path) -> Result<Arc<Self>> {
        std::fs::create_dir_all(data_dir)?;
        std::fs::create_dir_all(data_dir.join("images"))?;
        let db_path = data_dir.join("clipboard.db");
        let conn = Connection::open(&db_path).context("open clipboard.db")?;
        conn.execute_batch(
            r#"
            PRAGMA journal_mode = WAL;
            CREATE TABLE IF NOT EXISTS clip_items (
              id TEXT PRIMARY KEY,
              kind TEXT NOT NULL,
              title TEXT NOT NULL,
              preview TEXT NOT NULL,
              content_text TEXT,
              content_path TEXT,
              file_paths TEXT,
              source_process TEXT,
              is_pinned INTEGER NOT NULL DEFAULT 0,
              usage_count INTEGER NOT NULL DEFAULT 0,
              last_used_at INTEGER,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL,
              content_hash TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_clip_items_created ON clip_items(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_clip_items_pinned ON clip_items(is_pinned DESC, created_at DESC);
            "#,
        )?;
        let (events, _) = broadcast::channel(64);
        Ok(Arc::new(Self {
            conn: Mutex::new(conn),
            data_dir: data_dir.to_path_buf(),
            max_items: DEFAULT_MAX_ITEMS,
            events,
        }))
    }

    pub fn subscribe(&self) -> broadcast::Receiver<()> {
        self.events.subscribe()
    }

    fn notify(&self) {
        let _ = self.events.send(());
    }

    pub fn data_dir(&self) -> &Path {
        &self.data_dir
    }

    pub fn insert_record(&self, record: ClipRecord) -> Result<bool> {
        let mut conn = self.conn.lock().expect("clip db lock");
        let tx = conn.transaction()?;
        if let Some(existing_id) = find_duplicate(&tx, &record.content_hash)? {
            tx.execute(
                "UPDATE clip_items SET updated_at = ?1 WHERE id = ?2",
                params![record.updated_at, existing_id],
            )?;
            tx.commit()?;
            self.notify();
            return Ok(false);
        }

        tx.execute(
            r#"INSERT INTO clip_items (
              id, kind, title, preview, content_text, content_path, file_paths,
              source_process, is_pinned, usage_count, last_used_at, created_at, updated_at, content_hash
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)"#,
            params![
                record.id,
                record.kind.as_str(),
                record.title,
                record.preview,
                record.content_text,
                record.content_path,
                serde_json::to_string(&record.file_paths)?,
                record.source_process,
                i32::from(record.is_pinned),
                record.usage_count,
                record.last_used_at,
                record.created_at,
                record.updated_at,
                record.content_hash,
            ],
        )?;
        trim_old_items(&tx, self.max_items)?;
        tx.commit()?;
        self.notify();
        Ok(true)
    }

    pub fn search(&self, request: &ClipSearchRequest) -> Result<PagedClipItemsResponse> {
        let skip = request.skip.unwrap_or(0).max(0);
        let take = request.take.unwrap_or(100).clamp(1, 500);
        let query = request.query.as_deref().unwrap_or("").trim().to_ascii_lowercase();

        let conn = self.conn.lock().expect("clip db lock");
        let mut sql = String::from(
            "SELECT id, kind, title, preview, content_text, content_path, file_paths, source_process,
                    is_pinned, usage_count, last_used_at, created_at, updated_at, content_hash
             FROM clip_items WHERE 1=1",
        );
        let mut binds: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

        if let Some(true) = request.pinned_only {
            sql.push_str(" AND is_pinned = 1");
            let _ = true;
        } else if let Some(false) = request.pinned_only {
            sql.push_str(" AND is_pinned = 0");
        }

        if let Some(kind) = request.kind.as_deref().and_then(ClipKind::from_str) {
            sql.push_str(" AND kind = ?");
            binds.push(Box::new(kind.as_str().to_string()));
        }

        if let Some(proc_name) = request
            .source_process
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
        {
            if proc_name.eq_ignore_ascii_case("foreground") {
                if let Some(active) = crate::clipboard::active_process_name() {
                    sql.push_str(" AND lower(source_process) = lower(?)");
                    binds.push(Box::new(active));
                }
            } else {
                sql.push_str(" AND lower(source_process) LIKE lower(?)");
                binds.push(Box::new(format!("%{proc_name}%")));
            }
        }

        sql.push_str(" ORDER BY is_pinned DESC, updated_at DESC");

        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(rusqlite::params_from_iter(binds.iter().map(|b| b.as_ref())), |row| {
            map_row(row)
        })?;

        let mut all: Vec<ClipRecord> = Vec::new();
        for row in rows {
            all.push(row?);
        }

        let filtered: Vec<ClipRecord> = if query.is_empty() {
            all
        } else {
            all.into_iter()
                .filter(|item| matches_query(item, &query))
                .collect()
        };

        let total = filtered.len() as i64;
        let page = filtered
            .into_iter()
            .skip(skip as usize)
            .take(take as usize)
            .map(|record| to_dto(&record, &query))
            .collect();

        Ok(PagedClipItemsResponse {
            total,
            items: page,
        })
    }

    pub fn get_by_id(&self, id: &str) -> Result<Option<ClipItemDto>> {
        let conn = self.conn.lock().expect("clip db lock");
        let mut stmt = conn.prepare(
            "SELECT id, kind, title, preview, content_text, content_path, file_paths, source_process,
                    is_pinned, usage_count, last_used_at, created_at, updated_at, content_hash
             FROM clip_items WHERE id = ?1",
        )?;
        let mut rows = stmt.query(params![id])?;
        if let Some(row) = rows.next()? {
            let record = map_row(&row)?;
            return Ok(Some(to_dto(&record, "")));
        }
        Ok(None)
    }

    pub fn get_detail(&self, id: &str) -> Result<Option<ClipItemDetailDto>> {
        let conn = self.conn.lock().expect("clip db lock");
        let mut stmt = conn.prepare(
            "SELECT id, kind, title, preview, content_text, content_path, file_paths, source_process,
                    is_pinned, usage_count, last_used_at, created_at, updated_at, content_hash
             FROM clip_items WHERE id = ?1",
        )?;
        let mut rows = stmt.query(params![id])?;
        if let Some(row) = rows.next()? {
            let record = map_row(&row)?;
            return Ok(Some(to_detail(&record)));
        }
        Ok(None)
    }

    pub fn patch(&self, id: &str, patch: &ClipPatchRequest) -> Result<Option<ClipItemDetailDto>> {
        let now = chrono::Utc::now().timestamp_millis();
        let conn = self.conn.lock().expect("clip db lock");
        if let Some(title) = patch.title.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
            conn.execute(
                "UPDATE clip_items SET title = ?1, updated_at = ?2 WHERE id = ?3",
                params![title, now, id],
            )?;
        }
        if let Some(pinned) = patch.is_pinned {
            conn.execute(
                "UPDATE clip_items SET is_pinned = ?1, updated_at = ?2 WHERE id = ?3",
                params![i32::from(pinned), now, id],
            )?;
        }
        drop(conn);
        self.notify();
        self.get_detail(id)
    }

    pub fn delete(&self, id: &str) -> Result<bool> {
        let conn = self.conn.lock().expect("clip db lock");
        let affected = conn.execute("DELETE FROM clip_items WHERE id = ?1", params![id])?;
        drop(conn);
        if affected > 0 {
            self.notify();
            Ok(true)
        } else {
            Ok(false)
        }
    }

    pub fn clear(&self, keep_pinned: bool) -> Result<u64> {
        let conn = self.conn.lock().expect("clip db lock");
        let affected = if keep_pinned {
            conn.execute("DELETE FROM clip_items WHERE is_pinned = 0", [])?
        } else {
            conn.execute("DELETE FROM clip_items", [])?
        };
        drop(conn);
        if affected > 0 {
            self.notify();
        }
        Ok(affected as u64)
    }

    pub fn touch_usage(&self, id: &str) -> Result<()> {
        let now = chrono::Utc::now().timestamp_millis();
        let conn = self.conn.lock().expect("clip db lock");
        conn.execute(
            "UPDATE clip_items SET usage_count = usage_count + 1, last_used_at = ?1, updated_at = ?1 WHERE id = ?2",
            params![now, id],
        )?;
        drop(conn);
        self.notify();
        Ok(())
    }

    pub fn source_processes(&self) -> Result<Vec<String>> {
        let conn = self.conn.lock().expect("clip db lock");
        let mut stmt = conn.prepare(
            "SELECT DISTINCT source_process FROM clip_items WHERE source_process IS NOT NULL AND trim(source_process) != '' ORDER BY source_process",
        )?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }
}

fn find_duplicate(conn: &Connection, hash: &str) -> Result<Option<String>> {
    let mut stmt = conn.prepare(
        "SELECT id FROM clip_items WHERE content_hash = ?1 ORDER BY updated_at DESC LIMIT 1",
    )?;
    let mut rows = stmt.query(params![hash])?;
    if let Some(row) = rows.next()? {
        return Ok(Some(row.get(0)?));
    }
    Ok(None)
}

fn trim_old_items(conn: &Connection, max_items: i64) -> Result<()> {
    conn.execute(
        r#"DELETE FROM clip_items
           WHERE is_pinned = 0
             AND id NOT IN (
               SELECT id FROM clip_items ORDER BY is_pinned DESC, updated_at DESC LIMIT ?1
             )"#,
        params![max_items],
    )?;
    Ok(())
}

fn map_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ClipRecord> {
    let kind_raw: String = row.get(1)?;
    let file_paths_raw: Option<String> = row.get(6)?;
    let file_paths: Vec<String> = file_paths_raw
        .as_deref()
        .and_then(|raw| serde_json::from_str(raw).ok())
        .unwrap_or_default();
    Ok(ClipRecord {
        id: row.get(0)?,
        kind: ClipKind::from_str(&kind_raw).unwrap_or(ClipKind::Text),
        title: row.get(2)?,
        preview: row.get(3)?,
        content_text: row.get(4)?,
        content_path: row.get(5)?,
        file_paths,
        source_process: row.get(7)?,
        is_pinned: row.get::<_, i32>(8)? != 0,
        usage_count: row.get::<_, i32>(9)? as u32,
        last_used_at: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
        content_hash: row.get(13)?,
    })
}

fn matches_query(record: &ClipRecord, query: &str) -> bool {
    if query.is_empty() {
        return true;
    }
    let haystacks = [
        record.title.to_ascii_lowercase(),
        record.preview.to_ascii_lowercase(),
        record
            .content_text
            .as_deref()
            .unwrap_or("")
            .to_ascii_lowercase(),
        record
            .source_process
            .as_deref()
            .unwrap_or("")
            .to_ascii_lowercase(),
    ];
    haystacks.iter().any(|h| h.contains(query))
}

fn highlight_ranges(text: &str, query: &str) -> (Option<String>, Vec<HighlightRange>) {
    if query.is_empty() {
        return (None, Vec::new());
    }
    let lower = text.to_ascii_lowercase();
    let q = query.to_ascii_lowercase();
    let mut ranges = Vec::new();
    let mut start = 0usize;
    while let Some(idx) = lower[start..].find(&q) {
        let abs = start + idx;
        let end = abs + q.len();
        ranges.push(HighlightRange {
            start: abs as u32,
            end: end as u32,
        });
        start = end;
    }
    (Some(text.to_string()), ranges)
}

fn to_dto(record: &ClipRecord, query: &str) -> ClipItemDto {
    let (highlighted_text, highlight_hit_ranges) = if query.is_empty() {
        (None, Vec::new())
    } else {
        highlight_ranges(&record.preview, query)
    };
    ClipItemDto {
        id: record.id.clone(),
        kind: record.kind.as_str().to_string(),
        title: record.title.clone(),
        preview: record.preview.clone(),
        source_process: record.source_process.clone(),
        is_pinned: record.is_pinned,
        usage_count: record.usage_count,
        text_length: record.content_text.as_ref().map(|t| t.chars().count() as u32),
        file_count: if record.file_paths.is_empty() {
            None
        } else {
            Some(record.file_paths.len() as u32)
        },
        image_size_bytes: record
            .content_path
            .as_ref()
            .and_then(|p| std::fs::metadata(p).ok())
            .map(|m| m.len()),
        created_at: record.created_at,
        updated_at: record.updated_at,
        highlighted_text,
        highlight_hit_ranges,
    }
}

fn to_detail(record: &ClipRecord) -> ClipItemDetailDto {
    let image_url = if record.kind == ClipKind::Image {
        record
            .content_path
            .as_ref()
            .map(|_| format!("/api/clipboard/items/{}/image", record.id))
    } else {
        None
    };
    ClipItemDetailDto {
        id: record.id.clone(),
        kind: record.kind.as_str().to_string(),
        title: record.title.clone(),
        preview: record.preview.clone(),
        body_text: record.content_text.clone(),
        html_data: if record.kind == ClipKind::Html {
            record.content_text.clone()
        } else {
            None
        },
        file_paths: record.file_paths.clone(),
        image_url,
        source_process: record.source_process.clone(),
        is_pinned: record.is_pinned,
        usage_count: record.usage_count,
        created_at: record.created_at,
        updated_at: record.updated_at,
    }
}

pub fn content_hash(kind: &str, payload: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    kind.hash(&mut hasher);
    payload.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}
