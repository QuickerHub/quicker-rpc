#Requires -Version 7.0
<#
.SYNOPSIS
  Copy benchmark mock profiles into matching compile-verify cases.

.EXAMPLE
  pwsh -NoProfile -File ./scripts/compile-verify-loop/Link-MockProfiles.ps1
  pwsh -NoProfile -File ./scripts/compile-verify-loop/Link-MockProfiles.ps1 -Json
#>
param(
    [switch] $Json,
    [switch] $DryRun
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'CompileVerifyLoop.Common.ps1')

$map = Get-CompileVerifyBenchmarkMockMap
$profilesDir = Get-CompileVerifyMockProfilesDir
$casesDir = Join-Path (Get-CompileVerifyLoopRoot) 'cases'
$linked = @()

if ($map.Count -eq 0) {
    throw 'mock-action-profiles.json has no entries.'
}

foreach ($dir in @(Get-ChildItem -LiteralPath $casesDir -Directory -ErrorAction SilentlyContinue)) {
    $case = Read-CompileVerifyCase -CaseId $dir.Name
    if ($null -eq $case) {
        continue
    }

    $actionId = [string]$case.source.actionId
    $key = $actionId.ToLowerInvariant()
    if (-not $map.ContainsKey($key)) {
        continue
    }

    $profileId = $map[$key]
    $src = Join-Path $profilesDir "$profileId.json"
    if (-not (Test-Path -LiteralPath $src)) {
        $linked += [ordered]@{
            caseId    = $dir.Name
            actionId  = $actionId
            profileId = $profileId
            ok        = $false
            error     = "profile not found: $src"
        }
        continue
    }

    $dest = Join-Path $dir.FullName 'mock-profile.json'
    if ($DryRun) {
        $linked += [ordered]@{
            caseId    = $dir.Name
            actionId  = $actionId
            profileId = $profileId
            ok        = $true
            dryRun    = $true
            dest      = $dest
        }
        continue
    }

    Copy-Item -LiteralPath $src -Destination $dest -Force
    $linked += [ordered]@{
        caseId    = $dir.Name
        actionId  = $actionId
        profileId = $profileId
        ok        = $true
        dest      = $dest
    }
}

$summary = [ordered]@{
    ok     = $true
    dryRun = [bool]$DryRun
    linked = @($linked | Where-Object { $_.ok }).Count
    failed = @($linked | Where-Object { -not $_.ok }).Count
    items  = $linked
}

if ($Json) {
    $summary | ConvertTo-Json -Depth 8
}
else {
    Write-Host "Link-MockProfiles: linked=$($summary.linked) failed=$($summary.failed)"
    foreach ($item in $linked) {
        $flag = if ($item.ok) { 'OK' } else { 'FAIL' }
        Write-Host "  $flag $($item.caseId) -> $($item.profileId)"
    }
}
