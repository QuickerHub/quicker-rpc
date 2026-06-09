use reqwest::blocking::Client;

pub fn build_http_client() -> Result<Client, String> {
    Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())
}

pub fn fetch_text(client: &Client, url: &str) -> Result<String, String> {
    client
        .get(url)
        .send()
        .map_err(|e| format!("fetch {url}: {e}"))?
        .error_for_status()
        .map_err(|e| format!("fetch {url}: {e}"))?
        .text()
        .map_err(|e| format!("read {url}: {e}"))
}

pub fn try_fetch_text(client: &Client, primary: &str, mirror: Option<&str>) -> Option<String> {
    if let Ok(raw) = fetch_text(client, primary) {
        return Some(raw);
    }
    if let Some(mirror) = mirror {
        if let Ok(raw) = fetch_text(client, mirror) {
            return Some(raw);
        }
    }
    None
}
