#Requires -Version 7.0
<#
.SYNOPSIS
  List compile_ok cases whose supported steps are all Full-tier (runtime-success candidates).
#>
param(
    [switch] $Json,
    [int] $Top = 20
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'CompileVerifyLoop.Common.ps1')

$casesDir = Join-Path (Get-CompileVerifyLoopRoot) 'cases'
$hits = [System.Collections.Generic.List[object]]::new()

foreach ($dir in @(Get-ChildItem -LiteralPath $casesDir -Directory -ErrorAction SilentlyContinue)) {
    $case = Read-CompileVerifyCase -CaseId $dir.Name
    if ($null -eq $case -or [string]$case.status -ne 'compile_ok') {
        continue
    }

    $lcPath = Join-Path $dir.FullName 'last-compile.json'
    if (-not (Test-Path -LiteralPath $lcPath)) {
        continue
    }

    $lc = Read-CompileVerifyJsonFile -Path $lcPath
    $keys = @($lc.supportedStepKeys | ForEach-Object { $_.ToLowerInvariant() })
    if (-not (Test-CompileVerifyFullTierStepKeys -StepKeys $keys)) {
        continue
    }

    $hits.Add([ordered]@{
        caseId  = $dir.Name
        steps   = [int]($lc.totalStepCount ?? $keys.Count)
        pattern = ($keys -join '+')
    })
}

$patternCounts = @{}
foreach ($hit in $hits) {
    $pattern = [string]$hit.pattern
    if ([string]::IsNullOrWhiteSpace($pattern)) {
        $pattern = '(empty)'
    }

    $patternCounts[$pattern] = 1 + [int]($patternCounts[$pattern] ?? 0)
}

$grouped = @($patternCounts.GetEnumerator() | Sort-Object { $_.Value } -Descending | Select-Object -First $Top | ForEach-Object {
    $patternKey = $_.Key
    $sampleHit = $hits | Where-Object { [string]$_.pattern -eq $patternKey -or ($patternKey -eq '(empty)' -and [string]::IsNullOrWhiteSpace($_.pattern)) } | Select-Object -First 1
    [ordered]@{
        pattern = $patternKey
        count   = $_.Value
        sample  = $sampleHit.caseId
    }
})

$summary = [ordered]@{
    ok    = $true
    total = $hits.Count
    top   = $grouped
}

if ($Json) {
    $summary | ConvertTo-Json -Depth 6
}
else {
    Write-Host "Scan-FullTierMockable: compile_ok full-tier-only=$($hits.Count)"
    foreach ($row in $grouped) {
        Write-Host "  [$($row.count)] $($row.pattern) sample=$($row.sample)"
    }
}
