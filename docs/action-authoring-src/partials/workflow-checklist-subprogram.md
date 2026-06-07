## Checklist

### A. 管理公共子程序

```text
- [ ] subprogram search/get → callIdentifier / editVersion
- [ ] workspace_program 改 .quicker/subprograms/…/data.json（+ files/）
- [ ] workspace_program patch (target=global_subprogram)
- [ ] 勿 subprogram patch --patch-file（Agent）
```

### B. 在动作里调用

```text
- [ ] subprogram get → callIdentifier（须 %%{guid}）
- [ ] step-runner get (sys:subprogram) — 禁止猜 inputParams 键名
- [ ] workspace_program edit_data 写入步骤 → patch (target=action)
```
