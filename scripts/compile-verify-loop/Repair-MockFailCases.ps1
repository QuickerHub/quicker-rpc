#Requires -Version 7.0
<#
.SYNOPSIS
  Reset mock_fail cases to compile_ok and remove auto-applied mock profiles.

.EXAMPLE
  pwsh -NoProfile -File ./scripts/compile-verify-loop/Repair-MockFailCases.ps1
#>
param(
    [switch] $Json
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'CompileVerifyLoop.Common.ps1')

$casesDir = Join-Path (Get-CompileVerifyLoopRoot) 'cases'
$repaired = 0
$items = @()

foreach ($dir in @(Get-ChildItem -LiteralPath $casesDir -Directory -ErrorAction SilentlyContinue)) {
    $case = Read-CompileVerifyCase -CaseId $dir.Name
    if ($null -eq $case -or [string]$case.status -ne 'mock_fail') {
        continue
    }

    $profilePath = Join-Path $dir.FullName 'mock-profile.json'
    if (Test-Path -LiteralPath $profilePath) {
        $profileDoc = Read-CompileVerifyJsonFile -Path $profilePath
        $profileId = [string]($profileDoc.id ?? '')
        if (-not [string]::IsNullOrWhiteSpace($profileId)) {
            Add-CompileVerifyMockRejectedProfile -Case $case -ProfileId $profileId
        }

        Remove-Item -LiteralPath $profilePath -Force
    }

    $case.status = 'compile_ok'
    $case.notes = 'mock_fail reverted by Repair-MockFailCases.ps1'
    Write-CompileVerifyCase -Case $case
    $repaired++
    $items += $dir.Name
}

$manifest = Update-CompileVerifyManifest
$summary = [ordered]@{
    ok       = $true
    repaired = $repaired
    caseIds  = $items
    stats    = $manifest.stats
}

if ($Json) {
    $summary | ConvertTo-Json -Depth 4
}
else {
    Write-Host "Repair-MockFailCases: repaired=$repaired"
    foreach ($id in $items) {
        Write-Host "  $id"
    }
}
