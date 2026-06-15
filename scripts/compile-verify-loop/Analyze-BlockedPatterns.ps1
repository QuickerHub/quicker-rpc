#Requires -Version 7.0
<#
.SYNOPSIS
  Summarize unsupportedStepKeys for blocked cases (compiler gap triage).

.EXAMPLE
  pwsh -NoProfile -File ./scripts/compile-verify-loop/Analyze-BlockedPatterns.ps1
  pwsh -NoProfile -File ./scripts/compile-verify-loop/Analyze-BlockedPatterns.ps1 -Kind getquicker-library -Top 15 -Json
#>
param(
    [int] $Top = 20,
    [string] $Kind = '',
    [switch] $Json
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'CompileVerifyLoop.Common.ps1')

$casesDir = Join-Path (Get-CompileVerifyLoopRoot) 'cases'
$stepKeyCounts = @{}
$comboCounts = @{}
$total = 0
$deliberateOnly = 0
$hasFixable = 0
$fixableKeyCounts = @{}
$cases = [System.Collections.Generic.List[object]]::new()

foreach ($dir in @(Get-ChildItem -LiteralPath $casesDir -Directory -ErrorAction SilentlyContinue)) {
    $case = Read-CompileVerifyCase -CaseId $dir.Name
    if ($null -eq $case -or [string]$case.status -ne 'blocked') {
        continue
    }

    if (-not [string]::IsNullOrWhiteSpace($Kind) -and [string]$case.source.kind -ne $Kind) {
        continue
    }

    $total++
    $lcPath = Join-Path $dir.FullName 'last-compile.json'
    if (-not (Test-Path -LiteralPath $lcPath)) {
        continue
    }

    $lc = Read-CompileVerifyJsonFile -Path $lcPath
    $unsupported = @($lc.unsupportedStepKeys | ForEach-Object { $_.ToLowerInvariant() } | Sort-Object -Unique)
    if ($unsupported.Count -eq 0) {
        $unsupported = @('(none)')
    }

    $split = Split-CompileVerifyUnsupportedStepKeys -UnsupportedStepKeys $unsupported
    if ($split.Fixable.Count -gt 0) {
        $hasFixable++
        foreach ($key in $split.Fixable) {
            $fixableKeyCounts[$key] = 1 + [int]($fixableKeyCounts[$key] ?? 0)
        }
    }
    elseif ($split.Deliberate.Count -gt 0) {
        $deliberateOnly++
    }

    foreach ($key in $unsupported) {
        $stepKeyCounts[$key] = 1 + [int]($stepKeyCounts[$key] ?? 0)
    }

    $combo = ($unsupported -join '+')
    if (-not $comboCounts.ContainsKey($combo)) {
        $comboCounts[$combo] = [ordered]@{
            combo     = $combo
            count     = 0
            sampleIds = @()
        }
    }

    $comboCounts[$combo].count++
    if ($comboCounts[$combo].sampleIds.Count -lt 3) {
        $comboCounts[$combo].sampleIds += $dir.Name
    }

    $cases.Add([ordered]@{
        caseId         = $dir.Name
        title          = [string]($case.source.title ?? '')
        kind           = [string]($case.source.kind ?? '')
        stepCount      = [int]($lc.totalStepCount ?? 0)
        unsupported    = $unsupported
        deliberateOnly = ($split.Fixable.Count -eq 0 -and $split.Deliberate.Count -gt 0)
    })
}

$rankedKeys = @(
    $stepKeyCounts.GetEnumerator()
    | Sort-Object { $_.Value } -Descending
    | Select-Object -First $Top
    | ForEach-Object {
        [ordered]@{ stepKey = $_.Key; count = $_.Value }
    }
)

$rankedCombos = @(
    $comboCounts.Values
    | Sort-Object { $_.count } -Descending
    | Select-Object -First $Top
)

$rankedFixable = @(
    $fixableKeyCounts.GetEnumerator()
    | Sort-Object { $_.Value } -Descending
    | ForEach-Object {
        [ordered]@{ stepKey = $_.Key; count = $_.Value }
    }
)

$summary = [ordered]@{
    ok                 = $true
    blockedTotal       = $total
    deliberateOnly     = $deliberateOnly
    hasFixable         = $hasFixable
    kindFilter         = $(if ([string]::IsNullOrWhiteSpace($Kind)) { $null } else { $Kind })
    topStepKeys        = $rankedKeys
    topCombos          = $rankedCombos
    fixableStepKeys    = $rankedFixable
}

if ($Json) {
    $summary | ConvertTo-Json -Depth 6
}
else {
    $kindLabel = if ([string]::IsNullOrWhiteSpace($Kind)) { 'all' } else { $Kind }
    Write-Host "Analyze-BlockedPatterns: blocked=$total kind=$kindLabel deliberateOnly=$deliberateOnly hasFixable=$hasFixable"
    if ($rankedFixable.Count -gt 0) {
        Write-Host 'Fixable unsupported (not in DeliberatelyExcluded):'
        foreach ($row in $rankedFixable) {
            Write-Host ("  [{0,3}] {1}" -f $row.count, $row.stepKey)
        }
    }
    Write-Host 'Top unsupported step keys:'
    foreach ($row in $rankedKeys) {
        Write-Host ("  [{0,3}] {1}" -f $row.count, $row.stepKey)
    }
    Write-Host 'Top unsupported combos:'
    foreach ($row in $rankedCombos) {
        Write-Host ("  [{0,3}] {1}" -f $row.count, $row.combo)
        Write-Host ("        samples: {0}" -f ($row.sampleIds -join ', '))
    }
}
