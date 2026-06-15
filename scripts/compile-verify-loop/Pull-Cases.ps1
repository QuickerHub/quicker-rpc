#Requires -Version 7.0
<#
.SYNOPSIS
  Pull local composite actions from Quicker into compile-verify-loop cases.

.EXAMPLE
  pwsh -NoProfile -File ./scripts/compile-verify-loop/Pull-Cases.ps1 -Batch local-composite
  pwsh -NoProfile -File ./scripts/compile-verify-loop/Pull-Cases.ps1 -Batch local-composite -DryRun -Limit 5
#>
param(
    [string] $Batch = 'local-composite',
    [switch] $DryRun,
    [int] $Limit = 0,
    [switch] $Json
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'CompileVerifyLoop.Common.ps1')

$root = Get-CompileVerifyLoopRoot
$batchDir = Join-Path $root 'batches' $Batch
$sourcesPath = Join-Path $batchDir 'sources.json'
$templateLocal = Join-Path $PSScriptRoot 'templates' 'sources.local-composite.json'
$templateLibrary = Join-Path $PSScriptRoot 'templates' 'sources.getquicker-library.json'

if (-not (Test-Path -LiteralPath $sourcesPath)) {
    New-Item -ItemType Directory -Path $batchDir -Force | Out-Null
    $templatePath = if ($Batch -eq 'getquicker-library') { $templateLibrary } else { $templateLocal }
    Copy-Item -LiteralPath $templatePath -Destination $sourcesPath
    Write-Warning "Created default sources at $sourcesPath"
}

$sources = Get-Content -LiteralPath $sourcesPath -Raw -Encoding utf8 | ConvertFrom-Json
$kind = [string]($sources.kind ?? 'quicker-local')
if ($kind -eq 'getquicker-library') {
    . (Join-Path $PSScriptRoot 'Pull-LibraryCases.ps1') -Batch $Batch -Sources $sources -DryRun:$DryRun -Limit $Limit -Json:$Json
    exit 0
}

$templatePath = $templateLocal
$listLimit = if ($Limit -gt 0) { $Limit } else { [int]($sources.list.limit ?? 100) }

$queryObj = $sources.list.query
$queryFile = Join-Path $batchDir '.list-query.json'
Write-CompileVerifyJsonFile -Path $queryFile -Object $queryObj

$listArgs = @(
    'action', 'list',
    '--query-file', $queryFile,
    '--limit', [string]$listLimit,
    '--json'
)
if ($sources.list.scope) {
    $listArgs += @('--scope', [string]$sources.list.scope)
}

$listResult = Invoke-CompileVerifyQkrpcJson -Args $listArgs
$items = Read-CompileVerifyActionList -ListResult $listResult
$postFilter = $sources.postFilter
$pulled = @()
$created = 0
$updated = 0
$skipped = 0
$hostSkipped = 0
$wrapperSkipped = 0

