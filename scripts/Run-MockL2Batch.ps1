#Requires -Version 7.0
<#
.SYNOPSIS
  Run L2 benchmark mock assert batch (6 profiles) via publish/cli qkrpc.exe.

.EXAMPLE
  pwsh -NoProfile -File ./scripts/Run-MockL2Batch.ps1
#>
param(
    [string]$QkrpcExe = (Join-Path $PSScriptRoot '..' 'publish' 'cli' 'qkrpc.exe')
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$qkrpc = (Resolve-Path -LiteralPath $QkrpcExe).Path

$pairs = @(
    @{ profile = 'clip-lines-expr'; id = '65a3b800-f5be-4a2b-ac03-5c9a27f4e71d' },
    @{ profile = 'multi-var-assign'; id = 'b63593ce-d494-40f9-a87e-18011c443d28' },
    @{ profile = 'http-json-origin'; id = '3a59e44b-01f2-4ae1-b50a-97a6b147212f' },
    @{ profile = 'window-vscode-branch'; id = 'f3b993a2-594b-4109-b714-25e1470a72a9' },
    @{ profile = 'form-to-clipboard'; id = '9441be78-167e-4434-a46b-5a87f23b2a35' },
    @{ profile = 'file-copy-timestamp'; id = '3dacfbea-37f9-4777-bcdf-e9a816a9238d' }
)

function Test-MockAssertPassed {
    param([string]$Raw)
    if ($Raw -notmatch '"ok"\s*:\s*true') { return $false }
    if ($Raw -notmatch '"assertions"\s*:\s*\{[^}]*"passed"\s*:\s*true') { return $false }
    if ($Raw -match '"failures"\s*:\s*\[\s*\{') { return $false }
    return $true
}

$passed = 0
foreach ($p in $pairs) {
    Push-Location $root
    $tmp = [IO.Path]::GetTempFileName()
    try {
        & $qkrpc action run --id $p.id --mock --mock-profile $p.profile --assert --json 2>$null |
            Set-Content -LiteralPath $tmp -Encoding utf8
        $exit = $LASTEXITCODE
        $raw = Get-Content -LiteralPath $tmp -Raw -Encoding utf8
    }
    finally {
        Pop-Location
        Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
    }

    $assertPassed = Test-MockAssertPassed -Raw $raw
    $status = if ($exit -eq 0 -and $assertPassed) { 'PASS'; $passed++ } else { 'FAIL' }
    Write-Host ("{0}`t{1}`texit={2}`tassert={3}" -f $status, $p.profile, $exit, $assertPassed)
}

Write-Host "SUMMARY: $passed/$($pairs.Count) passed"
if ($passed -ne $pairs.Count) { exit 1 }
