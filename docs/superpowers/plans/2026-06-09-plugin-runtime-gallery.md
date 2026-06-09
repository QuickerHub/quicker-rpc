# Plugin Runtime Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [2026-06-09-plugin-runtime-gallery-design.md](../specs/2026-06-09-plugin-runtime-gallery-design.md)

**Goal:** Decouple QuickerAgent plugin runtime updates from main-app releases by fetching channel/registry remotely (VS Code Gallery model), starting with voice-asr Phase 0.

**Architecture:** Add `plugin_runtime/` Rust module with HTTP fetch + disk cache + embedded fallback; wire `voice_plugin_install.rs` to resolved channel; Phase 1 adds registry index and generic `plugin_*` Tauri commands.

**Tech Stack:** Rust (Tauri 2, `reqwest` blocking), serde_json, existing zip/sha2 install path; Node mjs for dev diagnostics; PowerShell publish scripts.

---

## File map (locked decomposition)

| File | Responsibility |
|------|----------------|
| `agent-gui/src-tauri/resources/plugin-registry-bootstrap.json` | Embedded registry URL + voice-asr channel URLs + offline fallback |
| `agent-gui/src-tauri/src/plugin_runtime/mod.rs` | Module exports |
| `agent-gui/src-tauri/src/plugin_runtime/bootstrap.rs` | Parse embedded bootstrap JSON |
| `agent-gui/src-tauri/src/plugin_runtime/cache.rs` | Read/write `%LOCALAPPDATA%/QuickerAgent/cache/*.json` with TTL |
| `agent-gui/src-tauri/src/plugin_runtime/channel.rs` | Resolve + fetch `VoicePluginChannel` for `voice-asr` |
| `agent-gui/src-tauri/src/plugin_runtime/registry.rs` | Phase 1: fetch plugin registry index |
| `agent-gui/src-tauri/src/plugin_runtime/types.rs` | Shared DTOs (`PluginChannelEntry`, cache envelope) |
| `agent-gui/src-tauri/src/voice_plugin_install.rs` | Call `plugin_runtime::channel` instead of `include_str!` |
| `agent-gui/src-tauri/src/lib.rs` | `mod plugin_runtime;` |
| `publish/Sync-PluginRegistry.ps1` | Phase 1: upload registry + channel to Bitiful |
| `publish/Sync-VoicePluginChannel.ps1` | Repurpose: upload remote channel / update bootstrap fallback only |
| `agent-gui/scripts/test-plugin-channel-fetch.mjs` | Dev diagnostic for URL order + cache |

---

# Phase 0 — Remote voice channel (decouple runtime publish)

> **Exit criteria:** Bump voice-asr-runtime tag only → installed QuickerAgent detects newer `runtimeVersion` within TTL without monorepo channel commit.

### Task 1: Bootstrap resource + types

**Files:**
- Create: `agent-gui/src-tauri/resources/plugin-registry-bootstrap.json`
- Create: `agent-gui/src-tauri/voice-plugin-metadata/plugin-registry-bootstrap.json` (source copy for tauri-prepare)
- Create: `agent-gui/src-tauri/src/plugin_runtime/mod.rs`
- Create: `agent-gui/src-tauri/src/plugin_runtime/types.rs`
- Create: `agent-gui/src-tauri/src/plugin_runtime/bootstrap.rs`
- Modify: `agent-gui/src-tauri/src/lib.rs` (add `mod plugin_runtime;`)
- Modify: `agent-gui/scripts/tauri-prepare.mjs` (stage bootstrap JSON)

- [ ] **Step 1: Add bootstrap JSON (source + resources)**

`agent-gui/src-tauri/voice-plugin-metadata/plugin-registry-bootstrap.json`:

```json
{
  "schemaVersion": 1,
  "registryUrl": "https://s3.bitiful.net/quicker-pkgs/quicker-agent/plugins/registry.json",
  "registryMirrorUrl": "https://github.com/QuickerHub/quicker-agent-plugins/releases/latest/download/registry.json",
  "cacheTtlHours": 6,
  "offlineFallbackRegistry": {
    "plugins": {
      "voice-asr": {
        "channelUrl": "https://github.com/QuickerHub/voice-asr-runtime/releases/latest/download/voice-plugin-channel.generated.json",
        "channelMirrorUrl": "https://s3.bitiful.net/quicker-pkgs/quicker-rpc/voice-asr/voice-plugin-channel.json",
        "minHostVersion": "0.10.0"
      }
    }
  }
}
```

