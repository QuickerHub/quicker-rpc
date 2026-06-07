## Checklist（工作区）

```text
- [ ] target + id（+ subProgramId?）与磁盘目录一致
- [ ] 非空程序体：先 get 再改盘；新建后勿再 get
- [ ] 改 data.json：read_data / edit_data / write_data（勿 file_* 改 data.json）
- [ ] 长脚本/字符串（>4 行）：files/ + "file": "files/…"
- [ ] 保存：仅 workspace_program patch（勿 --patch-file / 内联 op JSON）
- [ ] patch 后：以 editVersion / projectSummary 为准；可选 diagnostics
```
