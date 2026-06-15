#Requires -Version 7.0
param([int] $Top = 25)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'CompileVerifyLoop.Common.ps1')

$map = Get-CompileVerifyBenchmarkMockMap
$casesDir = Join-Path (Get-CompileVerifyLoopRoot) 'cases'
$patterns = @{}

foreach ($dir in @(Get-ChildItem -LiteralPath $casesDir -Directory)) {
    $case = Read-CompileVerifyCase -CaseId $dir.Name
    if ($null -eq $case -or [string]$case.status -ne 'compile_ok') { continue }
    $aid = [string]$case.source.actionId.ToLowerInvariant()
    if ($map.ContainsKey($aid)) { continue }

    $lc = Read-CompileVerifyJsonFile -Path (Join-Path $dir.FullName 'last-compile.json')
    if ($null -eq $lc) { continue }

    $keys = @($lc.supportedStepKeys | ForEach-Object { $_.ToLowerInvariant() } | Sort-Object -Unique)
    $pattern = $keys -join '+'
    $stepCount = [int]($lc.totalStepCount ?? $keys.Count)
    if (-not $patterns.ContainsKey($pattern)) {
        $patterns[$pattern] = [ordered]@{ count = 0; stepCount = $stepCount; sample = $dir.Name }
    }
    $patterns[$pattern].count++
}

Write-Host "compile_ok not in manifest: unique patterns=$($patterns.Count)"
$ranked = @($patterns.GetEnumerator() | Sort-Object { $_.Value.count } -Descending | Select-Object -First $Top)
foreach ($entry in $ranked) {
    $v = $entry.Value
    Write-Host ("  [{0,3}] steps={1,-2} {2}" -f $v.count, $v.stepCount, $entry.Key)
}
