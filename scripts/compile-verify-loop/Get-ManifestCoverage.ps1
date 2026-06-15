#Requires -Version 7.0
param([switch] $Json)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'CompileVerifyLoop.Common.ps1')

$map = Get-CompileVerifyBenchmarkMockMap
$casesDir = Join-Path (Get-CompileVerifyLoopRoot) 'cases'
$byProfile = @{}
$byStatus = @{}

foreach ($dir in @(Get-ChildItem -LiteralPath $casesDir -Directory)) {
    $case = Read-CompileVerifyCase -CaseId $dir.Name
    if ($null -eq $case) { continue }
    $status = [string]$case.status
    $byStatus[$status] = 1 + ($byStatus[$status] ?? 0)
    $aid = [string]$case.source.actionId.ToLowerInvariant()
    if (-not $map.ContainsKey($aid)) { continue }
    $prof = $map[$aid]
    if (-not $byProfile.ContainsKey($prof)) {
        $byProfile[$prof] = @{ compile_ok = 0; mock_pass = 0; mock_fail = 0; other = 0 }
    }
    $bucket = if ($status -eq 'compile_ok') { 'compile_ok' }
        elseif ($status -eq 'mock_pass') { 'mock_pass' }
        elseif ($status -eq 'mock_fail') { 'mock_fail' }
        else { 'other' }
    $byProfile[$prof][$bucket]++
}

if ($Json) {
    @{ byProfile = $byProfile; byStatus = $byStatus } | ConvertTo-Json -Depth 5
}
else {
    Write-Host 'Manifest coverage by profile:'
    $byProfile.GetEnumerator() | Sort-Object Name | ForEach-Object {
        $v = $_.Value
        Write-Host ("  {0}: compile_ok={1} mock_pass={2} mock_fail={3} other={4}" -f $_.Key, $v.compile_ok, $v.mock_pass, $v.mock_fail, $v.other)
    }
    Write-Host 'Case status totals:'
    $byStatus.GetEnumerator() | Sort-Object Name | ForEach-Object { Write-Host ("  {0}={1}" -f $_.Key, $_.Value) }
}
