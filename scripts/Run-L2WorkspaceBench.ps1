# L2/L3 authoring-tasks smoke (disk apply, regression, subprogram call)
param([switch]$KeepSubprogramBench)

$ErrorActionPreference = "Stop"
$repo = Resolve-Path (Join-Path $PSScriptRoot "..")
$cliCandidates = @(
    (Join-Path $repo "publish\cli-new\qkrpc.exe"),
    (Join-Path $repo "publish\cli-test-net10\qkrpc.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\qkrpc\qkrpc.exe")
)
$Cli = $cliCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $Cli) { throw "qkrpc.exe not found" }

function Invoke-QkrpcLine([string[]]$CommandArgs) {
    $raw = (& $Cli @CommandArgs 2>&1 | Out-String).Trim()
    $line = ($raw -split "`n" | Where-Object { $_.TrimStart().StartsWith("{") } | Select-Object -Last 1)
    if (-not $line) { throw "no JSON from: $($CommandArgs -join ' ')`n$raw" }
    return $line
}

function Get-Regex([string]$line, [string]$pattern) {
    if ($line -match $pattern) { return $Matches[1] }
    return $null
}

Write-Host "wait..."
$null = Invoke-QkrpcLine @("wait", "--timeout", "30", "--json")

$httpId = "3a59e44b-01f2-4ae1-b50a-97a6b147212f"
$wsDir = Join-Path $repo ".local\ws-l2-http-bench"
$metaId = "61f5d8ef-baa0-4025-a14d-935a1ee0aa41"

# extract fresh
if (Test-Path $wsDir) { Remove-Item $wsDir -Recurse -Force }
$null = Invoke-QkrpcLine @("action", "extract", "--id", $httpId, "--dir", $wsDir, "--json")
$info = Get-Content (Join-Path $wsDir "info.json") -Raw | ConvertFrom-Json
$dataPath = Join-Path $wsDir "data.json"
$data = Get-Content $dataPath -Raw | ConvertFrom-Json
$delayStep = [ordered]@{
    stepRunnerKey = "sys:delay"
    inputParams   = @{ delayMs = "500" }
    stepId        = "s-delay-bench"
}
$data.steps += [pscustomobject]$delayStep
$data | ConvertTo-Json -Depth 20 | Set-Content $dataPath -Encoding UTF8

$applyLine = Invoke-QkrpcLine @(
    "action", "apply", "--dir", $wsDir,
    "--expected-edit-version", "$($info.editVersion)", "--json"
)
Write-Host "disk apply: $(Get-Regex $applyLine '""ok""\s*:\s*(true|false)')"

$minute = Get-Date -Format "HHmm"
$renameLine = Invoke-QkrpcLine @(
    "action", "set-metadata", "--id", $metaId,
    "--title", "_patch_no_get_$minute", "--json"
)
Write-Host "no-get rename: ok"

$structLine = Invoke-QkrpcLine @("action", "get", "--id", $httpId, "--return-mode", "structure", "--json")
if ($structLine -notmatch "sys:delay") { throw "delay step missing after apply" }

$createLine = Invoke-QkrpcLine @(
    "action", "create", "--title", "__bench_sp_call",
    "--description", "L3 subprogram call", "--json"
)
$spId = Get-Regex $createLine '"actionId"\s*:\s*"([^"]+)"'
$spEv = Get-Regex $createLine '"editVersion"\s*:\s*(\d+)'
$patchFile = Join-Path $repo ".local\patch-l3-global-subprogram-call.json"
$null = Invoke-QkrpcLine @(
    "action", "patch", "--id", $spId,
    "--patch-file", $patchFile,
    "--expected-edit-version", $spEv, "--json"
)
$spStruct = Invoke-QkrpcLine @("action", "get", "--id", $spId, "--return-mode", "structure", "--json")
if ($spStruct -notmatch "sys:subprogram") { throw "subprogram step missing" }

if (-not $KeepSubprogramBench) {
    $null = Invoke-QkrpcLine @("action", "delete", "--id", $spId, "--yes", "--json")
}
$null = Invoke-QkrpcLine @(
    "action", "set-metadata", "--id", $metaId,
    "--title", "_agent_benchmark_meta", "--json"
)

@{ ok = $true; httpId = $httpId; subprogramBenchId = $spId } | ConvertTo-Json
