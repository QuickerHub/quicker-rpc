mod api;
mod clipboard;
mod model;
mod store;

use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;

use anyhow::Context;
use clap::Parser;
use tracing::info;

use crate::api::{router, AppState};
use crate::clipboard::spawn_watcher;
use crate::store::ClipStore;

#[derive(Debug, Parser)]
#[command(name = "quicker-clipboard-history")]
struct Args {
    #[arg(long, default_value = "127.0.0.1")]
    host: String,
    #[arg(long, default_value_t = 6020)]
    port: u16,
    #[arg(long)]
    data_dir: Option<PathBuf>,
}

fn resolve_data_dir(explicit: Option<PathBuf>) -> PathBuf {
    if let Some(dir) = explicit {
        return dir;
    }
    if let Ok(dir) = std::env::var("QUICKER_CLIPBOARD_DATA_DIR") {
        if !dir.trim().is_empty() {
            return PathBuf::from(dir);
        }
    }
    #[cfg(windows)]
    {
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            return PathBuf::from(local)
                .join("QuickerAgent")
                .join("plugins")
                .join("clipboard-history")
                .join("data");
        }
    }
    PathBuf::from("clipboard-history-data")
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,quicker_clipboard_history=debug".into()),
        )
        .init();

    let args = Args::parse();
    let data_dir = resolve_data_dir(args.data_dir);
    std::env::set_var("QUICKER_CLIPBOARD_DATA_DIR", &data_dir);

    let store = ClipStore::open(&data_dir).context("open clip store")?;
    spawn_watcher(Arc::clone(&store));

    let runtime_version = env!("CARGO_PKG_VERSION").to_string();
    let state = AppState {
        store,
        runtime_version,
    };
    let app = router(state);
    let addr: SocketAddr = format!("{}:{}", args.host, args.port)
        .parse()
        .context("parse listen address")?;
    info!(%addr, data_dir = %data_dir.display(), "clipboard history runtime listening");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