foreach ($item in $items) {
    $actionId = [string]$item.actionId
    if ([string]::IsNullOrWhiteSpace($actionId)) {
        continue
    }

    $rc = Invoke-CompileVerifyRuntimeCheck -ActionId $actionId
    $compileReport = Read-CompileVerifyRuntimeCheckReport -Stdout $rc.Stdout
    if (-not (Test-CompileVerifyRuntimeCheckSucceeded -Report $compileReport -Raw $rc.Stdout)) {
        $skipped++
        continue
    }

    $title = [string]($compileReport.actionTitle ?? '')
    if ([string]::IsNullOrWhiteSpace($title)) {
        $title = Get-CompileVerifyRegexField -Raw $rc.Stdout -Name 'actionTitle'
    }
    $stepCount = [int]($compileReport.totalStepCount ?? 0)
    $minSteps = [int]($postFilter.minStepCount ?? 1)

    if ($postFilter.excludeEmptyTitle -and [string]::IsNullOrWhiteSpace($title)) {
        $skipped++
        continue
    }

    if ($stepCount -lt $minSteps) {
        $skipped++
        continue
    }

    $excludeWrappers = $true
    if ($null -ne $postFilter.PSObject.Properties['excludeUsesOnlyWrappers']) {
        $excludeWrappers = [bool]$postFilter.excludeUsesOnlyWrappers
    }

    if ($excludeWrappers -and (Test-CompileVerifySubprogramOnlyReport -Report $compileReport -Raw $rc.Stdout)) {
        $skipped++
        $wrapperSkipped++
        continue
    }

    $caseId = Get-CompileVerifyCaseId -Title $title -ActionId $actionId
    $editMs = 0
    if ($item.lastEditTimeUtc) {
        try {
            $editMs = [DateTimeOffset]::Parse([string]$item.lastEditTimeUtc).ToUnixTimeMilliseconds()
        }
        catch {
            $editMs = 0
        }
    }

    $entry = [ordered]@{
        caseId      = $caseId
        actionId    = $actionId
        title       = $title
        editMs      = $editMs
        stepCount   = $stepCount
        profileName = [string]($item.profileName ?? '')
    }
    $pulled += $entry

    if ($DryRun) {
        continue
    }

    $caseDir = Get-CompileVerifyCasePath -CaseId $caseId
    $existing = Read-CompileVerifyCase -CaseId $caseId
    $needsWrite = $true
    $status = 'pending'

    if ($null -ne $existing) {
        if ($existing.source.editMs -eq $editMs -and (Test-CompileVerifySkipStatus -Status $existing.status)) {
            $needsWrite = $false
            $status = [string]$existing.status
        }
        elseif ($existing.source.editMs -ne $editMs) {
            $status = 'pending'
        }
        else {
            $status = [string]$existing.status
        }
        $updated++
    }
    else {
        $created++
    }

    if (-not $needsWrite) {
        continue
    }

    Write-CompileVerifyJsonFile -Path (Join-Path $caseDir 'last-compile.json') -Object $compileReport

    $resolved = Resolve-CompileVerifyCompileStatus -Report $compileReport -Raw $rc.Stdout
    $status = $resolved.status
    $notes = ''
    $skipHostOnly = $true
    if ($null -ne $postFilter.PSObject.Properties['skipHostOnlySteps']) {
        $skipHostOnly = [bool]$postFilter.skipHostOnlySteps
    }

    if ($skipHostOnly -and $status -eq 'blocked' -and (Test-CompileVerifyHostOnlyUnsupported -Report $compileReport -Raw $rc.Stdout)) {
        $unsupported = Get-CompileVerifyUnsupportedStepKeys -Report $compileReport -Raw $rc.Stdout
        $status = 'skipped'
        $notes = Get-CompileVerifyHostOnlySkipNote -UnsupportedStepKeys $unsupported
        $hostSkipped++
    }

    $compilePhase = [ordered]@{
        ok             = $resolved.ok
        at             = (Get-Date).ToUniversalTime().ToString('o')
        fullySupported = Get-CompileVerifyReportBool -Object $compileReport -Name 'isFullySupported' -Raw $rc.Stdout
        exitCode       = $rc.ExitCode
    }

    if ($compileReport.compiledProgramJson) {
        Write-CompileVerifyProgramFile -Path (Join-Path $caseDir 'program.json') -ProgramJson $compileReport.compiledProgramJson
    }

    $case = [ordered]@{
        id              = $caseId
        version         = 1
        source          = [ordered]@{
            kind        = 'quicker-local'
            actionId    = $actionId
            title       = $title
            editMs      = $editMs
            profileName = [string]($item.profileName ?? '')
            batch       = $Batch
            stepCount   = $stepCount
        }
        status          = $status
        phases          = [ordered]@{ compile = $compilePhase }
        skipUntilEditMs = if (Test-CompileVerifySkipStatus -Status $status) { $editMs } else { 0 }
        tags            = @()
        notes           = $notes
    }

    Write-CompileVerifyCase -Case $case
}

if (-not $DryRun) {
    Write-CompileVerifyJsonFile -Path (Join-Path $batchDir 'pulled.json') -Object @{
        pulledAt = (Get-Date).ToUniversalTime().ToString('o')
        batch    = $Batch
        count    = $pulled.Count
        items    = $pulled
    }
    Update-CompileVerifyManifest | Out-Null
}

$summary = [ordered]@{
    ok       = $true
    dryRun   = [bool]$DryRun
    batch    = $Batch
    listed   = $items.Count
    pulled   = $pulled.Count
    skipped        = $skipped
    hostSkipped    = $hostSkipped
    wrapperSkipped = $wrapperSkipped
    created        = $created
    updated  = $updated
    root     = $root
    items    = $pulled
}

if ($Json) {
    $summary | ConvertTo-Json -Depth 8
}
else {
    Write-Host "Pull-Cases batch=$Batch dryRun=$DryRun listed=$($items.Count) pulled=$($pulled.Count) skipped=$skipped wrapperSkipped=$wrapperSkipped hostSkipped=$hostSkipped created=$created updated=$updated"
    Write-Host "Root: $root"
}
