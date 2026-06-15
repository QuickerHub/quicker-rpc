#Requires -Version 7.0
<#
.SYNOPSIS
  Summarize supportedStepKeys patterns for compile_ok cases (mock coverage gaps).

.EXAMPLE
  pwsh -NoProfile -File ./scripts/compile-verify-loop/Analyze-CompileOkPatterns.ps1
  pwsh -NoProfile -File ./scripts/compile-verify-loop/Analyze-CompileOkPatterns.ps1 -Top 20 -Json
#>
param(
    [int] $Top = 30,
    [switch] $Json,
    [switch] $NoMockOnly
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'CompileVerifyLoop.Common.ps1')

$casesDir = Join-Path (Get-CompileVerifyLoopRoot) 'cases'
$patterns = @{}
$total = 0
$noMock = 0

foreach ($dir in @(Get-ChildItem -LiteralPath $casesDir -Directory -ErrorAction SilentlyContinue)) {
    $case = Read-CompileVerifyCase -CaseId $dir.Name
    if ($null -eq $case -or [string]$case.status -ne 'compile_ok') {
        continue
    }

    $total++
    $hasMock = Test-Path (Join-Path $dir.FullName 'mock-profile.json')
    if ($NoMockOnly -and $hasMock) {
        continue
    }

    if (-not $hasMock) {
        $noMock++
    }

    $lcPath = Join-Path $dir.FullName 'last-compile.json'
    if (-not (Test-Path -LiteralPath $lcPath)) {
        continue
    }

    $lc = Read-CompileVerifyJsonFile -Path $lcPath
    $keys = @($lc.supportedStepKeys | ForEach-Object { $_.ToLowerInvariant() } | Sort-Object)
    $pattern = ($keys -join '+')
    $stepCount = [int]($lc.totalStepCount ?? $keys.Count)

    if (-not $patterns.ContainsKey($pattern)) {
        $patterns[$pattern] = [ordered]@{
            pattern    = $pattern
            stepCount  = $stepCount
            count      = 0
            sampleIds  = @()
        }
    }

    $patterns[$pattern].count++
    if ($patterns[$pattern].sampleIds.Count -lt 3) {
        $patterns[$pattern].sampleIds += $dir.Name
    }
}

$ranked = @($patterns.Values | Sort-Object { $_.count } -Descending | Select-Object -First $Top)

$summary = [ordered]@{
    ok              = $true
    compileOkTotal  = $total
    compileOkNoMock = $noMock
    uniquePatterns  = $patterns.Count
    top             = $ranked
}

if ($Json) {
    $summary | ConvertTo-Json -Depth 6
}
else {
    Write-Host "Analyze-CompileOkPatterns: compile_ok=$total no_mock=$noMock patterns=$($patterns.Count)"
    foreach ($row in $ranked) {
        Write-Host ("  [{0,3}] steps={1,-2} {2}" -f $row.count, $row.stepCount, $row.pattern)
        Write-Host ("        samples: {0}" -f ($row.sampleIds -join ', '))
    }
}
