## Checklist (Pub0–Pub4 — Agent scope)

```text
- [ ] Pub0  finish authoring (P7) — program saved, editVersion trusted
- [ ] Pub1  preflight — `action publish --preflight`; run/debug; metadata (title, description, icon if public)
- [ ] Pub2  detect mode — first publish vs update (sharedActionId / shared GUID)
- [ ] Pub3  first publish — title + description + tags; **never** `--share-note`/`note` (deprecated 备注)
- [ ] Pub3b action page HTML — qkagent `page.html` → `info.html` → `apply --dir` (or `--html-file` on first publish)
- [ ] Pub4  update — changelog required; same tool as publish
- [ ] Pub5  OUT OF SCOPE — 动作说明 HTML = qkagent / built-in automation; Agent must not run shared-info autonomously
```
