# V1 action YAML source

**Default for editing an existing V1 action through qkrpc CLI/MCP or QuickerAgent.**
V2 actions use Quicker's native MCP. Creating actions, metadata changes, and
global subprograms retain their existing commands. Compatibility `.quicker` JSON
projects continue to use `workspace_program`; do not mix their layout with this bundle.

## Open → edit → dry-run → save

```text
qkrpc_action_open({ id: "<guid>", dir: ".tmp/quicker/edit-action" })
# Read/edit program.source.yaml and files/ with the host's file tools.
qkrpc_action_save({ dir: ".tmp/quicker/edit-action", dryRun: true })
qkrpc_action_save({ dir: ".tmp/quicker/edit-action", dryRun: false })
```

- Resolve the local action GUID first; a shared action GUID is not necessarily that ID.
- `dir` is explicit. Use a new/empty directory, such as `.tmp/quicker/edit-action`.
  Open rejects a nonempty directory to protect unsaved edits.
- In QuickerAgent, use a subdirectory inside sidebar cwd, outside `.quicker/`.
  Open writes bundle files, so both tools require Agent mode. Read the returned
  `program.source.yaml` with `Read`; edit YAML/resources with `StrReplace` or `Write`.
  These file tools protect `quicker.source.json` and `.qkrpc/baseline.json` from writes.
  A dedicated YAML editor or second project workspace is not needed.
- Open reads the running V1 action and writes a source bundle. V2 is rejected.
- Dry-run is offline: decode, compile, file checks, and codec roundtrip; it writes
  neither the live action nor the bundle's saved baseline. It does not prove the action runs successfully.
- Save repeats validation, checks the stored `editVersion`, and writes to the
  original V1 action. An open Designer or concurrent edit blocks writeback.
  Keep the edited bundle, open the current action into another directory, and
  reconcile changes before saving again. There is no force-save in this workflow.
- QuickerAgent requires an explicit `dryRun` boolean: validate with `true`, then
  save with `false`. Offline validation remains available when the V1 plugin is
  disconnected; open and actual save respect the `qkrpc_wait` connectivity gate.
- Open/save are single transport attempts. A timeout does not confirm whether a
  write happened; inspect the result rather than automatically retrying. If save
  returns `SOURCE_CHECKPOINT_FAILED` with `persisted=true`, the action was saved
  but the local baseline was not updated. Keep the edited directory, open into
  another empty directory, and reconcile before saving again.
- Successful save updates the bundle baseline/version without rewriting your
  YAML or resource files. Reuse this directory for the next edit. Run with trace
  when behavior needs verification; do not reopen into the edited directory.
- Save changes the local program body; it does not publish a shared action.

## Bundle boundaries

```text
<dir>/
  program.source.yaml       # editable program body
  files/                    # editable external resources
  quicker.source.json       # action identity + editVersion; tool-managed
  .qkrpc/baseline.json       # original native snapshot; internal, read-only
```

`quicker.source.json` uses `quicker.source-bundle.v1` and records `actionId`,
`kind`, `editVersion`, `title`, and `readSource`. Preserve it and the baseline.
They bind the source to its original action and protect concurrent/unsupported
native data. Do not copy these files between unrelated actions or hand-edit them.
There is no `info.yaml` in this bundle; change metadata through existing metadata commands.
Legacy `.quicker/*/data.json` projects are a separate format, not this bundle's edit surface.

## YAML source

```yaml
$schema: quicker.program.source.v1
variables:
  - key: title
    varType: text
    default: "会议纪要"
steps:
  - key: sys:notify
    inputs:
      msg:
        var: title
```

`ProgramSourceCodec` maps YAML to canonical agent wire (CAW), then the V1
compiler maps wire back to the native action. Codec roundtrip concerns CAW,
not native bytes; native preservation is checked separately against the baseline.
Validation failures must be resolved before save. Keep unrelated steps, variables,
embedded helpers, and fields from the opened source intact.

### Steps and control flow

- S0 always uses `key` / `inputs` / `outputs`, with `ifSteps` / `elseSteps` for
  child steps. Query `step-runner search` → `step-runner get` before adding or
  changing runner inputs; never infer keys from the short name.
- M3 short names strip `sys:`: `notify: hello` supplies its primary `msg` input;
  mapping bodies contain inputs. Only use scalar inputs or `>>` outputs when the
  runner has the corresponding primary field. Use S0 when unsure.
- S1 `if` uses `condition`, `then`, and optional `else`; `each` uses `input`,
  optional `outputs`, and `then`. Their bodies are step lists. Additions to a
  step such as `note`, `disabled`, or `delayMs` belong on an S0 step.
- V1 runner availability and schema remain authoritative. YAML compatibility
  does not make a V2-only runner available in V1.

```yaml
steps:
  - if:
      condition: "$=!string.IsNullOrWhiteSpace({title})"
      then:
        - notify:
            msg:
              var: title
      else:
        - notify: "empty"
```

### Values and resources

Use indented block mappings/lists. Bind the whole parameter with one of `var`,
`file`, `expr`, `interp`, or `lit`. Avoid YAML flow maps, anchors, aliases, and
merge keys. Binds cannot be nested inside an object snapshot; wrap a literal
object containing reserved bind keys in `lit`.

```yaml
inputs:
  expression:
    file: files/count.eval.cs
  input:
    var: title
```

- `$=` expressions and `$$` interpolation retain their existing meaning; quote
  them in YAML. Literal text containing `{name}` alone is not interpolation.
- Declare variables read/written by steps and output bindings. Preserve existing
  `varType` and defaults; use the V1 schema, not V2-only variable types.
- Keep long C#/HTML/form content in `files/`. References are bundle-relative;
  do not use absolute paths or `..` to escape the bundle. Codec operations
  preserve resource bytes; editing a resource intentionally changes its value.
- Embedded `subPrograms` remain in the owning source tree. This release does not
  add YAML open/save for standalone global subprograms.

## Knowledge routing

| Need | Read/query |
|------|------------|
| YAML syntax, bundle/save diagnostics | this topic (`program-source`) |
| Exact V1 runner parameters | `step-runner-search` → `step-runner-get` |
| `$=` / `$$` / expression modules | `expressions`, `implementation-fallback` |
| Module-specific behavior | `step-modules` and its referenced deep docs |
| Legacy JSON patch/workspace | `action-data-schema`, `workspace-editing`, `patch-workflow` |
| Global subprogram editing/sharing | `subprogram-workflow` |

Examples in older module references may use JSON wire. Translate their structure
to S0 YAML, preserving the schema's exact parameter names and bind semantics.
Do not mix the old project layout or patch payload with a source bundle.