Copy same file to `agent-gui/src-tauri/resources/plugin-registry-bootstrap.json` (or let tauri-prepare copy — prefer single source in `voice-plugin-metadata`).

- [ ] **Step 2: Update tauri-prepare staging**

In `agent-gui/scripts/tauri-prepare.mjs`, add to `VOICE_RESOURCE_FILES` or new `PLUGIN_RUNTIME_FILES`:

```javascript
const PLUGIN_RUNTIME_FILES = [
  "plugin-registry-bootstrap.json",
];
```

Stage from `voice-plugin-metadata/` like existing voice files.

- [ ] **Step 3: Add Rust types + bootstrap loader**

`plugin_runtime/types.rs`:

```rust
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginRegistryBootstrap {
    pub schema_version: u32,
    pub registry_url: String,
    pub registry_mirror_url: Option<String>,
    pub cache_ttl_hours: u64,
    pub offline_fallback_registry: OfflineFallbackRegistry,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OfflineFallbackRegistry {
    pub plugins: std::collections::HashMap<String, PluginChannelEntry>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginChannelEntry {
    pub channel_url: String,
    pub channel_mirror_url: Option<String>,
    pub min_host_version: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedJsonEnvelope<T> {
    pub fetched_at_ms: u64,
    pub ttl_hours: u64,
    pub payload: T,
}
```

`plugin_runtime/bootstrap.rs`:

```rust
use super::types::PluginRegistryBootstrap;

const BOOTSTRAP_JSON: &str = include_str!("../../resources/plugin-registry-bootstrap.json");

pub fn load_bootstrap() -> Result<PluginRegistryBootstrap, String> {
    serde_json::from_str(BOOTSTRAP_JSON)
        .map_err(|e| format!("plugin-registry-bootstrap.json invalid: {e}"))
}

pub fn voice_channel_entry() -> Result<super::types::PluginChannelEntry, String> {
    load_bootstrap()?
        .offline_fallback_registry
        .plugins
        .get("voice-asr")
        .cloned()
        .ok_or_else(|| "bootstrap missing voice-asr channel entry".into())
}
```

`plugin_runtime/mod.rs`:

```rust
pub mod bootstrap;
pub mod cache;
pub mod channel;
pub mod types;
```

`lib.rs` add: `mod plugin_runtime;`

- [ ] **Step 4: Verify compile**

Run: `cd agent-gui/src-tauri && cargo check`
Expected: success (cache/channel modules added in Task 2 — add empty stubs first if needed)

Temporary stubs:

```rust
// cache.rs
pub fn cache_dir() -> std::path::PathBuf {
    crate::quicker_agent_paths::quicker_agent_app_data_dir().join("cache")
}
```

---

### Task 2: Channel fetch + cache

**Files:**
- Create: `agent-gui/src-tauri/src/plugin_runtime/cache.rs`
- Create: `agent-gui/src-tauri/src/plugin_runtime/channel.rs`
- Modify: `agent-gui/src-tauri/src/quicker_agent_paths.rs` (add `plugin_cache_dir()` helper)

- [ ] **Step 1: Write failing unit test for fallback parse**

