#Requires -Version 7.0
param(
    [Parameter(Mandatory)]
    [string] $Pattern,
    [switch] $Apply
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'CompileVerifyLoop.Common.ps1')

$mapPath = Join-Path $PSScriptRoot 'templates' 'mock-action-profiles.json'
$doc = Get-Content -LiteralPath $mapPath -Raw -Encoding utf8 | ConvertFrom-Json
$want = $Pattern.Trim().ToLowerInvariant()
$casesDir = Join-Path (Get-CompileVerifyLoopRoot) 'cases'
$removed = @()

foreach ($dir in @(Get-ChildItem -LiteralPath $casesDir -Directory)) {
    $case = Read-CompileVerifyCase -CaseId $dir.Name
    if ($null -eq $case) { continue }
    $lcPath = Join-Path $dir.FullName 'last-compile.json'
    if (-not (Test-Path -LiteralPath $lcPath)) { continue }
    $lc = Read-CompileVerifyJsonFile -Path $lcPath
    $combo = @($lc.supportedStepKeys | ForEach-Object { $_.ToLowerInvariant() } | Sort-Object -Unique) -join '+'
    if ($combo -ne $want) { continue }

    $aid = [string]$case.source.actionId
    $key = $aid.ToLowerInvariant()
    if (-not $doc.profiles.PSObject.Properties.Name.Contains($key)) { continue }
    $removed += $key
    if ($Apply) {
        $doc.profiles.PSObject.Properties.Remove($key)
    }
}

if ($Apply -and $removed.Count -gt 0) {
    $doc | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $mapPath -Encoding utf8
}

Write-Host "Remove-ManifestProfileForPattern: pattern=$Pattern removed=$($removed.Count) apply=$Apply"
foreach ($id in $removed) { Write-Host "  $id" }
