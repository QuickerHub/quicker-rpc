#Requires -Version 7.0
<#
.SYNOPSIS
  Import benchmark mock-profile actionIds into the compile-verify queue.

.EXAMPLE
  pwsh -NoProfile -File ./scripts/compile-verify-loop/Sync-BenchmarkCases.ps1
  pwsh -NoProfile -File ./scripts/compile-verify-loop/Sync-BenchmarkCases.ps1 -Json
#>
param(
    [switch] $Json,
    [switch] $DryRun
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'CompileVerifyLoop.Common.ps1')

$map = Get-CompileVerifyBenchmarkMockMap
$profilesDir = Get-CompileVerifyMockProfilesDir
$batch = 'benchmark-mock'
$batchDir = Join-Path (Get-CompileVerifyLoopRoot) 'batches' $batch
$imported = @()
$linked = 0
$missing = 0
$skipped = 0

if (-not $DryRun) {
    New-Item -ItemType Directory -Path $batchDir -Force | Out-Null
}

foreach ($entry in $map.GetEnumerator()) {
    $actionId = [string]$entry.Key
    $profileId = [string]$entry.Value
    $caseId = Get-CompileVerifyCaseId -Title '' -ActionId $actionId
    $caseDir = Get-CompileVerifyCasePath -CaseId $caseId
    $existing = Read-CompileVerifyCase -CaseId $caseId

    if ($null -ne $existing -and (Test-CompileVerifySkipStatus -Status $existing.status)) {
        $skipped++
        continue
    }

    $rc = Invoke-CompileVerifyRuntimeCheck -ActionId $actionId
    $compileReport = Read-CompileVerifyRuntimeCheckReport -Stdout $rc.Stdout
    if (-not (Test-CompileVerifyRuntimeCheckSucceeded -Report $compileReport -Raw $rc.Stdout)) {
        $missing++
        $imported += [ordered]@{
            actionId  = $actionId
            profileId = $profileId
            ok        = $false
            error     = 'runtime-check failed or action not found'
        }
        continue
    }

    if (Test-CompileVerifySubprogramOnlyReport -Report $compileReport -Raw $rc.Stdout) {
        $skipped++
        continue
    }

    $title = Get-CompileVerifyRegexField -Raw $rc.Stdout -Name 'actionTitle'
    $resolved = Resolve-CompileVerifyCompileStatus -Report $compileReport -Raw $rc.Stdout
    $status = $resolved.status
    $notes = ''

    if ($status -eq 'blocked' -and (Test-CompileVerifyHostOnlyUnsupported -Report $compileReport -Raw $rc.Stdout)) {
        $unsupported = Get-CompileVerifyUnsupportedStepKeys -Report $compileReport -Raw $rc.Stdout
        $status = 'skipped'
        $notes = Get-CompileVerifyHostOnlySkipNote -UnsupportedStepKeys $unsupported
    }

    $profileSrc = Join-Path $profilesDir "$profileId.json"
    $hasProfile = Test-Path -LiteralPath $profileSrc

    $imported += [ordered]@{
        actionId  = $actionId
        profileId = $profileId
        title     = $title
        status    = $status
        ok        = $true
        hasProfile = $hasProfile
    }

    if ($DryRun) {
        continue
    }

    Write-CompileVerifyJsonFile -Path (Join-Path $caseDir 'last-compile.json') -Object $compileReport
    $programJson = Get-CompileVerifyReportString -Object $compileReport -Name 'compiledProgramJson' -Raw $rc.Stdout
    if (-not [string]::IsNullOrWhiteSpace($programJson)) {
        Write-CompileVerifyProgramFile -Path (Join-Path $caseDir 'program.json') -ProgramJson $programJson
    }

    if ($hasProfile) {
        Copy-Item -LiteralPath $profileSrc -Destination (Join-Path $caseDir 'mock-profile.json') -Force
        $linked++
    }

    $editMs = [long]($existing?.source?.editMs ?? 0)
    $case = [ordered]@{
        id              = $caseId
        version         = 1
        source          = [ordered]@{
            kind        = 'benchmark-mock'
            actionId    = $actionId
            title       = $title
            editMs      = $editMs
            profileName = ''
            batch       = $batch
            stepCount   = [int]($compileReport.totalStepCount ?? 0)
        }
        status          = $status
        phases          = [ordered]@{
            compile = [ordered]@{
                ok             = $resolved.ok
                at             = (Get-Date).ToUniversalTime().ToString('o')
                fullySupported = Get-CompileVerifyReportBool -Object $compileReport -Name 'isFullySupported' -Raw $rc.Stdout
                exitCode       = $rc.ExitCode
            }
        }
        skipUntilEditMs = if (Test-CompileVerifySkipStatus -Status $status) { $editMs } else { 0 }
        tags            = @('benchmark')
        notes           = $notes
    }
    Write-CompileVerifyCase -Case $case
}

if (-not $DryRun) {
    Write-CompileVerifyJsonFile -Path (Join-Path $batchDir 'imported.json') -Object @{
        importedAt = (Get-Date).ToUniversalTime().ToString('o')
        batch      = $batch
        count      = @($imported | Where-Object { $_.ok }).Count
        items      = $imported
    }
    Update-CompileVerifyManifest | Out-Null
}

$summary = [ordered]@{
    ok       = $true
    dryRun   = [bool]$DryRun
    mapped   = $map.Count
    imported = @($imported | Where-Object { $_.ok }).Count
    missing  = $missing
    skipped  = $skipped
    linked   = $linked
    items    = $imported
}

if ($Json) {
    $summary | ConvertTo-Json -Depth 8
}
else {
    Write-Host "Sync-BenchmarkCases: mapped=$($map.Count) imported=$($summary.imported) linked=$linked missing=$missing skipped=$skipped"
    foreach ($item in ($imported | Where-Object { $_.ok })) {
        Write-Host "  OK $($item.actionId) -> $($item.profileId) status=$($item.status)"
    }
}
