#Requires -Version 7.0
<#
.SYNOPSIS
  Print compile-verify-loop queue statistics.

.EXAMPLE
  pwsh -NoProfile -File ./scripts/compile-verify-loop/Get-LoopStatus.ps1
  pwsh -NoProfile -File ./scripts/compile-verify-loop/Get-LoopStatus.ps1 -Json -ShowFailures
#>
param(
    [switch] $Json,
    [switch] $ShowFailures,
    [int] $FailureLimit = 10
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'CompileVerifyLoop.Common.ps1')

$manifest = Update-CompileVerifyManifest
$failures = @()

if ($ShowFailures) {
    $casesDir = Join-Path (Get-CompileVerifyLoopRoot) 'cases'
    if (Test-Path -LiteralPath $casesDir) {
        foreach ($dir in Get-ChildItem -LiteralPath $casesDir -Directory) {
            $case = Read-CompileVerifyCase -CaseId $dir.Name
            if ($case.status -in @('compile_fail', 'mock_fail', 'blocked')) {
                $failures += [ordered]@{
                    caseId   = $case.id
                    status   = $case.status
                    actionId = $case.source.actionId
                    title    = $case.source.title
                }
            }
        }
        $failures = @($failures | Select-Object -First $FailureLimit)
    }
}

if ($Json) {
    [ordered]@{
        ok       = $true
        manifest = $manifest
        failures = $failures
    } | ConvertTo-Json -Depth 8
}
else {
    $s = $manifest.stats
    Write-Host "compile-verify-loop @ $($manifest.root)"
    Write-Host "  total=$($s.total) pending=$($s.pending) compile_ok=$($s.compile_ok) compile_fail=$($s.compile_fail)"
    Write-Host "  blocked=$($s.blocked) mock_pass=$($s.mock_pass) mock_fail=$($s.mock_fail) skipped=$($s.skipped)"
    if ($manifest.lastRunAt) {
        Write-Host "  lastRunAt=$($manifest.lastRunAt)"
    }
    if ($ShowFailures -and $failures.Count -gt 0) {
        Write-Host 'Failures:'
        foreach ($f in $failures) {
            Write-Host "  $($f.status)`t$($f.caseId)`t$($f.title)"
        }
    }
}
