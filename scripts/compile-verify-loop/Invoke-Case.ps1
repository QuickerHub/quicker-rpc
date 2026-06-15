#Requires -Version 7.0
<#
.SYNOPSIS
  Run runtime-check (and optional mock assert) for one compile-verify case.

.EXAMPLE
  pwsh -NoProfile -File ./scripts/compile-verify-loop/Invoke-Case.ps1 -CaseId clipboard-dedupe-5d3da582
  pwsh -NoProfile -File ./scripts/compile-verify-loop/Invoke-Case.ps1 -CaseId clipboard-dedupe-5d3da582 -Mock -Json
#>
param(
    [Parameter(Mandatory)]
    [string] $CaseId,

    [switch] $Mock,
    [switch] $MockOnly,
    [switch] $Force,
    [switch] $Json
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'CompileVerifyLoop.Common.ps1')

$case = Read-CompileVerifyCase -CaseId $CaseId
if ($null -eq $case -and $CaseId -match '^[0-9a-f]{8}-[0-9a-f]{4}-') {
    $case = Find-CompileVerifyCaseByActionId -ActionId $CaseId
    if ($case) {
        $CaseId = [string]$case.id
    }
}

if ($null -eq $case) {
    throw "Case not found: $CaseId"
}

$runCompile = -not $MockOnly
$runMock = $Mock -or $MockOnly

if (-not $Force -and -not $MockOnly -and (Test-CompileVerifySkipStatus -Status $case.status)) {
    $out = [ordered]@{
        ok      = $true
        skipped = $true
        caseId  = $CaseId
        status  = $case.status
        message = 'Case already passed; use -Force to re-run.'
    }
    if ($Json) { $out | ConvertTo-Json -Depth 6 } else { Write-Host $out.message }
    exit 0
}

$actionId = [string]$case.source.actionId
$caseDir = Get-CompileVerifyCasePath -CaseId $CaseId
$runtimeArgs = Get-CompileVerifyCaseRuntimeArgs -Case $case -CaseDir $caseDir
$now = (Get-Date).ToUniversalTime().ToString('o')

if ($runCompile) {
# Phase A: compile
$rc = Invoke-CompileVerifyQkrpcJson -Args $runtimeArgs.compileArgs
$compileReport = Read-CompileVerifyRuntimeCheckReport -Stdout $rc.Stdout
$titleFromStdout = Get-CompileVerifyRegexField -Raw $rc.Stdout -Name 'actionTitle'
Write-CompileVerifyJsonFile -Path (Join-Path $caseDir 'last-compile.json') -Object $compileReport

$resolved = Resolve-CompileVerifyCompileStatus -Report $compileReport -Raw $rc.Stdout
$status = $resolved.status

$programJson = Get-CompileVerifyReportString -Object $compileReport -Name 'compiledProgramJson' -Raw $rc.Stdout
if (-not [string]::IsNullOrWhiteSpace($programJson)) {
    Write-CompileVerifyProgramFile -Path (Join-Path $caseDir 'program.json') -ProgramJson $programJson
}

if (-not $case.phases) {
    $case.phases = @{}
}
Set-CompileVerifyCasePhase -Case $case -PhaseName 'compile' -PhaseData ([ordered]@{
    ok             = $resolved.ok
    at             = $now
    fullySupported = Get-CompileVerifyReportBool -Object $compileReport -Name 'isFullySupported' -Raw $rc.Stdout
    exitCode       = $rc.ExitCode
})
$case.status = $status
if (-not [string]::IsNullOrWhiteSpace($titleFromStdout)) {
    $case.source.title = $titleFromStdout
}

if ($status -in @('compile_fail', 'blocked')) {
    $prompt = New-CompileVerifyAgentPrompt -Case $case -Phase 'compile' -Report $compileReport
    Write-CompileVerifyUtf8File -Path (Join-Path $caseDir 'agent-prompt.md') -Content $prompt
}
}
else {
    $status = [string]$case.status
    $rc = [PSCustomObject]@{ ExitCode = 0 }
}

$mockResult = $null
$mockProfilePath = Join-Path $caseDir 'mock-profile.json'

