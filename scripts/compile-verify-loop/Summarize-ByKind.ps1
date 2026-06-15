#Requires -Version 7.0
<#
.SYNOPSIS
  Break down compile-verify-loop cases by source.kind and status.

.EXAMPLE
  pwsh -NoProfile -File ./scripts/compile-verify-loop/Summarize-ByKind.ps1
  pwsh -NoProfile -File ./scripts/compile-verify-loop/Summarize-ByKind.ps1 -Json
#>
param([switch] $Json)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'CompileVerifyLoop.Common.ps1')

$casesDir = Join-Path (Get-CompileVerifyLoopRoot) 'cases'
$byKind = @{}

foreach ($dir in @(Get-ChildItem -LiteralPath $casesDir -Directory -ErrorAction SilentlyContinue)) {
    $case = Read-CompileVerifyCase -CaseId $dir.Name
    if ($null -eq $case) {
        continue
    }

    $kind = [string]($case.source.kind ?? 'unknown')
    $status = [string]$case.status
    if (-not $byKind.ContainsKey($kind)) {
        $byKind[$kind] = @{}
    }

    if (-not $byKind[$kind].ContainsKey($status)) {
        $byKind[$kind][$status] = 0
    }

    $byKind[$kind][$status]++
}

$rows = [System.Collections.Generic.List[object]]::new()
foreach ($kind in ($byKind.Keys | Sort-Object)) {
    $total = ($byKind[$kind].Values | Measure-Object -Sum).Sum
    $rows.Add([ordered]@{
        kind   = $kind
        total  = $total
        counts = $byKind[$kind]
    })
}

$summary = [ordered]@{
    ok    = $true
    root  = Get-CompileVerifyLoopRoot
    kinds = @($rows)
}

if ($Json) {
    $summary | ConvertTo-Json -Depth 6
}
else {
    Write-Host "Summarize-ByKind @ $(Get-CompileVerifyLoopRoot)"
    foreach ($row in $rows) {
        $parts = @($row.counts.GetEnumerator() | Sort-Object Name | ForEach-Object { "$($_.Name)=$($_.Value)" })
        Write-Host ("  {0,-22} total={1,-4} {2}" -f $row.kind, $row.total, ($parts -join ' '))
    }
}
