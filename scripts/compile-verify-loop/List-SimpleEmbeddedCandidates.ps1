#Requires -Version 7.0
param([int] $MaxSteps = 6, [int] $Top = 15)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'CompileVerifyLoop.Common.ps1')

$map = Get-CompileVerifyBenchmarkMockMap
$casesDir = Join-Path (Get-CompileVerifyLoopRoot) 'cases'
$candidates = @()

foreach ($dir in @(Get-ChildItem -LiteralPath $casesDir -Directory)) {
    $case = Read-CompileVerifyCase -CaseId $dir.Name
    if ($null -eq $case -or [string]$case.status -ne 'compile_ok') { continue }
    if (-not (Test-CompileVerifyHasEmbeddedSubProgram -CaseDir $dir.FullName)) { continue }

    $aid = [string]$case.source.actionId
    if ($map.ContainsKey($aid.ToLowerInvariant())) { continue }
    if ($null -ne $case.mockRejectedProfiles -and @($case.mockRejectedProfiles).Count -gt 0) { continue }

    $lc = Read-CompileVerifyJsonFile -Path (Join-Path $dir.FullName 'last-compile.json')
    $stepCount = [int]$lc.totalStepCount
    if ($stepCount -gt $MaxSteps) { continue }

    $keys = @($lc.supportedStepKeys | ForEach-Object { $_.ToLowerInvariant() })
    $companionKeys = $keys | Where-Object { $_ -ne 'sys:subprogram' }
    if (-not (Test-CompileVerifyMockableOnlyStepKeys -StepKeys $companionKeys)) { continue }
    if ($keys -contains 'sys:csscript' -or $keys -contains 'sys:jsscript' -or $keys -contains 'sys:http') { continue }

    $candidates += [PSCustomObject]@{
        caseId    = $dir.Name
        steps     = $stepCount
        title     = [string]$case.source.title
        pattern   = ($keys | Sort-Object -Unique) -join '+'
    }
}

Write-Host "simple embedded stub-all candidates (maxSteps=$MaxSteps): $($candidates.Count)"
$candidates | Sort-Object steps, pattern | Select-Object -First $Top | ForEach-Object {
    Write-Host "$($_.caseId) steps=$($_.steps) $($_.pattern) $($_.title)"
}