if ($runMock -and (Test-Path -LiteralPath $mockProfilePath)) {
    if ($status -eq 'compile_ok' -or ($MockOnly -and $status -ne 'compile_fail')) {
        $mockArgs = @(
            $runtimeArgs.mockArgs +
            @(
                '--mock',
                '--mock-profile-file', $mockProfilePath,
                '--assert',
                '--json'
            )
        )
        $mr = Invoke-CompileVerifyQkrpcJson -Args $mockArgs
        $mockReport = ConvertFrom-CompileVerifyJson -Raw $mr.Stdout
        $lastMockPath = Join-Path $caseDir 'last-mock.json'
        if ($null -ne $mockReport) {
            Write-CompileVerifyJsonFile -Path $lastMockPath -Object $mockReport
        }
        elseif (-not [string]::IsNullOrWhiteSpace($mr.Stdout)) {
            Write-CompileVerifyUtf8File -Path $lastMockPath -Content $mr.Stdout.Trim()
        }

        $assertPassed = Test-CompileVerifyMockAssertPassed -Stdout $mr.Stdout -ExitCode $mr.ExitCode

        Set-CompileVerifyCasePhase -Case $case -PhaseName 'mock' -PhaseData ([ordered]@{
            ok        = $assertPassed
            at        = (Get-Date).ToUniversalTime().ToString('o')
            profileId = (Get-Content -LiteralPath $mockProfilePath -Raw | ConvertFrom-Json).id
            exitCode  = $mr.ExitCode
        })

        if ($assertPassed) {
            $case.status = 'mock_pass'
            $case.skipUntilEditMs = [long]($case.source.editMs ?? 0)
        }
        else {
            $profileId = ''
            if (Test-Path -LiteralPath $mockProfilePath) {
                $profileDoc = Read-CompileVerifyJsonFile -Path $mockProfilePath
                $profileId = [string]($profileDoc.id ?? '')
            }

            if (-not [string]::IsNullOrWhiteSpace($profileId)) {
                Add-CompileVerifyMockRejectedProfile -Case $case -ProfileId $profileId
            }

            $case.status = 'mock_fail'
            $prompt = New-CompileVerifyAgentPrompt -Case $case -Phase 'mock' -Report $mockReport
            Write-CompileVerifyUtf8File -Path (Join-Path $caseDir 'agent-prompt.md') -Content $prompt
        }

        $mockResult = [ordered]@{
            ok             = $assertPassed
            exitCode       = $mr.ExitCode
            assertionsPassed = $assertPassed
        }
    }
}
elseif ($runCompile -and $status -eq 'compile_ok') {
    $case.skipUntilEditMs = [long]($case.source.editMs ?? 0)
}

Write-CompileVerifyCase -Case $case

$manifestPath = Join-Path (Get-CompileVerifyLoopRoot) 'manifest.json'
if (Test-Path -LiteralPath $manifestPath) {
    $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding utf8 | ConvertFrom-Json
    $manifest.lastRunAt = (Get-Date).ToUniversalTime().ToString('o')
    Set-Content -LiteralPath $manifestPath -Value ($manifest | ConvertTo-Json -Depth 8) -Encoding utf8NoBOM
}
Update-CompileVerifyManifest | Out-Null

$summary = [ordered]@{
    ok           = $case.status -in @('compile_ok', 'mock_pass')
    caseId       = $CaseId
    status       = $case.status
    compile      = $case.phases.compile
    mock         = $mockResult
    agentPrompt  = if (Test-Path -LiteralPath (Join-Path $caseDir 'agent-prompt.md')) { 'agent-prompt.md' } else { $null }
}

if ($Json) {
    $summary | ConvertTo-Json -Depth 8
}
else {
    Write-Host "Invoke-Case $CaseId => status=$($case.status) compileExit=$($rc.ExitCode)"
    if ($mockResult) {
        Write-Host "  mock ok=$($mockResult.ok) exit=$($mockResult.exitCode)"
    }
}

if ($case.status -in @('compile_fail', 'mock_fail', 'blocked')) {
    exit 1
}
