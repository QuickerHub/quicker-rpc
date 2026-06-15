#Requires -Version 7.0
<#
.SYNOPSIS
  Re-run runtime-check compile for blocked cases (e.g. after registering a deliberate step module).

.EXAMPLE
  pwsh -NoProfile -File ./scripts/compile-verify-loop/Recompile-BlockedCases.ps1 -OnlyUnsupportedKey sys:csscript
  pwsh -NoProfile -File ./scripts/compile-verify-loop/Recompile-BlockedCases.ps1 -Limit 20
#>
param(
    [string] $OnlyUnsupportedKey = '',
    [int] $Limit = 0,
    [switch] $Json
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'CompileVerifyLoop.Common.ps1')

$onlyKey = $OnlyUnsupportedKey.Trim().ToLowerInvariant()
$casesDir = Join-Path (Get-CompileVerifyLoopRoot) 'cases'
$results = [System.Collections.Generic.List[object]]::new()
$processed = 0
$toCompileOk = 0
$stillBlocked = 0
$failed = 0

foreach ($dir in @(Get-ChildItem -LiteralPath $casesDir -Directory -ErrorAction SilentlyContinue)) {
    $case = Read-CompileVerifyCase -CaseId $dir.Name
    if ($null -eq $case -or [string]$case.status -ne 'blocked') {
        continue
    }

    if (-not [string]::IsNullOrWhiteSpace($onlyKey)) {
        $lcPath = Join-Path $dir.FullName 'last-compile.json'
        if (-not (Test-Path -LiteralPath $lcPath)) {
            continue
        }

        $lc = Read-CompileVerifyJsonFile -Path $lcPath
        $unsupported = @($lc.unsupportedStepKeys | ForEach-Object { $_.ToLowerInvariant() })
        if ($unsupported -notcontains $onlyKey) {
            continue
        }
    }

    if ($Limit -gt 0 -and $processed -ge $Limit) {
        break
    }

    $processed++
    $out = & (Join-Path $PSScriptRoot 'Invoke-Case.ps1') -CaseId $dir.Name -Force -Json | ConvertFrom-Json
    $status = [string]$out.status
    $results.Add([ordered]@{
        caseId = $dir.Name
        status = $status
        ok     = [bool]$out.ok
    })

    switch ($status) {
        'compile_ok' { $toCompileOk++ }
        'blocked' { $stillBlocked++ }
        default { $failed++ }
    }
}

$summary = [ordered]@{
    ok             = $true
    processed      = $processed
    toCompileOk    = $toCompileOk
    stillBlocked   = $stillBlocked
    failed         = $failed
    onlyUnsupportedKey = $onlyKey
    results        = $results
}

if ($Json) {
    $summary | ConvertTo-Json -Depth 6
}
else {
    Write-Host "Recompile-BlockedCases: processed=$processed compile_ok=$toCompileOk blocked=$stillBlocked failed=$failed"
}
