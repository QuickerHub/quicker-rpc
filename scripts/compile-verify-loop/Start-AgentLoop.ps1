#Requires -Version 7.0
<#
.SYNOPSIS
  Semi-automatic agent loop: next case -> invoke -> stop on failure for agent fix.

.EXAMPLE
  pwsh -NoProfile -File ./scripts/compile-verify-loop/Start-AgentLoop.ps1 -MaxCases 5
  pwsh -NoProfile -File ./scripts/compile-verify-loop/Start-AgentLoop.ps1 -Mock -MaxRetries 2
#>
param(
    [int] $MaxCases = 0,
    [int] $MaxRetries = 3,
    [switch] $Mock,
    [switch] $MockOnly,
    [switch] $IncludeBlocked,
    [switch] $ExcludeDeliberateBlocked,
    [switch] $IncludeMockPending,
    [switch] $Json
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'CompileVerifyLoop.Common.ps1')

$processed = 0
$passed = 0
$failed = 0
$results = @()

while ($true) {
    if ($MaxCases -gt 0 -and $processed -ge $MaxCases) {
        break
    }

    if ($IncludeBlocked) {
        $nextArgs = @((Join-Path $PSScriptRoot 'Get-NextCase.ps1'), '-Json', '-IncludeBlocked')
        if ($ExcludeDeliberateBlocked) {
            $nextArgs += '-ExcludeDeliberateBlocked'
        }
    }
    else {
        $nextArgs = @((Join-Path $PSScriptRoot 'Get-NextCase.ps1'), '-Json')
    }
    if ($IncludeMockPending) {
        $nextArgs += '-IncludeMockPending'
    }
    $nextJson = & pwsh -NoProfile -File @nextArgs

    $next = $nextJson | ConvertFrom-Json
    if (-not $next.caseId) {
        break
    }

    $caseId = [string]$next.caseId
    $retries = 0
    $caseOk = $false

    while ($retries -le $MaxRetries) {
        $invokeArgs = @(
            (Join-Path $PSScriptRoot 'Invoke-Case.ps1'),
            '-CaseId', $caseId,
            '-Json'
        )
        if ($Mock.IsPresent) { $invokeArgs += '-Mock' }
        if ($MockOnly.IsPresent) { $invokeArgs += '-MockOnly' }
        $invokeJson = & pwsh -NoProfile -File @invokeArgs
        $invoke = $invokeJson | ConvertFrom-Json
        if ($invoke.ok -eq $true -and $invoke.status -in @('compile_ok', 'mock_pass')) {
            $caseOk = $true
            break
        }

        $retries++
        if ($retries -le $MaxRetries) {
            $promptPath = Join-Path (Get-CompileVerifyCasePath -CaseId $caseId) 'agent-prompt.md'
            if (-not $Json) {
                Write-Host "FAIL $caseId (retry $retries/$MaxRetries). Agent: read $promptPath then fix and re-run Invoke-Case."
            }
            break
        }
    }

    $processed++
    if ($caseOk) { $passed++ } else { $failed++ }

    $results += [ordered]@{
        caseId = $caseId
        ok     = $caseOk
        status = $invoke.status
        retries = $retries
    }

    if (-not $caseOk) {
        if ($Json) {
            [ordered]@{
                ok        = $false
                stoppedOn = $caseId
                processed = $processed
                passed    = $passed
                failed    = $failed
                results   = $results
                message   = 'Stopped on failure; fix runtime then re-run Start-AgentLoop.'
            } | ConvertTo-Json -Depth 8
        }
        else {
            Write-Host "Stopped on $caseId. Fix and re-run loop."
        }
        exit 1
    }
}

$summary = [ordered]@{
    ok        = $failed -eq 0
    processed = $processed
    passed    = $passed
    failed    = $failed
    results   = $results
}

if ($Json) {
    $summary | ConvertTo-Json -Depth 8
}
else {
    Write-Host "Loop done: $passed/$processed passed"
}

if ($failed -gt 0) { exit 1 }
