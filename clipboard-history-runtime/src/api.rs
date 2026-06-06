use std::convert::Infallible;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use axum::extract::{Path, Query, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::IntoResponse;
use axum::routing::{delete, get, post};
use axum::{Json, Router};
use futures::stream::Stream;
use serde::Deserialize;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;
use tower_http::cors::CorsLayer;

use crate::clipboard::copy_item_to_clipboard;
use crate::model::{ClipPatchRequest, ClipSearchRequest};
use crate::store::ClipStore;

#[derive(Clone)]
pub struct AppState {
    pub store: Arc<ClipStore>,
    pub runtime_version: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClearQuery {
    pub keep_pinned: Option<bool>,
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/api/clipboard/items/search", post(search_items))
        .route("/api/clipboard/items/{id}/image", get(get_image))
        .route("/api/clipboard/items/{id}/detail", get(get_detail))
        .route("/api/clipboard/items/{id}/copy", post(copy_item))
        .route(
            "/api/clipboard/items/{id}",
            get(get_item).patch(patch_item).delete(delete_item),
        )
        .route("/api/clipboard/items", delete(clear_items))
        .route("/api/clipboard/source-processes", get(source_processes))
        .route("/api/clipboard/events", get(events_sse))
        .layer(CorsLayer::permissive())
        .with_state(state)
}

async fn health(State(state): State<AppState>) -> impl IntoResponse {
    Json(serde_json::json!({
        "ok": true,
        "protocolVersion": 1,
        "runtimeVersion": state.runtime_version,
        "ready": true,
    }))
}

async fn search_items(
    State(state): State<AppState>,
    Json(request): Json<ClipSearchRequest>,
) -> impl IntoResponse {
    match state.store.search(&request) {
        Ok(page) => (StatusCode::OK, Json(page)).into_response(),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": err.to_string() })),
        )
            .into_response(),
    }
}

async fn get_item(State(state): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    match state.store.get_by_id(&id) {
        Ok(Some(item)) => (StatusCode::OK, Json(item)).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": err.to_string() })),
        )
            .into_response(),
    }
}

async fn get_detail(State(state): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    match state.store.get_detail(&id) {
        Ok(Some(item)) => (StatusCode::OK, Json(item)).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": err.to_string() })),
        )
            .into_response(),
    }
}

async fn copy_item(State(state): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    match copy_item_to_clipboard(&state.store, &id) {
        Ok(()) => (StatusCode::OK, Json(serde_json::json!({ "ok": true }))).into_response(),
        Err(err) => (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": err.to_string() })),
        )
            .into_response(),
    }
}

async fn patch_item(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(patch): Json<ClipPatchRequest>,
) -> impl IntoResponse {
    match state.store.patch(&id, &patch) {
        Ok(Some(item)) => (StatusCode::OK, Json(item)).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": err.to_string() })),
        )
            .into_response(),
    }
}

async fn delete_item(State(state): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    match state.store.delete(&id) {
        Ok(true) => (StatusCode::OK, Json(serde_json::json!({ "ok": true }))).into_response(),
        Ok(false) => StatusCode::NOT_FOUND.into_response(),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": err.to_string() })),
        )
            .into_response(),
    }
}

async fn clear_items(
    State(state): State<AppState>,
    Query(query): Query<ClearQuery>,
) -> impl IntoResponse {
    let keep = query.keep_pinned.unwrap_or(true);
    match state.store.clear(keep) {
        Ok(count) => (
            StatusCode::OK,
            Json(serde_json::json!({ "ok": true, "deleted": count })),
        )
            .into_response(),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": err.to_string() })),
        )
            .into_response(),
    }
}

async fn get_image(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<(StatusCode, HeaderMap, Vec<u8>), StatusCode> {
    let store = Arc::clone(&state.store);
    let path = tokio::task::spawn_blocking(move || -> Result<PathBuf, StatusCode> {
        let detail = store
            .get_detail(&id)
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
            .ok_or(StatusCode::NOT_FOUND)?;
        if detail.kind != "image" {
            return Err(StatusCode::BAD_REQUEST);
        }
        let data_dir = store.data_dir();
        let db = data_dir.join("clipboard.db");
        let conn =
            rusqlite::Connection::open(db).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        let mut stmt = conn
            .prepare("SELECT content_path FROM clip_items WHERE id = ?1")
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        let mut rows = stmt
            .query(rusqlite::params![id])
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        let row = rows.next().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        let Some(row) = row else {
            return Err(StatusCode::NOT_FOUND);
        };
        let path_raw: Option<String> = row.get(0).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        let Some(path_raw) = path_raw else {
            return Err(StatusCode::NOT_FOUND);
        };
        let path = PathBuf::from(path_raw);
        if !path.starts_with(data_dir) {
            return Err(StatusCode::FORBIDDEN);
        }
        Ok(path)
    })
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)??;

    let bytes = tokio::fs::read(&path)
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?;
    let mut headers = HeaderMap::new();
    headers.insert(header::CONTENT_TYPE, "image/png".parse().unwrap());
    Ok((StatusCode::OK, headers, bytes))
}

async fn source_processes(State(state): State<AppState>) -> impl IntoResponse {
    match state.store.source_processes() {
        Ok(items) => (StatusCode::OK, Json(items)).into_response(),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": err.to_string() })),
        )
            .into_response(),
    }
}

async fn events_sse(State(state): State<AppState>) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let rx = state.store.subscribe();
    let stream = BroadcastStream::new(rx).filter_map(|msg| match msg {
        Ok(()) => Some(Ok(Event::default().event("clipChanged").data("1"))),
        Err(_) => None,
    });
    Sse::new(stream).keep_alive(KeepAlive::new().interval(Duration::from_secs(15)))
}
