#Requires -Version 7.0
<#
.SYNOPSIS
  List compile_ok cases without manifest mapping, filtered by step count and mockable keys.

.EXAMPLE
  pwsh -NoProfile -File ./scripts/compile-verify-loop/List-UnmappedSimpleCases.ps1 -MaxSteps 2
  pwsh -NoProfile -File ./scripts/compile-verify-loop/List-UnmappedSimpleCases.ps1 -MaxSteps 4 -RequireMockableOnly
#>
param(
    [int] $MaxSteps = 4,
    [switch] $RequireMockableOnly,
    [switch] $Json,
    [int] $Limit = 50
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'CompileVerifyLoop.Common.ps1')

$map = Get-CompileVerifyBenchmarkMockMap
$casesDir = Join-Path (Get-CompileVerifyLoopRoot) 'cases'
$items = @()

foreach ($dir in @(Get-ChildItem -LiteralPath $casesDir -Directory -ErrorAction SilentlyContinue)) {
    $case = Read-CompileVerifyCase -CaseId $dir.Name
    if ($null -eq $case -or [string]$case.status -ne 'compile_ok') {
        continue
    }

    $actionId = [string]$case.source.actionId
    $key = $actionId.ToLowerInvariant()
    if ($map.ContainsKey($key)) {
        continue
    }

    $lcPath = Join-Path $dir.FullName 'last-compile.json'
    if (-not (Test-Path -LiteralPath $lcPath)) {
        continue
    }

    $lc = Read-CompileVerifyJsonFile -Path $lcPath
    $keys = @($lc.supportedStepKeys | ForEach-Object { $_.ToLowerInvariant() } | Sort-Object -Unique)
    $stepCount = [int]($lc.totalStepCount ?? $keys.Count)
    if ($stepCount -gt $MaxSteps) {
        continue
    }

    if ($RequireMockableOnly -and -not (Test-CompileVerifyMockableOnlyStepKeys -StepKeys $keys)) {
        continue
    }

    $items += [ordered]@{
        caseId    = $dir.Name
        actionId  = $actionId
        steps     = $stepCount
        keys      = ($keys -join '+')
        title     = [string]($lc.actionTitle ?? $case.source.title ?? '')
    }
}

$items = @($items | Sort-Object steps, keys | Select-Object -First $Limit)

if ($Json) {
    @{
        ok    = $true
        count = $items.Count
        items = $items
    } | ConvertTo-Json -Depth 4
}
else {
    Write-Host "List-UnmappedSimpleCases: count=$($items.Count) maxSteps=$MaxSteps mockableOnly=$($RequireMockableOnly.IsPresent)"
    foreach ($row in $items) {
        Write-Host ("{0} steps={1} {2} title={3}" -f $row.caseId, $row.steps, $row.keys, $row.title)
    }
}
