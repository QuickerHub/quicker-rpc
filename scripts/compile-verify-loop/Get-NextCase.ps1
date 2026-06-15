#Requires -Version 7.0
<#
.SYNOPSIS
  Return the next compile-verify case that still needs work.

.EXAMPLE
  pwsh -NoProfile -File ./scripts/compile-verify-loop/Get-NextCase.ps1
  pwsh -NoProfile -File ./scripts/compile-verify-loop/Get-NextCase.ps1 -Json
#>
param(
    [switch] $Json,
    [switch] $IncludeBlocked,
    [switch] $IncludeMockPending,
    [switch] $ExcludeDeliberateBlocked
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'CompileVerifyLoop.Common.ps1')

$root = Get-CompileVerifyLoopRoot
$casesDir = Join-Path $root 'cases'
if (-not (Test-Path -LiteralPath $casesDir)) {
    if ($Json) {
        @{ ok = $false; message = 'No cases directory. Run Pull-Cases.ps1 first.' } | ConvertTo-Json
    }
    else {
        Write-Host 'No cases. Run Pull-Cases.ps1 first.'
    }
    exit 1
}

$priority = @('mock_fail', 'pending', 'compile_fail')
if ($IncludeMockPending) {
    $priority = @('mock_fail', 'mock_pending', 'pending', 'compile_fail')
}
if ($IncludeBlocked) {
    $priority += 'blocked'
}

function Test-CompileVerifyMockPendingCase {
    param(
        $Case,
        [string] $CaseDir
    )

    if ([string]$Case.status -ne 'compile_ok') {
        return $false
    }

    return Test-Path -LiteralPath (Join-Path $CaseDir 'mock-profile.json')
}

$candidates = @()
foreach ($caseFile in Get-ChildItem -LiteralPath $casesDir -Directory) {
    $case = Read-CompileVerifyCase -CaseId $caseFile.Name
    if ($null -eq $case) {
        continue
    }

    $status = [string]$case.status
    $isMockPending = $IncludeMockPending -and (Test-CompileVerifyMockPendingCase -Case $case -CaseDir $caseFile.FullName)

    if (Test-CompileVerifySkipStatus -Status $status) {
        if ($isMockPending) {
            $status = 'mock_pending'
        }
        elseif (-not ($IncludeBlocked -and $status -eq 'blocked')) {
            continue
        }
    }

    if ($status -eq 'blocked' -and -not $IncludeBlocked) {
        continue
    }

    if ($status -eq 'blocked' -and $ExcludeDeliberateBlocked) {
        $lcPath = Join-Path $caseFile.FullName 'last-compile.json'
        if (Test-Path -LiteralPath $lcPath) {
            $lc = Read-CompileVerifyJsonFile -Path $lcPath
            $unsupported = @($lc.unsupportedStepKeys)
            if (Test-CompileVerifyDeliberateExclusionOnly -UnsupportedStepKeys $unsupported) {
                continue
            }
        }
    }

    $prio = [array]::IndexOf($priority, $status)
    if ($prio -lt 0) {
        continue
    }

    $candidates += [PSCustomObject]@{
        Case     = $case
        Priority = $prio
        EditMs   = [long]($case.source.editMs ?? 0)
    }
}

$next = $candidates | Sort-Object Priority, EditMs -Descending | Select-Object -First 1
if ($null -eq $next) {
    if ($Json) {
        @{ ok = $true; caseId = $null; message = 'Queue empty (all passed or skipped).' } | ConvertTo-Json
    }
    else {
        Write-Host 'No runnable cases (all mock_pass / compile_ok / skipped).'
    }
    exit 0
}

$result = [ordered]@{
    ok     = $true
    caseId = $next.Case.id
    status = $next.Case.status
    source = $next.Case.source
    path   = Get-CompileVerifyCasePath -CaseId $next.Case.id
}

if ($Json) {
    $result | ConvertTo-Json -Depth 8
}
else {
    Write-Host "next: $($next.Case.id) status=$($next.Case.status) actionId=$($next.Case.source.actionId)"
    Write-Host "path: $(Get-CompileVerifyCasePath -CaseId $next.Case.id)"
}
