use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ClipKind {
    Text,
    Html,
    Image,
    Files,
}

impl ClipKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Text => "text",
            Self::Html => "html",
            Self::Image => "image",
            Self::Files => "files",
        }
    }

    pub fn from_str(raw: &str) -> Option<Self> {
        match raw.trim().to_ascii_lowercase().as_str() {
            "text" => Some(Self::Text),
            "html" => Some(Self::Html),
            "image" => Some(Self::Image),
            "files" | "file" => Some(Self::Files),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipItemDto {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub preview: String,
    pub source_process: Option<String>,
    pub is_pinned: bool,
    pub usage_count: u32,
    pub text_length: Option<u32>,
    pub file_count: Option<u32>,
    pub image_size_bytes: Option<u64>,
    pub created_at: i64,
    pub updated_at: i64,
    pub highlighted_text: Option<String>,
    pub highlight_hit_ranges: Vec<HighlightRange>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HighlightRange {
    pub start: u32,
    pub end: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipItemDetailDto {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub preview: String,
    pub body_text: Option<String>,
    pub html_data: Option<String>,
    pub file_paths: Vec<String>,
    pub image_url: Option<String>,
    pub source_process: Option<String>,
    pub is_pinned: bool,
    pub usage_count: u32,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipSearchRequest {
    pub query: Option<String>,
    pub kind: Option<String>,
    pub skip: Option<i64>,
    pub take: Option<i64>,
    pub pinned_only: Option<bool>,
    pub source_process: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PagedClipItemsResponse {
    pub total: i64,
    pub items: Vec<ClipItemDto>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipPatchRequest {
    pub is_pinned: Option<bool>,
    pub title: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ClipRecord {
    pub id: String,
    pub kind: ClipKind,
    pub title: String,
    pub preview: String,
    pub content_text: Option<String>,
    pub content_path: Option<String>,
    pub file_paths: Vec<String>,
    pub source_process: Option<String>,
    pub is_pinned: bool,
    pub usage_count: u32,
    pub last_used_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
    pub content_hash: String,
}