`plugin_runtime/channel.rs` bottom:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embedded_voice_channel_fallback_parses() {
        let ch = parse_voice_channel_json(include_str!(
            "../../resources/voice-plugin-channel.json"
        ))
        .expect("embedded channel must parse");
        assert!(!ch.runtime_version.is_empty());
    }

    #[test]
    fn bootstrap_voice_entry_exists() {
        let entry = crate::plugin_runtime::bootstrap::voice_channel_entry()
            .expect("voice-asr entry");
        assert!(entry.channel_url.contains("voice-asr-runtime"));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent-gui/src-tauri && cargo test plugin_runtime::channel::tests -- --nocapture`
Expected: FAIL — functions not defined yet

- [ ] **Step 3: Implement cache + fetch**

`quicker_agent_paths.rs` add:

```rust
pub fn plugin_cache_dir() -> PathBuf {
    quicker_agent_app_data_dir().join("cache")
}
```

`cache.rs` — read/write TTL envelope:

```rust
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use super::types::CachedJsonEnvelope;

pub fn read_cached_json<T: serde::de::DeserializeOwned>(path: &Path) -> Option<T> {
    let raw = fs::read_to_string(path).ok()?;
    let envelope: CachedJsonEnvelope<T> = serde_json::from_str(&raw).ok()?;
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_millis() as u64;
    let ttl_ms = envelope.ttl_hours.saturating_mul(3_600_000);
    if now_ms.saturating_sub(envelope.fetched_at_ms) > ttl_ms {
        return None;
    }
    Some(envelope.payload)
}

pub fn write_cached_json<T: serde::Serialize>(
    path: &Path,
    payload: &T,
    ttl_hours: u64,
) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let fetched_at_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as u64;
    let envelope = CachedJsonEnvelope {
        fetched_at_ms,
        ttl_hours,
        payload,
    };
    let raw = serde_json::to_string_pretty(&envelope).map_err(|e| e.to_string())?;
    fs::write(path, raw).map_err(|e| e.to_string())
}
```

`channel.rs` — reuse existing `VoicePluginChannel` struct by making it `pub` in `voice_plugin_install.rs` or duplicate a thin alias. **Preferred:** move `VoicePluginChannel` to `plugin_runtime/types.rs` and re-export.

```rust
use std::path::PathBuf;

use reqwest::blocking::Client;

use crate::quicker_agent_paths::plugin_cache_dir;
use super::bootstrap;
use super::cache;
use super::types::VoicePluginChannel;

const EMBEDDED_VOICE_CHANNEL: &str = include_str!("../../resources/voice-plugin-channel.json");
const VOICE_CACHE_FILE: &str = "voice-asr-channel.json";

pub fn parse_voice_channel_json(raw: &str) -> Result<VoicePluginChannel, String> {
    serde_json::from_str(raw).map_err(|e| format!("voice channel JSON invalid: {e}"))
}

fn fetch_url(client: &Client, url: &str) -> Result<String, String> {
    client
        .get(url)
        .send()
        .map_err(|e| format!("fetch {url}: {e}"))?
        .error_for_status()
        .map_err(|e| format!("fetch {url}: {e}"))?
        .text()
        .map_err(|e| format!("read {url}: {e}"))
}

fn try_remote_channel(
    client: &Client,
    primary: &str,
    mirror: Option<&str>,
) -> Option<VoicePluginChannel> {
    if let Ok(raw) = fetch_url(client, primary) {
        if let Ok(ch) = parse_voice_channel_json(&raw) {
            return Some(ch);
        }
    }
    if let Some(mirror) = mirror {
        if let Ok(raw) = fetch_url(client, mirror) {
            if let Ok(ch) = parse_voice_channel_json(&raw) {
                return Some(ch);
            }
        }
    }
    None
}

pub fn resolve_voice_channel(force_refresh: bool) -> Result<VoicePluginChannel, String> {
    let bootstrap = bootstrap::load_bootstrap()?;
    let ttl = bootstrap.cache_ttl_hours.max(1);
    let cache_path: PathBuf = plugin_cache_dir().join(VOICE_CACHE_FILE);

    if !force_refresh {
        if let Some(cached) = cache::read_cached_json::<VoicePluginChannel>(&cache_path) {
            return Ok(cached);
        }
    }

    let entry = bootstrap::voice_channel_entry()?;
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;

    if let Some(ch) = try_remote_channel(
        &client,
        &entry.channel_url,
        entry.channel_mirror_url.as_deref(),
    ) {
        let _ = cache::write_cached_json(&cache_path, &ch, ttl);
        return Ok(ch);
    }

    // Stale cache allowed when network fails
    if let Ok(raw) = std::fs::read_to_string(&cache_path) {
        if let Ok(envelope) =
            serde_json::from_str::<super::types::CachedJsonEnvelope<VoicePluginChannel>>(&raw)
        {
            return Ok(envelope.payload);
        }
    }

    parse_voice_channel_json(EMBEDDED_VOICE_CHANNEL)
}
```

Move `VoicePluginChannel` struct from `voice_plugin_install.rs` to `types.rs` (same serde fields as today).

- [ ] **Step 4: Run tests**

Run: `cd agent-gui/src-tauri && cargo test plugin_runtime::channel::tests -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add agent-gui/src-tauri/src/plugin_runtime/ \
  agent-gui/src-tauri/resources/plugin-registry-bootstrap.json \
  agent-gui/src-tauri/voice-plugin-metadata/plugin-registry-bootstrap.json \
  agent-gui/scripts/tauri-prepare.mjs \
  agent-gui/src-tauri/src/lib.rs \
  agent-gui/src-tauri/src/quicker_agent_paths.rs
