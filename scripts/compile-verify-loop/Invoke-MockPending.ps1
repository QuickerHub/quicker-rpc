#Requires -Version 7.0
<#
.SYNOPSIS
  Run mock assert (-MockOnly) for compile_ok cases that have mock-profile.json.

.EXAMPLE
  pwsh -NoProfile -File ./scripts/compile-verify-loop/Invoke-MockPending.ps1
  pwsh -NoProfile -File ./scripts/compile-verify-loop/Invoke-MockPending.ps1 -Json
#>
param(
    [switch] $Json,
    [switch] $DryRun,
    [string] $ProfileId = ''
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'CompileVerifyLoop.Common.ps1')

$profileIdFilter = $ProfileId.Trim().ToLowerInvariant()
$qkrpcExe = Resolve-CompileVerifyQkrpcExe
if ($qkrpcExe -notmatch 'cli-dev') {
    Write-Warning "Invoke-MockPending: prefer publish/cli-dev/qkrpc.exe (EnableActionRuntimeMock). Using: $qkrpcExe"
}

$root = Get-CompileVerifyLoopRoot
$casesDir = Join-Path $root 'cases'
$results = @()
$passed = 0
$failed = 0
$skipped = 0

foreach ($dir in @(Get-ChildItem -LiteralPath $casesDir -Directory -ErrorAction SilentlyContinue)) {
    $case = Read-CompileVerifyCase -CaseId $dir.Name
    if ($null -eq $case) {
        continue
    }

    $profilePath = Join-Path $dir.FullName 'mock-profile.json'
    if (-not (Test-Path -LiteralPath $profilePath)) {
        continue
    }

    if (-not [string]::IsNullOrWhiteSpace($profileIdFilter)) {
        $doc = Read-CompileVerifyJsonFile -Path $profilePath
        $mockProfileId = [string]($doc.id ?? '')
        if ($mockProfileId.ToLowerInvariant() -ne $profileIdFilter) {
            continue
        }
    }

    $status = [string]$case.status
    if ($status -eq 'mock_pass') {
        $skipped++
        $results += [ordered]@{
            caseId = $dir.Name
            status = $status
            ok     = $true
            skipped = $true
            reason = 'already mock_pass'
        }
        continue
    }

    if ($status -ne 'compile_ok' -and $status -ne 'mock_fail') {
        $skipped++
        $results += [ordered]@{
            caseId = $dir.Name
            status = $status
            ok     = $false
            skipped = $true
            reason = 'needs compile_ok before mock'
        }
        continue
    }

    if ($DryRun) {
        $results += [ordered]@{
            caseId = $dir.Name
            status = $status
            ok     = $true
            dryRun = $true
        }
        continue
    }

    $invokeJson = & pwsh -NoProfile -File (Join-Path $PSScriptRoot 'Invoke-Case.ps1') -CaseId $dir.Name -MockOnly -Force -Json
    $invoke = $invokeJson | ConvertFrom-Json
    $ok = $invoke.ok -eq $true -and $invoke.status -eq 'mock_pass'
    if ($ok) { $passed++ } else { $failed++ }

    $results += [ordered]@{
        caseId = $dir.Name
        status = [string]$invoke.status
        ok     = $ok
        mock   = $invoke.mock
    }
}

Update-CompileVerifyManifest | Out-Null

$summary = [ordered]@{
    ok      = $failed -eq 0
    dryRun  = [bool]$DryRun
    passed  = $passed
    failed  = $failed
    skipped = $skipped
    total   = $results.Count
    items   = $results
}

if ($Json) {
    $summary | ConvertTo-Json -Depth 8
}
else {
    Write-Host "Invoke-MockPending: passed=$passed failed=$failed skipped=$skipped"
    foreach ($item in $results) {
        if ($item.skipped) {
            Write-Host "  SKIP $($item.caseId) ($($item.reason))"
        }
        elseif ($item.dryRun) {
            Write-Host "  DRY  $($item.caseId)"
        }
        else {
            $flag = if ($item.ok) { 'OK' } else { 'FAIL' }
            Write-Host "  $flag $($item.caseId) => $($item.status)"
        }
    }
}

if ($failed -gt 0) { exit 1 }
