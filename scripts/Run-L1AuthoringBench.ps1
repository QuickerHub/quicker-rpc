# L1 authoring-tasks smoke (meta-create-icon, meta-rename-only, single-msgbox)
# Requires Quicker + plugin. Deletes temp actions on success.
param([switch]$Keep)

$ErrorActionPreference = "Stop"
$repo = Resolve-Path (Join-Path $PSScriptRoot "..")
$cliCandidates = @(
    (Join-Path $repo "publish\cli-new\qkrpc.exe"),
    (Join-Path $repo "publish\cli-test-net10\qkrpc.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\qkrpc\qkrpc.exe")
)
$Cli = $cliCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $Cli) { throw "qkrpc.exe not found; run build.ps1 -t first" }

function Invoke-QkrpcJson([string[]]$CommandArgs) {
    $raw = & $Cli @CommandArgs 2>&1 | Out-String
    if ([string]::IsNullOrWhiteSpace($raw)) {
        throw "empty qkrpc output: $($CommandArgs -join ' ')"
    }
    $line = ($raw -split "`n" | Where-Object { $_.TrimStart().StartsWith("{") } | Select-Object -Last 1)
    if (-not $line) {
        throw "no JSON line in qkrpc output: $raw"
    }
    return $line | ConvertFrom-Json
}

Write-Host "Waiting for Quicker RPC..."
$wait = Invoke-QkrpcJson @("wait", "--timeout", "60", "--json")
if (-not $wait.ok) {
    throw "qkrpc wait failed: $($wait.message)"
}

$created = @()

# meta-create-icon
$meta = Invoke-QkrpcJson @(
    "action", "create",
    "--title", "_agent_benchmark_meta",
    "--description", "benchmark 元数据测试",
    "--icon", "fa:Light_Clipboard",
    "--json"
)
if (-not $meta.ok) { throw "meta create failed" }
$metaId = $meta.payload.actionId
$created += $metaId
Write-Host "meta-create-icon: $metaId editVersion=$($meta.payload.editVersion)"

# single-msgbox
$msg = Invoke-QkrpcJson @(
    "action", "create",
    "--title", "__bench_l1_msgbox",
    "--description", "L1 single MsgBox benchmark",
    "--json"
)
if (-not $msg.ok) { throw "msgbox create failed" }
$msgId = $msg.payload.actionId
$msgEv = $msg.payload.editVersion
$patchFile = Join-Path $repo ".local\patch-l1-single-msgbox.json"
$patch = Invoke-QkrpcJson @(
    "action", "patch",
    "--id", $msgId,
    "--patch-file", $patchFile,
    "--expected-edit-version", "$msgEv",
    "--json"
)
if (-not $patch.ok) { throw "msgbox patch failed" }
$created += $msgId
Write-Host "single-msgbox: $msgId patched"

# meta-rename-only (rename msgbox action)
$minute = Get-Date -Format "HHmm"
$renameTitle = "_benchmark_rename_$minute"
$rename = Invoke-QkrpcJson @(
    "action", "set-metadata",
    "--id", $msgId,
    "--title", $renameTitle,
    "--expected-edit-version", "$($patch.payload.editVersion)",
    "--json"
)
if (-not $rename.ok) { throw "rename failed" }
Write-Host "meta-rename-only: $msgId -> $renameTitle"

# cleanup (keep meta for manual verify unless -Keep)
if (-not $Keep) {
    foreach ($id in $created) {
        $del = Invoke-QkrpcJson @("action", "delete", "--id", $id, "--json")
        Write-Host "deleted $id ok=$($del.ok)"
    }
}

@{
    ok           = $true
    metaCreateId = $metaId
    msgboxId     = $msgId
    renameTitle  = $renameTitle
} | ConvertTo-Json