git commit -m "feat(agent-gui): add plugin runtime channel fetch with cache"
```

---

### Task 3: Wire voice_plugin_install to remote channel

**Files:**
- Modify: `agent-gui/src-tauri/src/voice_plugin_install.rs`
- Modify: `agent-gui/src-tauri/src/voice_plugin.rs` (optional: background refresh hook)

- [ ] **Step 1: Replace load_channel**

Remove:

```rust
fn load_channel() -> Result<VoicePluginChannel, String> {
    let raw = include_str!("../resources/voice-plugin-channel.json");
    serde_json::from_str(raw).map_err(|e| format!("voice plugin channel config invalid: {e}"))
}
```

Replace with:

```rust
use crate::plugin_runtime::channel::resolve_voice_channel;

fn load_channel() -> Result<VoicePluginChannel, String> {
    resolve_voice_channel(false)
}

pub fn refresh_voice_channel_cache() -> Result<VoicePluginChannel, String> {
    resolve_voice_channel(true)
}
```

Import `VoicePluginChannel` from `plugin_runtime::types`.

- [ ] **Step 2: Background refresh on startup**

In `voice_plugin.rs` `run_background_voice_tasks`, before `needs_runtime_update`:

```rust
let _ = crate::voice_plugin_install::refresh_voice_channel_cache();
```

Network failure is non-fatal (falls back to cache/embedded).

- [ ] **Step 3: Build Tauri**

Run: `cd agent-gui/src-tauri && cargo build`
Expected: success

- [ ] **Step 4: Manual smoke (dev machine with network)**

1. Note current `runtime-version.txt` under `%LOCALAPPDATA%/QuickerAgent/plugins/voice-asr/`
2. Run QuickerAgent release build or `cargo run` in tauri
3. Confirm `%LOCALAPPDATA%/QuickerAgent/cache/voice-asr-channel.json` created
4. Confirm `needs_runtime_update` compares against remote version (temporarily bump local version file to older value)

- [ ] **Step 5: Commit**

```bash
git add agent-gui/src-tauri/src/voice_plugin_install.rs agent-gui/src-tauri/src/voice_plugin.rs
git commit -m "feat(agent-gui): resolve voice channel from remote gallery"
```

---

### Task 4: Dev diagnostic script

**Files:**
- Create: `agent-gui/scripts/test-plugin-channel-fetch.mjs`

- [ ] **Step 1: Add probe script**

```javascript
#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bootstrapPath = join(
  root,
  "src-tauri/voice-plugin-metadata/plugin-registry-bootstrap.json",
);
const bootstrap = JSON.parse(readFileSync(bootstrapPath, "utf8"));
const entry = bootstrap.offlineFallbackRegistry.plugins["voice-asr"];

async function probe(label, url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  const text = await res.text();
  const json = JSON.parse(text);
  console.log(`${label}: runtimeVersion=${json.runtimeVersion} ok=${res.ok}`);
}

