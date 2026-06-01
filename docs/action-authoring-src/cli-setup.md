# {{#ref cli-setup.title}}
## P0 环境
{{#ref cli-setup.intro}}
{{#only-cli}}
```powershell
{{@ help}}
{{@doc overview}}
{{@doc authoring-workflow}}
```
{{/only-cli}}
{{#only-agent}}
{{#ref cli-setup.agent.p0}}
{{/only-agent}}
## 最小编辑链（P1→P6）
{{#only-cli}}
```powershell
{{@ action.list query=keyword}}
{{@ action.get.full id=guid}}
{{@ step-runner.get key=stepRunnerKey}}
{{@ action.patch}}
```
{{#ref patch.stdin.hint}}
{{/only-cli}}
{{#only-agent}}
```text
{{@ action.list query=keyword}}
{{@ action.get.full id=guid}}
{{@ step-runner.get key=stepRunnerKey}}
{{@ action.patch}}
```
{{/only-agent}}
## 专题
`overview` · `authoring-workflow` · `patch-workflow` · `action-icons` · `xaction-json` · `variables` · `expressions` · `step-modules` · `step-runner-search` · `implementation-fallback`
