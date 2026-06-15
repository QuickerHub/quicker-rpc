#Requires -Version 7.0
<#
.SYNOPSIS
  Normalize case directories to actionId and repair broken case.json from last-compile.json.

.EXAMPLE
  pwsh -NoProfile -File ./scripts/compile-verify-loop/Repair-Cases.ps1
  pwsh -NoProfile -File ./scripts/compile-verify-loop/Repair-Cases.ps1 -Json
#>
param(
    [switch] $Json,
    [switch] $DryRun
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'CompileVerifyLoop.Common.ps1')

$root = Get-CompileVerifyLoopRoot
$casesDir = Join-Path $root 'cases'
$report = @()

if (-not (Test-Path -LiteralPath $casesDir)) {
    throw "No cases directory: $casesDir"
}

foreach ($dir in @(Get-ChildItem -LiteralPath $casesDir -Directory)) {
    $compilePath = Join-Path $dir.FullName 'last-compile.json'
    $actionId = $null
    $compile = $null

    if (Test-Path -LiteralPath $compilePath) {
        $compile = Read-CompileVerifyJsonFile -Path $compilePath
        $actionId = [string]($compile?.actionId ?? '')
    }

    if ([string]::IsNullOrWhiteSpace($actionId)) {
        $caseTry = Read-CompileVerifyCase -CaseId $dir.Name
        if ($caseTry) {
            $actionId = [string]$caseTry.source.actionId
        }
    }

    if ([string]::IsNullOrWhiteSpace($actionId)) {
        $report += [ordered]@{ dir = $dir.Name; ok = $false; error = 'no actionId' }
        continue
    }

    $targetId = Get-CompileVerifyCaseId -Title '' -ActionId $actionId
    $targetDir = Get-CompileVerifyCasePath -CaseId $targetId
    $existingCase = Read-CompileVerifyCase -CaseId $dir.Name
    $status = [string]($existingCase?.status ?? 'pending')

    if ($compile) {
        $resolved = Resolve-CompileVerifyCompileStatus -Report $compile
        if ($status -notin @('mock_pass', 'mock_fail', 'skipped')) {
            $status = $resolved.status
        }
    }

    $title = [string]($compile?.actionTitle ?? $existingCase?.source?.title ?? '')
    $stepCount = [int]($compile?.totalStepCount ?? $existingCase?.source?.stepCount ?? 0)
    $editMs = [long]($existingCase?.source?.editMs ?? 0)
    if ($editMs -eq 0) {
        $editMs = Get-CompileVerifyActionEditMs -ActionId $actionId
    }

    $case = [ordered]@{
        id              = $targetId
        version         = 1
        source          = [ordered]@{
            kind        = [string]($existingCase?.source?.kind ?? 'quicker-local')
            actionId    = $actionId
            title       = $title
            editMs      = $editMs
            profileName = [string]($existingCase?.source?.profileName ?? '')
            batch       = [string]($existingCase?.source?.batch ?? 'local-composite')
            stepCount   = $stepCount
        }
        status          = $status
        phases          = $existingCase?.phases
        skipUntilEditMs = if (Test-CompileVerifySkipStatus -Status $status) { $editMs } else { 0 }
        tags            = @($existingCase?.tags ?? @())
        notes           = [string]($existingCase?.notes ?? '')
    }

    if ($compile -and -not $case.phases) {
        $resolved = Resolve-CompileVerifyCompileStatus -Report $compile
        $case.phases = [ordered]@{
            compile = [ordered]@{
                ok             = $resolved.ok
                at             = (Get-Date).ToUniversalTime().ToString('o')
                fullySupported = [bool]($compile.isFullySupported)
            }
        }
    }

    if ($DryRun) {
        $report += [ordered]@{
            ok       = $true
            from     = $dir.Name
            to       = $targetId
            moved    = ($dir.FullName -ne $targetDir)
            status   = $status
            actionId = $actionId
        }
        continue
    }

    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
    foreach ($file in Get-ChildItem -LiteralPath $dir.FullName -File) {
        $dest = Join-Path $targetDir $file.Name
        if ($file.FullName -ne $dest) {
            Move-Item -LiteralPath $file.FullName -Destination $dest -Force
        }
    }

    Write-CompileVerifyCase -Case $case

    if ($dir.FullName -ne $targetDir -and (Test-Path -LiteralPath $dir.FullName)) {
        $left = Get-ChildItem -LiteralPath $dir.FullName -Force -ErrorAction SilentlyContinue
        if (-not $left -or $left.Count -eq 0) {
            Remove-Item -LiteralPath $dir.FullName -Force -Recurse
        }
    }

    $report += [ordered]@{
        ok       = $true
        from     = $dir.Name
        to       = $targetId
        moved    = ($dir.Name -ne $targetId)
        status   = $status
        actionId = $actionId
    }
}

Update-CompileVerifyManifest | Out-Null

$summary = [ordered]@{
    ok     = $true
    dryRun = [bool]$DryRun
    count  = $report.Count
    items  = $report
}

if ($Json) {
    $summary | ConvertTo-Json -Depth 8
}
else {
    foreach ($item in $report) {
        Write-Host "$($item.from) -> $($item.to) status=$($item.status) moved=$($item.moved)"
    }
    Write-Host "Repaired $($report.Count) case(s)."
}
