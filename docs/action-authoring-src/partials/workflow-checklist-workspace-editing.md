### Checklist

```text
- [ ] target + id (+ subProgramId?) matches disk path
- [ ] non-empty body: get before edit; after create NO re-get
- [ ] data.json: read_data / edit_data / write_data (NOT file_* on data.json)
- [ ] long script (>4 lines): `paramKey.file` → files/
- [ ] save: workspace_program patch OR CLI --patch-file (pick one path)
- [ ] post-patch: trust editVersion; optional diagnostics
```
