#Requires -Version 7.0
<#
.SYNOPSIS
  Repeat Suggest-MockProfiles -Apply and Invoke-MockPending for one profile.

.EXAMPLE
  pwsh -NoProfile -File ./scripts/compile-verify-loop/Run-SuggestMockBatch.ps1 -ProfileId runtime-success -Rounds 3
#>
param(
    [string] $ProfileId = 'runtime-success',
    [int] $Rounds = 3
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'CompileVerifyLoop.Common.ps1')

if (-not $env:QKRPC_EXE) {
    $env:QKRPC_EXE = (Resolve-CompileVerifyQkrpcExe)
}

$totalPass = 0
$totalFail = 0

for ($round = 1; $round -le $Rounds; $round++) {
    Write-Host "=== Round $round/$Rounds profile=$ProfileId ==="
    pwsh -NoProfile -File (Join-Path $PSScriptRoot 'Suggest-MockProfiles.ps1') -Apply | Out-Host

    $mockJson = pwsh -NoProfile -File (Join-Path $PSScriptRoot 'Invoke-MockPending.ps1') -ProfileId $ProfileId -Json
    $mock = $mockJson | ConvertFrom-Json
    $roundPass = 0
    $roundFail = 0
    foreach ($item in @($mock.items)) {
        if ($item.skipped) { continue }
        if ($item.ok -eq $true) { $roundPass++ } else { $roundFail++ }
    }

    $totalPass += $roundPass
    $totalFail += $roundFail
    Write-Host "Round $round pass=$roundPass fail=$roundFail"

    if ($roundFail -gt 0) {
        $repaired = pwsh -NoProfile -File (Join-Path $PSScriptRoot 'Repair-MockFailCases.ps1') -Json | ConvertFrom-Json
        foreach ($id in @($repaired.caseIds)) {
            pwsh -NoProfile -File (Join-Path $PSScriptRoot 'Remove-ManifestCase.ps1') -CaseId $id -Apply | Out-Null
        }
    }

    if ($roundPass -eq 0 -and $roundFail -eq 0) {
        Write-Host 'No pending cases; stopping early.'
        break
    }
}

Update-CompileVerifyManifest | Out-Null
$status = pwsh -NoProfile -File (Join-Path $PSScriptRoot 'Get-LoopStatus.ps1')
Write-Host $status
Write-Host "Run-SuggestMockBatch: totalPass=$totalPass totalFail=$totalFail"
if ($totalFail -gt 0) { exit 1 }
