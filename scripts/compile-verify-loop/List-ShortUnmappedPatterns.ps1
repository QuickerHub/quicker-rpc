#Requires -Version 7.0
param([int] $MaxSteps = 2)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'CompileVerifyLoop.Common.ps1')

$map = Get-CompileVerifyBenchmarkMockMap
$casesDir = Join-Path (Get-CompileVerifyLoopRoot) 'cases'
$groups = @{}

foreach ($dir in @(Get-ChildItem -LiteralPath $casesDir -Directory)) {
    $case = Read-CompileVerifyCase -CaseId $dir.Name
    if ($null -eq $case -or [string]$case.status -ne 'compile_ok') { continue }

    $aid = [string]$case.source.actionId
    if ($map.ContainsKey($aid.ToLowerInvariant())) { continue }
    if ($null -ne $case.mockRejectedProfiles -and @($case.mockRejectedProfiles).Count -gt 0) { continue }

    $lc = Read-CompileVerifyJsonFile -Path (Join-Path $dir.FullName 'last-compile.json')
    if ([int]$lc.totalStepCount -gt $MaxSteps) { continue }

    $keys = @($lc.supportedStepKeys | ForEach-Object { $_.ToLowerInvariant() } | Sort-Object -Unique) -join '+'
    if ($keys -match 'csscript|http|basic-ocr|jsscript') { continue }

    if (-not $groups.ContainsKey($keys)) { $groups[$keys] = 0 }
    $groups[$keys]++
}

Write-Host "compile_ok not in manifest (maxSteps=$MaxSteps):"
foreach ($entry in ($groups.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 15)) {
    $line = '[{0,3}] {1}' -f $entry.Value, $entry.Key
    Write-Host $line
}
