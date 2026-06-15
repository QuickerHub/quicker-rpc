#Requires -Version 7.0
<#
.SYNOPSIS
  Reset cases to pending when Quicker action editVersion changed.

.EXAMPLE
  pwsh -NoProfile -File ./scripts/compile-verify-loop/Sync-CaseEdit.ps1
  pwsh -NoProfile -File ./scripts/compile-verify-loop/Sync-CaseEdit.ps1 -Json
#>
param(
    [switch] $Json,
    [switch] $DryRun
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'CompileVerifyLoop.Common.ps1')

$casesDir = Join-Path (Get-CompileVerifyLoopRoot) 'cases'
$changed = @()

if (-not (Test-Path -LiteralPath $casesDir)) {
    throw "No cases directory."
}

foreach ($dir in Get-ChildItem -LiteralPath $casesDir -Directory) {
    $case = Read-CompileVerifyCase -CaseId $dir.Name
    if ($null -eq $case) {
        continue
    }

    $sourceKind = [string]($case.source.kind ?? 'quicker-local')
    if ($sourceKind -eq 'getquicker-library') {
        continue
    }

    $actionId = [string]$case.source.actionId
    if ([string]::IsNullOrWhiteSpace($actionId)) {
        continue
    }

    $remoteEditMs = Get-CompileVerifyActionEditMs -ActionId $actionId
    $localEditMs = [long]($case.source.editMs ?? 0)

    if ($remoteEditMs -le 0 -or $remoteEditMs -eq $localEditMs) {
        continue
    }

    $changed += [ordered]@{
        caseId       = $dir.Name
        actionId     = $actionId
        localEditMs  = $localEditMs
        remoteEditMs = $remoteEditMs
        oldStatus    = [string]$case.status
    }

    if ($DryRun) {
        continue
    }

    $case.source.editMs = $remoteEditMs
    $case.status = 'pending'
    $case.skipUntilEditMs = 0
    Write-CompileVerifyCase -Case $case
}

if (-not $DryRun) {
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
    Write-Host "Sync-CaseEdit: $($changed.Count) case(s) need re-run."
    foreach ($item in $changed) {
        Write-Host "  $($item.caseId) $($item.oldStatus) editMs $($item.localEditMs) -> $($item.remoteEditMs)"
    }
}
