# Source bundle 本地文档协议

`source.document` 为已有 `action open` 导出的 bundle 提供编辑器文档视图，复用原
`program.source.yaml`、`files/`、`quicker.source.json` 和 `.qkrpc/baseline.json`。
它与[原 V1 编写工作流](../cli-commands.md#本地编写工作流)共用同一 YAML codec；
直接编辑 YAML/资源后再 `action save` 的流程继续有效，不创建第二份 `data.json` 或持久 dirty 状态。

## 读取、预览和本地保存

| mode | 行为 |
|---|---|
| `inspect` | 读取当前本地 bundle，返回完整 Editor JSON 文本、原 YAML 文本和字节快照 |
| `preview` | 校验候选正文及资源，返回规范化后的 YAML 和待提交正文指纹；不写文件 |
| `save-local` | 保存 YAML 与明确提交的 `files/` 资源；不写身份 sidecar 或原生 checkpoint |

三种模式都在宿主选择、发现和连接之前完成，不调用原生动作或模型。返回的绑定是 bundle
内已有的身份记录，并未重新核验当前宿主；快照和本地可编辑性都不授予宿主写权限。
根动作身份和 metadata 只读，不能借完整 JSON 文档修改。

HTTP 使用 `POST /v1/invoke`，请求为 `{"op":"source.document","args":{...}}`。
CLI 固定使用 `qkrpc source document --json`，stdin 只传 `args` 对象，stdout 为同一响应封套。
正文不得通过 shell 参数传递。PowerShell 示例：

```powershell
'{"dir":"D:/owned/action","mode":"inspect"}' | qkrpc source document --json
Get-Content -LiteralPath .tmp/source-document-request.json -Raw -Encoding utf8 | qkrpc source document --json
```

预览请求文件的结构如下；将占位文本替换为当前文档和实际资源字节：

```json
{
  "dir": "D:/owned/action",
  "mode": "preview",
  "expectedSnapshot": "sha256:<inspect 返回的 sourceSnapshot.revision>",
  "editorJson": "<本次完整 lossless Editor JSON 文本>",
  "baselineEditorJson": "<上次确认的完整 Editor JSON 文本>",
  "resources": [
    { "path": "files/script.cs", "contentBase64": "<资源字节的 Base64>" }
  ]
}
```

`save-local` 使用同一请求形状。没有资源变更时可省略 `resources` 或传空数组；只写明确提交
的资源，不删除其它文件。路径必须是受控 bundle 内的相对 `files/` 路径，不接受 sidecar、
目录跳转或重定向路径。

`editorJson` 是现 GUI 文档 wire 的 JSON **字符串**，不是原生 PascalCase Body、CAW 对象
或经过 generated editor types 重建的摘要。内层正文须通过已有 lossless JSON/document
controller 处理，保留未知字段、精确数值和文件引用；不能用普通 `JSON.parse` 的数值结果
再导出整份正文。外层请求可以按普通 JSON 封装这些文本字符串。

`baselineEditorJson` 是可选协议字段；维持现有编辑 Session 的 GUI ID 时应传上次确认的完整
工作文档，首次可使用 `inspect` 返回的 `editorJson`。服务重新生成私有映射，并验证候选基线
逆映射后与当前 raw source 完整一致；只容纳已证明的 GUI 身份和已知结构默认值差异。
它不能省略未知字段、改变数值或重映射真实来源身份，也不是客户端可任意指定的 identity map。

本地保存确认中的 `editorJson` 保留原样提交的工作文档及其 GUI ID。调用方更新存储快照和
保存基线即可；若 Session 在保存期间已有新草稿，不能用确认文档或一次新的投影替换它。
下一次保存使用确认后的快照与基线，提交当时的最新完整草稿。

## 快照和未同步状态

`preview` / `save-local` 必须提供 `expectedSnapshot`。`sourceSnapshot.revision` 由原始 YAML、
身份与 checkpoint、所有 `files/` 字节及实际 codec revision 共同形成；mtime、editVersion
或 dirty 布尔值都不能替代。字节或 codec 变化会返回 `SOURCE_SNAPSHOT_CONFLICT`，应重新
inspect 并协调草稿，不覆盖新内容。

`pending.status` 把当前资源展开并编译后的可编辑正文与工具管理的 native checkpoint 比较，
结果为 `clean` 或 `pending`。它不查询当前宿主，`nativeState` 仍为 `unobserved`。仅改注释、
换行或源文件排版也会改变快照，但未必改变编译正文或 pending 状态。

正文语义不变时保留原 YAML 字节，包括注释、BOM 和 CRLF；正文改变时使用原 codec 编码，
并报告 `codec-normalized`。资源仍仅按本次明确提交的内容写入。多文件保存使用现有项目 lease
和逐次字节核验，不承诺对任意外部 writer 的原子文件系统事务。`SOURCE_DOCUMENT_PARTIAL`
会列出已写文件与失败文件；保留这些结果，重新读取核对，不能自动重放整个请求。

## 身份和可表示范围

已有 source/native 变量真实 ID 保留原语义；GUI 补的变量 ID 只用于文档行身份，不进入原生
字段。只有真实 native 或 checkpoint 身份已配对时，才能在改变量 key 后保留原生未知字段。
既有 V1 变量的 source/native 都没有可证明身份时，改名返回
`SOURCE_DOCUMENT_UNSUPPORTED`，不按数组位置猜测，也不新建持久身份协议。仅在当前 YAML
新加一个未配对 ID，不能证明它对应旧的无 ID native 变量。

当前 GUI 无法无损显示的输入、输出绑定或变量默认值会明确拒绝，不把对象等值投影为空串。
例如可编辑输入是字符串字面值、变量引用或文件引用；复杂或非字符串默认值不在本端口的
可表示范围。未知扩展字段中的精确数值、null 和结构继续保留。内部调用的目标和 I/O 名称
通过同一私有映射可逆转换，文件引用不因 inspect 而替换成正文。

## 显式同步到原宿主

`save-local` 不推进 `.qkrpc/baseline.json`，也不表示 Quicker 已保存。需要同步时显式调用
原 `action save`，保留其绑定、editVersion、Designer 和存储身份检查：

```powershell
qkrpc action save --dir D:/owned/action --expected-source-snapshot '<最新 sourceSnapshot.revision>' --dry-run --json
qkrpc action save --dir D:/owned/action --expected-source-snapshot '<同一 revision>' --json
```

HTTP 为 `action.save` 的 `expectedSnapshot` 参数。CLI 的 `--expected-source-snapshot` 为兼容
既有调用保留可选，新文档流程应携带它；提供空值也不能绕过快照检查。dry-run 仍完全离线。
实际同步只消费一次固定准备的正文、资源和身份，返回 `consumedSnapshot` 与
`consumedBodyHash`。连接或保存期间的新源文件修改不替换这份正文，checkpoint 也不覆盖这些
用户修改；它们留给下一轮，重新 inspect 后按实际正文判断 pending。

宿主保存与本地 checkpoint 分别报告，不能只看最外层 `ok`：

| 结果事实 | 含义与处理 |
|---|---|
| `persisted: true` | 已确认宿主落盘；还需检查身份确认与 checkpoint 是否成功 |
| `persisted: false` | 明确报告未落盘/拒绝，不推进 checkpoint |
| `persisted: null` 或缺少确认 | 落盘事实未知；缺字段或连接失败不能解释成未写入 |

完整成功包含 `hostSaveStatus: confirmed` 和 `checkpointStatus: updated`。宿主已落盘但
checkpoint 失败返回 `SOURCE_CHECKPOINT_FAILED`；应核对原宿主并重新 open 到新目录恢复。
确认身份或版本不完整时返回 `SOURCE_SAVE_ACK_INVALID`，不推进 checkpoint；
`WRITE_RESULT_UNKNOWN` 保留未知状态。这些情况都不能自动重发写入，也不能凭本地 snapshot
推断原生写权限。该协议本身不证明 V2 正文能力、GUI 已完成接线、真实动作写回或用户资料升级验收。

返回：[动作编写文档](README.md) · [CLI 导航](../cli-commands.md)
