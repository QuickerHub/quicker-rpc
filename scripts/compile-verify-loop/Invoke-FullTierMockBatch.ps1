#Requires -Version 7.0
<#
.SYNOPSIS
  Apply runtime-success mock to Full-tier-only compile_ok cases and run mock assert.

.EXAMPLE
  pwsh -NoProfile -File ./scripts/compile-verify-loop/Invoke-FullTierMockBatch.ps1
  pwsh -NoProfile -File ./scripts/compile-verify-loop/Invoke-FullTierMockBatch.ps1 -DryRun
#>
param(
    [switch] $DryRun,
    [switch] $Json
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'CompileVerifyLoop.Common.ps1')

$profilesDir = Get-CompileVerifyMockProfilesDir
$profileSrc = Join-Path $profilesDir 'runtime-success.json'
$casesDir = Join-Path (Get-CompileVerifyLoopRoot) 'cases'
$passed = 0
$failed = 0
$skipped = 0
$items = [System.Collections.Generic.List[object]]::new()

foreach ($dir in @(Get-ChildItem -LiteralPath $casesDir -Directory -ErrorAction SilentlyContinue)) {
    $case = Read-CompileVerifyCase -CaseId $dir.Name
    if ($null -eq $case -or [string]$case.status -ne 'compile_ok') {
        continue
    }

    $lcPath = Join-Path $dir.FullName 'last-compile.json'
    if (-not (Test-Path -LiteralPath $lcPath)) {
        continue
    }

    $lc = Read-CompileVerifyJsonFile -Path $lcPath
    $keys = @($lc.supportedStepKeys | ForEach-Object { $_.ToLowerInvariant() })
    if (-not (Test-CompileVerifyFullTierStepKeys -StepKeys $keys)) {
        continue
    }

    if ($DryRun) {
        $skipped++
        $items.Add([ordered]@{ caseId = $dir.Name; dryRun = $true; pattern = ($keys -join '+') })
        continue
    }

    Copy-Item -LiteralPath $profileSrc -Destination (Join-Path $dir.FullName 'mock-profile.json') -Force
    $invokeJson = & pwsh -NoProfile -File (Join-Path $PSScriptRoot 'Invoke-Case.ps1') -CaseId $dir.Name -MockOnly -Force -Json
    $invoke = $invokeJson | ConvertFrom-Json
    $ok = $invoke.ok -eq $true -and $invoke.status -eq 'mock_pass'
    if ($ok) {
        $passed++
    }
    else {
        $failed++
        Remove-Item -LiteralPath (Join-Path $dir.FullName 'mock-profile.json') -ErrorAction SilentlyContinue
        & pwsh -NoProfile -File (Join-Path $PSScriptRoot 'Set-CaseStatus.ps1') -CaseId $dir.Name -Status compile_ok | Out-Null
    }

    $items.Add([ordered]@{
        caseId  = $dir.Name
        ok      = $ok
        status  = [string]$invoke.status
        pattern = ($keys -join '+')
    })
}

Update-CompileVerifyManifest | Out-Null

$summary = [ordered]@{
    ok      = $failed -eq 0
    dryRun  = [bool]$DryRun
    passed  = $passed
    failed  = $failed
    skipped = $skipped
    items   = @($items)
}

if ($Json) {
    $summary | ConvertTo-Json -Depth 6
}
else {
    Write-Host "Invoke-FullTierMockBatch: passed=$passed failed=$failed dryRun=$($DryRun.IsPresent)"
    foreach ($item in $items) {
        if ($item.dryRun) {
            Write-Host "  DRY $($item.caseId) $($item.pattern)"
        }
        elseif ($item.ok) {
            Write-Host "  OK  $($item.caseId) $($item.pattern)"
        }
        else {
            Write-Host "  FAIL $($item.caseId) $($item.pattern) => $($item.status)"
        }
    }
}

if ($failed -gt 0) { exit 1 }
