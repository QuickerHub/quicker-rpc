#Requires -Version 7.0
# Dot-sourced from Pull-Cases.ps1 when sources.kind = getquicker-library.

param(
    [string] $Batch,
    $Sources,
    [switch] $DryRun,
    [int] $Limit,
    [switch] $Json
)

$ErrorActionPreference = 'Stop'

$root = Get-CompileVerifyLoopRoot
$batchDir = Join-Path $root 'batches' $Batch
$search = $Sources.search
$postFilter = $Sources.postFilter
$keywords = @($search.keywords)
if ($keywords.Count -eq 0 -and $search.keyword) {
    $keywords = @([string]$search.keyword)
}

$pageStart = [int]($search.page ?? 1)
$maxPages = [int]($search.maxPages ?? 1)
$perPageLimit = [int]($search.limit ?? 10)
$days = [int]($search.days ?? 0)
$globalLimit = if ($Limit -gt 0) { $Limit } else { 0 }

$seen = @{}
$candidates = [System.Collections.Generic.List[object]]::new()

for ($page = $pageStart; $page -lt ($pageStart + $maxPages); $page++) {
    foreach ($keyword in $keywords) {
        $result = Invoke-CompileVerifyLibrarySearch -Keyword $keyword -Page $page -Limit $perPageLimit -Days $days
        $items = Read-CompileVerifyLibrarySearchItems -SearchResult $result
        foreach ($item in $items) {
            $sid = [string]($item.sharedActionId ?? '').Trim().ToLowerInvariant()
            if ([string]::IsNullOrWhiteSpace($sid) -or $seen.ContainsKey($sid)) {
                continue
            }

            $seen[$sid] = $true
            $candidates.Add($item)
            if ($globalLimit -gt 0 -and $candidates.Count -ge $globalLimit) {
                break
            }
        }

        if ($globalLimit -gt 0 -and $candidates.Count -ge $globalLimit) {
            break
        }
    }

    if ($globalLimit -gt 0 -and $candidates.Count -ge $globalLimit) {
        break
    }
}

$pulled = @()
$created = 0
$updated = 0
$skipped = 0
$hostSkipped = 0
$wrapperSkipped = 0
$fetchFailed = 0