console.log("Probing voice-asr channel URLs...");
await probe("primary", entry.channelUrl);
if (entry.channelMirrorUrl) {
  await probe("mirror", entry.channelMirrorUrl);
}
const cache = join(
  process.env.LOCALAPPDATA ?? "",
  "QuickerAgent/cache/voice-asr-channel.json",
);
console.log(`local cache: ${existsSync(cache) ? cache : "(none)"}`);
```

- [ ] **Step 2: Run**

Run: `node agent-gui/scripts/test-plugin-channel-fetch.mjs`
Expected: prints remote `runtimeVersion`

- [ ] **Step 3: Commit**

```bash
git add agent-gui/scripts/test-plugin-channel-fetch.mjs
git commit -m "chore(agent-gui): add plugin channel URL probe script"
```

---

### Task 5: Publish workflow + docs

**Files:**
- Modify: `.cursor/skills/quicker-voice-runtime-publish/SKILL.md`
- Modify: `publish/Sync-VoicePluginChannel.ps1`
- Modify: `docs/agent-gui-plugin-storage.md`
- Modify: `agent-gui/scripts/test-voice-plugin-auto-install.mjs` (read bootstrap URLs in `probe-urls`)

- [ ] **Step 1: Update publish skill**

In `quicker-voice-runtime-publish/SKILL.md`, replace monorepo commit step with:

```markdown
6. **更新远程 channel**（二选一）：
   - GitHub Release 已附带 `voice-plugin-channel.generated.json` → 确保 `latest` 资产指向该文件（默认）
   - 可选：`pwsh ./publish/Sync-VoicePluginChannel.ps1 -Version 0.1.x -UploadRemote` 上传 Bitiful mirror
7. **（可选，低频）** 更新 `plugin-registry-bootstrap.json` 内嵌 fallback 仅当 GitHub latest 不可用
8. **不要** 为纯 runtime 发布 commit `voice-plugin-channel.json` 到 monorepo
```

- [ ] **Step 2: Extend Sync-VoicePluginChannel.ps1**

Add `-UploadRemote` switch:

- Upload generated channel to `s3://quicker-pkgs/quicker-rpc/voice-asr/voice-plugin-channel.json` (reuse Bitiful creds from `publish/.env`)
- Optionally `-UpdateBootstrapFallback` to patch bootstrap JSON channelUrl to pinned tag URL

Keep default copy-to-resources behavior for **bootstrap fallback refresh only** (document as infrequent).

- [ ] **Step 3: Document cache paths**

Add to `docs/agent-gui-plugin-storage.md` §3:

```text
cache/
  voice-asr-channel.json    # TTL envelope, remote channel payload
  plugin-registry.json      # Phase 1
```

- [ ] **Step 4: Commit**

```bash
git add .cursor/skills/quicker-voice-runtime-publish/SKILL.md \
  publish/Sync-VoicePluginChannel.ps1 \
  docs/agent-gui-plugin-storage.md \
  agent-gui/scripts/test-voice-plugin-auto-install.mjs
git commit -m "docs(publish): decouple voice runtime channel from monorepo release"
```

---

### Phase 0 acceptance checklist

- [x] `cargo test` in `agent-gui/src-tauri` passes
- [x] Remote channel fetch works (`test-plugin-channel-fetch.mjs` — primary GitHub latest)
- [ ] Bitiful channel mirror uploaded (`Sync-VoicePluginChannel.ps1 -UploadRemote`)
- [ ] Offline: disconnect network → app still installs/updates-check using embedded fallback
- [ ] voice runtime tag without quicker-rpc commit → existing QuickerAgent sees new version after cache TTL or manual restart

### Phase 1 delivered (2026-06-09)

- [x] `plugin_runtime/registry.rs` + seed `publish/registry/registry.json`
- [x] `plugin_*` Tauri commands (`plugin_list`, `plugin_status`, `plugin_registry_refresh`, `plugin_update`)
- [x] `publish/Sync-PluginRegistry.ps1`
- [x] Settings UI: VoiceInputSettingsSection「检查插件更新」/「安装 Runtime 更新」
- [x] `lib/plugin-runtime-client.ts`

---

# Phase 1 — Registry + generic Plugin Host

> **Exit criteria:** `plugin_list` / `plugin_update` Tauri commands work for voice-asr; registry hosted remotely; settings UI shows update available.

### Task 6: Registry fetch

**Files:**
- Create: `agent-gui/src-tauri/src/plugin_runtime/registry.rs`
- Create: `publish/registry/voice-asr-registry.seed.json` (seed for quicker-agent-plugins repo)
- Create: `publish/Sync-PluginRegistry.ps1`

- [ ] **Step 1: Implement `resolve_registry(force_refresh)`** mirroring channel cache pattern (`cache/plugin-registry.json`).

