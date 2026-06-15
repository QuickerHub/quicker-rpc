#Requires -Version 7.0
<#
.SYNOPSIS
  List manifest gaps with step-count and step-key filters for safe mock probing.

.EXAMPLE
  pwsh -NoProfile -File ./scripts/compile-verify-loop/List-SimpleManifestGaps.ps1 -ProfileId subprogram-external-stub -MaxSteps 4 -ExcludeStepKey http
#>
param(
    [string] $ProfileId = '',
    [int] $MaxSteps = 4,
    [string[]] $ExcludeStepKey = @('sys:http', 'sys:screencapture', 'sys:form', 'sys:download', 'sys:filesystemwatch'),
    [int] $Top = 25
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'CompileVerifyLoop.Common.ps1')

$map = Get-CompileVerifyBenchmarkMockMap
$profileFilter = $ProfileId.Trim().ToLowerInvariant()
$exclude = @($ExcludeStepKey | ForEach-Object { $_.Trim().ToLowerInvariant() } | Where-Object { $_ })
$casesDir = Join-Path (Get-CompileVerifyLoopRoot) 'cases'
$rows = @()

foreach ($dir in @(Get-ChildItem -LiteralPath $casesDir -Directory)) {
    $case = Read-CompileVerifyCase -CaseId $dir.Name
    if ($null -eq $case -or [string]$case.status -eq 'mock_pass') { continue }

    $aid = [string]$case.source.actionId
    $key = $aid.ToLowerInvariant()
    if (-not $map.ContainsKey($key)) { continue }

    $profile = $map[$key]
    if (-not [string]::IsNullOrWhiteSpace($profileFilter) -and $profile.ToLowerInvariant() -ne $profileFilter) {
        continue
    }

    $lcPath = Join-Path $dir.FullName 'last-compile.json'
    if (-not (Test-Path -LiteralPath $lcPath)) { continue }

    $lc = Read-CompileVerifyJsonFile -Path $lcPath
    $stepCount = [int]($lc.totalStepCount ?? 0)
    if ($stepCount -gt $MaxSteps) { continue }

    $keys = @($lc.supportedStepKeys | ForEach-Object { $_.ToLowerInvariant() })
    $blocked = $false
    foreach ($bad in $exclude) {
        if ($keys -contains $bad) {
            $blocked = $true
            break
        }
    }

    if ($blocked) { continue }

    $rows += [pscustomobject]@{
        caseId    = $dir.Name
        steps     = $stepCount
        profile   = $profile
        combo     = ($keys | Sort-Object -Unique) -join '+'
        title     = [string]$case.source.title
    }
}

$rows = $rows | Sort-Object steps, combo
$rows | Select-Object -First $Top | Format-Table -AutoSize
Write-Host "simple manifest gaps: $($rows.Count) (maxSteps=$MaxSteps exclude=$($exclude -join ','))"