foreach ($item in $candidates) {
    $sharedActionId = [string]$item.sharedActionId
    $title = [string]($item.title ?? '')
    $updatedAt = [string]($item.updatedAt ?? '')
    $editMs = Convert-CompileVerifyLibraryUpdatedAtToEditMs -UpdatedAt $updatedAt

    if ($postFilter.excludeEmptyTitle -and [string]::IsNullOrWhiteSpace($title)) {
        $skipped++
        continue
    }

    $sg = Invoke-CompileVerifySharedGet -SharedActionId $sharedActionId -ReturnMode 'full'
    $payload = Read-CompileVerifySharedGetPayload -Stdout $sg.Stdout
    if (-not $payload.Success -or [string]::IsNullOrWhiteSpace($payload.CompressedJson)) {
        $fetchFailed++
        $skipped++
        continue
    }

    $caseId = Get-CompileVerifyCaseId -Title $title -ActionId $sharedActionId
    $caseDir = Get-CompileVerifyCasePath -CaseId $caseId
    $compressedPath = Join-Path $caseDir 'shared-compressed.json'

    if ($DryRun) {
        $pulled += [ordered]@{
            caseId         = $caseId
            sharedActionId = $sharedActionId
            title          = $title
            editMs         = $editMs
            dryRun         = $true
        }
        continue
    }

    Write-CompileVerifyUtf8File -Path $compressedPath -Content $payload.CompressedJson

    $compileSource = 'shared-compressed'
    $rc = Invoke-CompileVerifyRuntimeCheckCompressed -CompressedFile $compressedPath
    $compileReport = Read-CompileVerifyRuntimeCheckReport -Stdout $rc.Stdout
    if (-not (Test-CompileVerifyRuntimeCheckBuilt -Report $compileReport -Raw $rc.Stdout)) {
        if ((Test-CompileVerifyCompressedPackageBuildFailed -Raw $rc.Stdout) `
                -and $payload.InstalledLocally `
                -and -not [string]::IsNullOrWhiteSpace($payload.LocalActionId)) {
            $rc = Invoke-CompileVerifyRuntimeCheck -ActionId $payload.LocalActionId
            $compileReport = Read-CompileVerifyRuntimeCheckReport -Stdout $rc.Stdout
            $compileSource = 'local-install'
        }
    }
    if (-not (Test-CompileVerifyRuntimeCheckBuilt -Report $compileReport -Raw $rc.Stdout)) {
        $skipped++
        continue
    }

    $stepCount = [int]($compileReport.totalStepCount ?? 0)
    $minSteps = [int]($postFilter.minStepCount ?? 1)
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

    $titleFromStdout = Get-CompileVerifyRegexField -Raw $rc.Stdout -Name 'actionTitle'
    if (-not [string]::IsNullOrWhiteSpace($titleFromStdout)) {
        $title = $titleFromStdout
    }

    $entry = [ordered]@{
        caseId         = $caseId
        sharedActionId = $sharedActionId
        title          = $title
        editMs         = $editMs
        stepCount      = $stepCount
    }
    $pulled += $entry

    $existing = Read-CompileVerifyCase -CaseId $caseId
    $needsWrite = $true
    if ($null -ne $existing) {
        if ($existing.source.editMs -eq $editMs -and (Test-CompileVerifySkipStatus -Status $existing.status)) {
            $needsWrite = $false
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
    $notes = 'Read-only getquicker library snapshot; do not patch shared action.'
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

    $programJson = Get-CompileVerifyReportString -Object $compileReport -Name 'compiledProgramJson' -Raw $rc.Stdout
    if (-not [string]::IsNullOrWhiteSpace($programJson)) {
        Write-CompileVerifyProgramFile -Path (Join-Path $caseDir 'program.json') -ProgramJson $programJson
    }

    $case = [ordered]@{
        id              = $caseId
        version         = 1
        source          = [ordered]@{
            kind            = 'getquicker-library'
            sharedActionId  = $sharedActionId
            actionId        = $sharedActionId
            localActionId   = [string]($payload.LocalActionId ?? '')
            title           = $title
            editMs          = $editMs
            updatedAt       = $updatedAt
            author          = [string]($item.author ?? '')
            batch           = $Batch
            stepCount       = $stepCount
            installedLocally = [bool]$payload.InstalledLocally
            compileVia      = $compileSource
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
        tags            = @('library')
        notes           = $notes
    }
    Write-CompileVerifyCase -Case $case
}

if (-not $DryRun) {
    Write-CompileVerifyJsonFile -Path (Join-Path $batchDir 'pulled.json') -Object @{
        pulledAt = (Get-Date).ToUniversalTime().ToString('o')
        batch    = $Batch
        kind     = 'getquicker-library'
        count    = $pulled.Count
        items    = $pulled
    }
    Update-CompileVerifyManifest | Out-Null
}

$summary = [ordered]@{
    ok             = $true
    dryRun         = [bool]$DryRun
    batch          = $Batch
    kind           = 'getquicker-library'
    searched       = $candidates.Count
    pulled         = $pulled.Count
    skipped        = $skipped
    fetchFailed    = $fetchFailed
    hostSkipped    = $hostSkipped
    wrapperSkipped = $wrapperSkipped
    created        = $created
    updated        = $updated
    root           = $root
    items          = $pulled
}

if ($Json) {
    $summary | ConvertTo-Json -Depth 8
}
else {
    Write-Host "Pull-LibraryCases batch=$Batch dryRun=$DryRun searched=$($candidates.Count) pulled=$($pulled.Count) skipped=$skipped fetchFailed=$fetchFailed wrapperSkipped=$wrapperSkipped hostSkipped=$hostSkipped created=$created updated=$updated"
    Write-Host "Root: $root"
}
