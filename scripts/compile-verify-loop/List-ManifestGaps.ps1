#Requires -Version 7.0
param(
    [string] $ProfileId = '',
    [int] $Top = 30
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'CompileVerifyLoop.Common.ps1')

$map = Get-CompileVerifyBenchmarkMockMap
$filter = $ProfileId.Trim().ToLowerInvariant()
$casesDir = Join-Path (Get-CompileVerifyLoopRoot) 'cases'
$rows = @()

foreach ($dir in @(Get-ChildItem -LiteralPath $casesDir -Directory)) {
    $case = Read-CompileVerifyCase -CaseId $dir.Name
    if ($null -eq $case) { continue }
    $status = [string]$case.status
    if ($status -eq 'mock_pass') { continue }
    $aid = [string]$case.source.actionId
    $key = $aid.ToLowerInvariant()
    if (-not $map.ContainsKey($key)) { continue }
    $profile = $map[$key]
    if (-not [string]::IsNullOrWhiteSpace($filter) -and $profile.ToLowerInvariant() -ne $filter) { continue }

    $combo = ''
    $lcPath = Join-Path $dir.FullName 'last-compile.json'
    if (Test-Path -LiteralPath $lcPath) {
        $lc = Read-CompileVerifyJsonFile -Path $lcPath
        $combo = @($lc.supportedStepKeys | ForEach-Object { $_.ToLowerInvariant() } | Sort-Object -Unique) -join '+'
    }

    $rows += [pscustomobject]@{
        caseId  = $dir.Name
        status  = $status
        profile = $profile
        combo   = $combo
        title   = [string]$case.source.title
    }
}

$rows | Sort-Object status, combo | Select-Object -First $Top | Format-Table -AutoSize
Write-Host "total manifest gaps (not mock_pass): $($rows.Count)"
