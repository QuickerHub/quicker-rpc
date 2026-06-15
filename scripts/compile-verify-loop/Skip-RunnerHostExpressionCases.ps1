#Requires -Version 7.0
<#
.SYNOPSIS
  Mark compile_ok cases as skipped when program uses Quicker host-only expression APIs
  (Runner.*, JToken, ExpressionRunner, ViewRunner).

.EXAMPLE
  pwsh -NoProfile -File ./scripts/compile-verify-loop/Skip-RunnerHostExpressionCases.ps1
  pwsh -NoProfile -File ./scripts/compile-verify-loop/Skip-RunnerHostExpressionCases.ps1 -Json
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
    if ($null -eq $case -or [string]$case.status -ne 'compile_ok') {
        continue
    }

    if (-not (Test-CompileVerifyUsesRunnerHostExpression -CaseDir $dir.FullName)) {
        continue
    }

    $entry = [ordered]@{
        caseId     = $dir.Name
        fromStatus = [string]$case.status
        note       = 'Host-only expression API (Runner/JToken/ExpressionRunner/ViewRunner) not available in ActionRuntime mock'
    }
    $changed += $entry

    if ($DryRun) {
        continue
    }

    $case.status = 'skipped'
    $case.notes = [string]$entry.note
    $case.skipUntilEditMs = [long]($case.source.editMs ?? 0)
    Write-CompileVerifyCase -Case $case
}

Update-CompileVerifyManifest | Out-Null

$summary = [ordered]@{
    ok      = $true
    dryRun  = [bool]$DryRun
    changed = $changed.Count
    items   = $changed
}

if ($Json) {
    $summary | ConvertTo-Json -Depth 6
}
else {
    Write-Host "Skip-RunnerHostExpressionCases: changed=$($changed.Count) dryRun=$($DryRun.IsPresent)"
    foreach ($item in $changed) {
        Write-Host "  $($item.caseId) $($item.fromStatus) -> skipped"
    }
}