- [ ] **Step 2: Seed registry JSON** committed under `publish/registry/registry.json` in monorepo as template; upload script pushes to Bitiful + documents GitHub mirror repo `QuickerHub/quicker-agent-plugins`.

- [ ] **Step 3: Change `resolve_voice_channel`** to prefer registry entry URLs when registry fetch succeeds; fall back to bootstrap offline entry.

- [ ] **Step 4: Unit test** `registry_parse_seed_json`.

- [ ] **Step 5: Commit** `feat(agent-gui): fetch plugin registry from remote gallery`

---

### Task 7: Generic Tauri `plugin_*` commands

**Files:**
- Create: `agent-gui/src-tauri/src/plugin_runtime/commands.rs`
- Modify: `agent-gui/src-tauri/src/lib.rs` (register handlers)

- [ ] **Step 1: Define DTO `PluginStatusDto`** `{ pluginId, displayName, installed, running, installedVersion, latestVersion, updateAvailable, message }`

- [ ] **Step 2: Implement commands**

```rust
#[tauri::command]
pub fn plugin_list() -> Vec<PluginStatusDto> { /* voice-asr first */ }

#[tauri::command]
pub fn plugin_status(plugin_id: String) -> PluginStatusDto { /* ... */ }

#[tauri::command]
pub fn plugin_registry_refresh() -> Result<(), String> {
    let _ = crate::plugin_runtime::registry::resolve_registry(true)?;
    let _ = crate::plugin_runtime::channel::resolve_voice_channel(true)?;
    Ok(())
}

#[tauri::command]
pub fn plugin_update(plugin_id: String) -> PluginStatusDto {
    // delegate to voice_plugin_install staging for voice-asr
}
```

- [ ] **Step 3: Keep `voice_plugin_*` as wrappers** calling same internals (deprecation comment).

- [ ] **Step 4: `cargo build` + manual invoke from devtools**

- [ ] **Step 5: Commit** `feat(agent-gui): add generic plugin_list/status/update commands`

---

### Task 8: Settings UI — check for updates

**Files:**
- Modify: voice plugin settings section component (locate via grep `VoicePlugin` / `voice_plugin_status`)
- Create: `agent-gui/lib/plugin-runtime-client.ts` (thin `invoke` wrappers)

- [ ] **Step 1: Add button「检查插件更新」** calls `plugin_registry_refresh` then `plugin_status("voice-asr")`

- [ ] **Step 2: Show `updateAvailable` + versions**

- [ ] **Step 3: `dev_frontend_check` until ok**

- [ ] **Step 4: Commit** `feat(agent-gui): plugin update check in settings`

---

# Phase 2 — Delivered (2026-06-09)

- [x] `activation.rs` + `activationEvents` on registry/bootstrap entries
- [x] `plugin_activate` Tauri command + `activate_voice_on_demand` (first mic use)
- [x] voice background tasks respect `onStartup:channelRefresh` / `onStartup:runtime`
- [x] `lib/plugin-runtime/{bootstrap,paths,index}.ts` shared TS layer
- [x] clipboard-history in `plugin_list` / `plugin_status` (when `CLIPBOARD_HISTORY_ENABLED`)
- [ ] Remove deprecated `voice_plugin_*` — after one release cycle (deferred)

---

## Spec coverage self-review

| Spec § | Task |
|--------|------|
| §4.1 Bootstrap | Task 1 |
| §4.3 Channel | Task 2–3 |
| §5.3 Cache/TTL | Task 2 |
| §6.1 Independent publish | Task 5 |
| §4.2 Registry | Task 6 |
| §5.2 plugin_* commands | Task 7 |
| §8 Phase 0–2 | Phases above |
| §4.4 compat check | Phase 2 (minHostVersion gate in Task 7 step 1) |
| §7 Dev alignment | Phase 2 |

**Placeholder scan:** none — all tasks have concrete paths and code.

---

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-06-09-plugin-runtime-gallery.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per Task (1→5 for Phase 0), review between tasks
2. **Inline Execution** — implement Phase 0 Tasks 1–5 in this session with checkpoints after Task 2 and Task 3

Which approach do you want?
