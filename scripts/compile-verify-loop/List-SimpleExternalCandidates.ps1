#Requires -Version 7.0
param([int] $MaxSteps = 4, [int] $Top = 20)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'CompileVerifyLoop.Common.ps1')

$map = Get-CompileVerifyBenchmarkMockMap
$casesDir = Join-Path (Get-CompileVerifyLoopRoot) 'cases'
$candidates = @()

foreach ($dir in @(Get-ChildItem -LiteralPath $casesDir -Directory)) {
    $case = Read-CompileVerifyCase -CaseId $dir.Name
    if ($null -eq $case -or [string]$case.status -ne 'compile_ok') { continue }
    if (-not (Test-CompileVerifyCaseUsesExternalSubProgram -CaseDir $dir.FullName)) { continue }
    if (Test-CompileVerifyHasEmbeddedSubProgram -CaseDir $dir.FullName) { continue }

    $aid = [string]$case.source.actionId
    if ($map.ContainsKey($aid.ToLowerInvariant())) { continue }
    if (Test-CompileVerifyMockProfileRejected -Case $case -ProfileId 'subprogram-external-stub') { continue }

    $lc = Read-CompileVerifyJsonFile -Path (Join-Path $dir.FullName 'last-compile.json')
    $stepCount = [int]$lc.totalStepCount
    if ($stepCount -gt $MaxSteps) { continue }

    $keys = @($lc.supportedStepKeys | ForEach-Object { $_.ToLowerInvariant() })
    if ($keys -contains 'sys:basic-ocr' -or $keys -contains 'sys:http' -or $keys -contains 'sys:csscript') { continue }
    if ($keys -contains 'sys:screencapture' -and $keys -contains 'sys:subprogram') { continue }

    $candidates += [PSCustomObject]@{
        caseId  = $dir.Name
        steps   = $stepCount
        title   = [string]$case.source.title
        pattern = ($keys | Sort-Object -Unique) -join '+'
    }
}

Write-Host "external stub candidates (maxSteps=$MaxSteps): $($candidates.Count)"
$candidates | Sort-Object steps, pattern | Select-Object -First $Top | ForEach-Object {
    Write-Host "$($_.caseId) steps=$($_.steps) $($_.pattern)"
}
