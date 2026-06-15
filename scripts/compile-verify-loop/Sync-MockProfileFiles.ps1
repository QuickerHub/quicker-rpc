#Requires -Version 7.0
<#
.SYNOPSIS
  Copy mock profile JSON from templates/mock-action-profiles.json to case directories.

.EXAMPLE
  pwsh -NoProfile -File ./scripts/compile-verify-loop/Sync-MockProfileFiles.ps1
  pwsh -NoProfile -File ./scripts/compile-verify-loop/Sync-MockProfileFiles.ps1 -Apply
#>
param(
    [switch] $Apply,
    [switch] $Json,
    [string] $ProfileId = '',
    [string[]] $CaseId = @(),
    [switch] $Force
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'CompileVerifyLoop.Common.ps1')

$caseIdFilter = @($CaseId | ForEach-Object { $_.Trim().ToLowerInvariant() } | Where-Object { $_ })
$profileIdFilter = $ProfileId.Trim().ToLowerInvariant()
$map = Get-CompileVerifyBenchmarkMockMap
$profilesDir = Get-CompileVerifyMockProfilesDir
$casesDir = Join-Path (Get-CompileVerifyLoopRoot) 'cases'
$synced = 0
$skipped = 0
$items = @()

foreach ($dir in @(Get-ChildItem -LiteralPath $casesDir -Directory -ErrorAction SilentlyContinue)) {
    $case = Read-CompileVerifyCase -CaseId $dir.Name
    if ($null -eq $case) {
        continue
    }

    $status = [string]$case.status
    if ($status -notin @('compile_ok', 'mock_fail')) {
        continue
    }

    $actionId = [string]$case.source.actionId
    $key = $actionId.ToLowerInvariant()
    if (-not $map.ContainsKey($key)) {
        continue
    }

    $profileId = $map[$key]
    if (-not [string]::IsNullOrWhiteSpace($profileIdFilter) -and $profileId.ToLowerInvariant() -ne $profileIdFilter) {
        continue
    }

    if ($caseIdFilter.Count -gt 0 -and $caseIdFilter -notcontains $dir.Name.ToLowerInvariant() -and $caseIdFilter -notcontains $key) {
        continue
    }

    $dest = Join-Path $dir.FullName 'mock-profile.json'
    if ((Test-Path -LiteralPath $dest) -and -not $Force.IsPresent) {
        $skipped++
        continue
    }

    $entry = [ordered]@{
        caseId    = $dir.Name
        actionId  = $actionId
        profileId = $profileId
        status    = $status
    }
    $items += $entry

    if ($Apply) {
        if ($profileId -eq 'subprogram-external-readfile-stub') {
            Write-CompileVerifyReadFileMockProfile -CaseDir $dir.FullName
        }
        else {
            $src = Join-Path $profilesDir "$profileId.json"
            if (-not (Test-Path -LiteralPath $src)) {
                continue
            }

            Copy-Item -LiteralPath $src -Destination $dest -Force
        }

        $synced++
    }
}

$summary = [ordered]@{
    ok       = $true
    apply    = [bool]$Apply
    synced   = $synced
    skipped  = $skipped
    pending  = $items.Count
    items    = $items
}

if ($Json) {
    $summary | ConvertTo-Json -Depth 6
}
else {
    Write-Host "Sync-MockProfileFiles: pending=$($items.Count) synced=$synced skipped=$skipped apply=$($Apply.IsPresent)"
}
