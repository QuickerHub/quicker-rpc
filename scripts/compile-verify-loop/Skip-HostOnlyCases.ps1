#Requires -Version 7.0
<#
.SYNOPSIS
  Mark blocked cases as skipped when all unsupported steps are host-only.

.EXAMPLE
  pwsh -NoProfile -File ./scripts/compile-verify-loop/Skip-HostOnlyCases.ps1
  pwsh -NoProfile -File ./scripts/compile-verify-loop/Skip-HostOnlyCases.ps1 -Json
#>
param(
    [switch] $Json,
    [switch] $DryRun
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'CompileVerifyLoop.Common.ps1')

$casesDir = Join-Path (Get-CompileVerifyLoopRoot) 'cases'
$changed = @()

foreach ($dir in @(Get-ChildItem -LiteralPath $casesDir -Directory -ErrorAction SilentlyContinue)) {
    $case = Read-CompileVerifyCase -CaseId $dir.Name
    if ($null -eq $case) {
        continue
    }

    if ([string]$case.status -notin @('blocked', 'pending', 'compile_fail')) {
        continue
    }

    $lcPath = Join-Path $dir.FullName 'last-compile.json'
    if (-not (Test-Path -LiteralPath $lcPath)) {
        continue
    }

    $lc = Read-CompileVerifyJsonFile -Path $lcPath
    if (-not (Test-CompileVerifyHostOnlyUnsupported -Report $lc)) {
        continue
    }

    $unsupported = Get-CompileVerifyUnsupportedStepKeys -Report $lc
    $note = Get-CompileVerifyHostOnlySkipNote -UnsupportedStepKeys $unsupported
    $entry = [ordered]@{
        caseId      = $dir.Name
        fromStatus  = [string]$case.status
        unsupported = $unsupported
        note        = $note
    }
    $changed += $entry

    if ($DryRun) {
        continue
    }

    $case.status = 'skipped'
    $case.notes = $note
    $case.skipUntilEditMs = [long]($case.source.editMs ?? 0)
    Write-CompileVerifyCase -Case $case
}

if (-not $DryRun -and $changed.Count -gt 0) {
    Update-CompileVerifyManifest | Out-Null
}

$summary = [ordered]@{
    ok      = $true
    dryRun  = [bool]$DryRun
    changed = $changed.Count
    items   = $changed
}

if ($Json) {
    $summary | ConvertTo-Json -Depth 8
}
else {
    Write-Host "Skip-HostOnlyCases: changed=$($changed.Count) dryRun=$DryRun"
    foreach ($item in $changed) {
        Write-Host "  $($item.caseId) $($item.fromStatus) -> skipped ($($item.unsupported -join ', '))"
    }
}
