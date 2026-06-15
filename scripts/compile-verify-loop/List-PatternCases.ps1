#Requires -Version 7.0
param(
    [Parameter(Mandatory)]
    [string] $Pattern
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'CompileVerifyLoop.Common.ps1')

$map = Get-CompileVerifyBenchmarkMockMap
$casesDir = Join-Path (Get-CompileVerifyLoopRoot) 'cases'
$want = $Pattern.Trim().ToLowerInvariant()

foreach ($dir in @(Get-ChildItem -LiteralPath $casesDir -Directory)) {
    $case = Read-CompileVerifyCase -CaseId $dir.Name
    if ($null -eq $case -or [string]$case.status -ne 'compile_ok') { continue }
    $lc = Read-CompileVerifyJsonFile -Path (Join-Path $dir.FullName 'last-compile.json')
    $keys = @($lc.supportedStepKeys | ForEach-Object { $_.ToLowerInvariant() } | Sort-Object -Unique) -join '+'
    if ($keys -ne $want) { continue }
    $aid = [string]$case.source.actionId
    $key = $aid.ToLowerInvariant()
    $profile = if ($map.ContainsKey($key)) { $map[$key] } else { '(none)' }
    Write-Host "$($dir.Name) actionId=$aid profile=$profile title=$($case.source.title)"
}
