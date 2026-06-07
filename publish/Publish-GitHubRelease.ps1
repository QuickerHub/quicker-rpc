#!/usr/bin/env pwsh
# Push a release tag; zip + setup.exe are built by .github/workflows/release-cli.yml (GitHub Actions).
# Use -LocalBuild only when CI is unavailable (requires Inno Setup 6 locally).
#
# Examples:
#   pwsh ./publish/Publish-GitHubRelease.ps1
#   pwsh ./publish/Publish-GitHubRelease.ps1 -WaitForCi
#   pwsh ./publish/Publish-GitHubRelease.ps1 -LocalBuild
#   pwsh ./publish/Publish-GitHubRelease.ps1 -DryRun
#   pwsh ./publish/Test-QuickerAgentReleaseBuild.ps1   # preflight only (blocking)
#   pwsh ./publish/Publish-GitHubRelease.ps1 -SkipPreflight
#   pwsh ./publish/Publish-GitHubRelease.ps1 -PreflightBeforeTag   # wait for Tauri before tag (old behavior)

[CmdletBinding()]
param(
    [string]$RepoRoot = '',
    [string]$TagVersion = '',
    [string]$Commitish = 'HEAD',
    [string]$ReleaseTitle = '',
    [string]$Changelog = '',
    [string]$ChangelogFile = '',
    [switch]$AllowEmptyChangelog,
    [switch]$LocalBuild,
    [switch]$WaitForCi,
    [switch]$SkipSyncQuickerAgentActionDoc,
    [switch]$SkipBitifulUpload,
    [switch]$SkipBuild,
    [switch]$SkipTag,
    [switch]$SkipPreflight,
    # Block on local Tauri build before pushing tag (default: parallel with CI).
    [switch]$PreflightBeforeTag,
    # After tag/CI, wait for background preflight and print result.
    [switch]$WaitForPreflight,
    [switch]$ForceRetag,
    [switch]$Draft,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'qkrpc-publish-lib.ps1')

if (-not $RepoRoot) {
    $RepoRoot = Split-Path -Parent $PSScriptRoot
}

$versionFile = Join-Path $RepoRoot 'version.json'
if (-not (Test-Path -LiteralPath $versionFile)) {
    throw "version.json not found: $versionFile"
}

$versionData = Get-Content -Raw -Path $versionFile | ConvertFrom-Json
$quickerRpcVersion = [string]$versionData.QuickerRpc
if ([string]::IsNullOrWhiteSpace($quickerRpcVersion)) {
    throw "version.json missing QuickerRpc string."
}

Assert-QuickerRpcVersionMonotonic `
    -RepoRoot $RepoRoot `
    -CandidateVersion $quickerRpcVersion `
    -AllowEqual:$ForceRetag

$semantic = if ($TagVersion) {
    Get-QuickerRpcSemVerFromVersion -Version $TagVersion
}
else {
    Get-QuickerRpcSemVerFromVersion -Version $quickerRpcVersion
}

$tagName = "v$semantic"
$zipName = Get-QuickerRpcCliZipName -Version $semantic
$zipPath = Join-Path $RepoRoot "publish\$zipName"
$latestZipPath = Join-Path $RepoRoot "publish\$((Get-QkrpcLatestCliZipName))"
$setupName = Get-QuickerRpcCliSetupName -Version $semantic
$setupPath = Join-Path $RepoRoot "publish\$setupName"
$latestSetupPath = Join-Path $RepoRoot "publish\$((Get-QkrpcLatestCliSetupName))"
$installUrl = Get-QkrpcLatestSetupDownloadUrl

if (-not $ReleaseTitle) {
    $ReleaseTitle = "qkrpc $tagName"
}

function Assert-GhAvailable {
    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        throw 'GitHub CLI (gh) not found. Install from https://cli.github.com/ and run gh auth login.'
    }
}

function Get-ReleaseAssetPaths {
    if (-not (Test-Path -LiteralPath $zipPath)) {
        throw @"
CLI release zip not found: $zipPath
Run publish-rpc.ps1 first (or omit -SkipBuild with -LocalBuild).
"@
    }

    if (-not (Test-Path -LiteralPath $latestZipPath)) {
        throw "Latest CLI zip alias not found: $latestZipPath"
    }

    if (-not (Test-Path -LiteralPath $setupPath)) {
        throw @"
CLI setup installer not found: $setupPath
Run publish-rpc.ps1 first (requires Inno Setup 6 / ISCC.exe), or omit -SkipBuild with -LocalBuild.
"@
    }

    if (-not (Test-Path -LiteralPath $latestSetupPath)) {
        throw "Latest setup alias not found: $latestSetupPath"
    }

    return @($zipPath, $latestZipPath, $setupPath, $latestSetupPath)
}

function Invoke-LocalReleaseUpload {
    param(
        [string[]]$AssetPaths,
        [string]$NotesPath,
        [string]$Title
    )

    Assert-GhAvailable

    $ghArgs = @(
        'release', 'create', $tagName,
        '--title', $Title,
        '--notes-file', $NotesPath
    )
    $ghArgs += $AssetPaths
    if ($Draft) {
        $ghArgs += '--draft'
    }

    if ($DryRun) {
        Write-Host "[DryRun] gh $($ghArgs -join ' ')" -ForegroundColor DarkGray
        return
    }

    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    try {
        gh release view $tagName 2>$null | Out-Null
        $releaseExists = $LASTEXITCODE -eq 0
    }
    finally {
        $ErrorActionPreference = $prevEap
    }

    if ($releaseExists) {
        Write-Host "Release $tagName already exists; uploading assets..." -ForegroundColor Yellow
        gh release upload $tagName @AssetPaths --clobber
        if ($LASTEXITCODE -ne 0) {
            throw "gh release upload failed with exit code $LASTEXITCODE"
        }
    }
    else {
        gh @ghArgs
        if ($LASTEXITCODE -ne 0) {
            throw "gh release create failed with exit code $LASTEXITCODE"
        }
    }

    Write-Host 'Setting release notes...' -ForegroundColor Cyan
    gh release edit $tagName --notes-file $NotesPath
    if ($LASTEXITCODE -ne 0) {
        throw "gh release edit failed with exit code $LASTEXITCODE"
    }
}

function Wait-ReleaseCliWorkflow {
    param(
        [string]$RepoSlug,
        [string]$Tag
    )

    Assert-GhAvailable

    Write-Host "Waiting for release-cli workflow ($Tag)..." -ForegroundColor Cyan
    Start-Sleep -Seconds 8

    $runId = $null
    for ($i = 0; $i -lt 12; $i++) {
        $json = gh run list --repo $RepoSlug --workflow release-cli.yml --limit 8 --json databaseId,headBranch,status,conclusion 2>$null
        if ($LASTEXITCODE -eq 0 -and $json) {
            $runs = $json | ConvertFrom-Json
            $match = $runs | Where-Object { $_.headBranch -eq $Tag } | Select-Object -First 1
            if ($match) {
                $runId = [string]$match.databaseId
                break
            }
        }
        Start-Sleep -Seconds 5
    }

    if (-not $runId) {
        Write-Warning "Could not find release-cli run for $Tag. Check: https://github.com/$RepoSlug/actions/workflows/release-cli.yml"
        return
    }

    gh run watch $runId --repo $RepoSlug --exit-status
    if ($LASTEXITCODE -ne 0) {
        throw "release-cli workflow failed (run $runId)."
    }
}

$defaultChangelogPath = Get-QkrpcChangelogFilePath -RepoRoot $RepoRoot -Tag $tagName
$changelogContent = Resolve-QkrpcChangelogContent -Changelog $Changelog -ChangelogFile $ChangelogFile -RepoRoot $RepoRoot -Tag $tagName
$resolvedChangelogFile = if (-not [string]::IsNullOrWhiteSpace($ChangelogFile)) {
    $ChangelogFile
}
elseif (Test-Path -LiteralPath $defaultChangelogPath) {
    $defaultChangelogPath
}
else {
    ''
}

if ([string]::IsNullOrWhiteSpace($changelogContent)) {
    if ($AllowEmptyChangelog) {
        Write-Host 'Warning: no changelog; release notes will only include install instructions.' -ForegroundColor Yellow
    }
    else {
        throw @"
Release changelog is required.

Write publish/changelogs/$tagName.md (commit before tagging), or pass -Changelog / -ChangelogFile.
Expected path: $defaultChangelogPath
"@
    }
}
elseif ($resolvedChangelogFile) {
    Write-Host "Using changelog: $resolvedChangelogFile" -ForegroundColor Cyan
}

$repoSlug = Get-GitHubRepoSlug -Root $RepoRoot
$workflowUrl = "https://github.com/$repoSlug/actions/workflows/release-cli.yml"
$releaseUrl = "https://github.com/$repoSlug/releases/tag/$tagName"

$tagMessage = "Release $tagName (QuickerRpc $quickerRpcVersion)"
$preflightBackground = $null

if (-not $SkipPreflight -and -not $LocalBuild) {
    if ($DryRun) {
        if ($PreflightBeforeTag) {
            Write-Host '[DryRun] blocking preflight, then tag push' -ForegroundColor DarkGray
        }
        else {
            Write-Host '[DryRun] start background preflight + tag push in parallel' -ForegroundColor DarkGray
        }
    }
    elseif ($PreflightBeforeTag) {
        Write-Host ''
        Write-Host 'Preflight (blocking): local QuickerAgent Tauri build before tag push...' -ForegroundColor Cyan
        Invoke-QuickerAgentPreflightBlocking -RepoRoot $RepoRoot -PublishDir $PSScriptRoot
        Write-Host 'Preflight passed.' -ForegroundColor Green
        Write-Host ''
    }
    else {
        Write-Host ''
        Write-Host 'Starting local Tauri preflight in background (parallel with tag push / GitHub Actions)...' -ForegroundColor Cyan
        $preflightBackground = Start-QuickerAgentPreflightBackground `
            -RepoRoot $RepoRoot `
            -PublishDir $PSScriptRoot `
            -TagName $tagName
        Write-Host "  PID $($preflightBackground.Process.Id)  log: $($preflightBackground.LogFile)" -ForegroundColor DarkGray
        Write-Host '  Local errors usually appear first; fix from the log, then -ForceRetag re-release.' -ForegroundColor DarkGray
        Write-Host ''
    }
}

if (-not $SkipTag) {
    $tagIdentity = Get-GitTagIdentityArgs -RepoRoot $RepoRoot
    $tagCheck = git -C $RepoRoot tag -l $tagName
    if ($tagCheck) {
        if (-not $ForceRetag) {
            throw @"
Tag already exists: $tagName. After preflight passes, use -ForceRetag to move the tag to $Commitish, or delete the remote tag first.
"@
        }
        if ($DryRun) {
            Write-Host "[DryRun] git -C $RepoRoot tag -f -a $tagName $Commitish -m `"$tagMessage`"" -ForegroundColor DarkGray
            Write-Host "[DryRun] git -C $RepoRoot push -f origin refs/tags/$tagName" -ForegroundColor DarkGray
        }
        else {
            Write-Host "ForceRetag: moving $tagName -> $Commitish" -ForegroundColor Yellow
            Invoke-GitTag @($tagIdentity + '-C', $RepoRoot, 'tag', '-f', '-a', $tagName, $Commitish, '-m', $tagMessage)
            Invoke-GitTag @('-C', $RepoRoot, 'push', '-f', 'origin', "refs/tags/$tagName")
        }
    }
    elseif ($DryRun) {
        Write-Host "[DryRun] git -C $RepoRoot tag -a $tagName $Commitish -m `"$tagMessage`"" -ForegroundColor DarkGray
        Write-Host "[DryRun] git -C $RepoRoot push origin refs/tags/$tagName" -ForegroundColor DarkGray
    }
    else {
        Invoke-GitTag @($tagIdentity + '-C', $RepoRoot, 'tag', '-a', $tagName, $Commitish, '-m', $tagMessage)
        Invoke-GitTag @('-C', $RepoRoot, 'push', 'origin', "refs/tags/$tagName")
    }
}
else {
    Write-Host "SkipTag: not creating or pushing tag (ensure $tagName exists on remote)." -ForegroundColor Yellow
}

if ($LocalBuild) {
    if (-not $SkipBuild) {
        $publishScript = Join-Path $RepoRoot 'publish\publish-rpc.ps1'
        if (-not (Test-Path -LiteralPath $publishScript)) {
            throw "publish-rpc.ps1 not found: $publishScript"
        }

        if ($DryRun) {
            Write-Host "[DryRun] pwsh -NoProfile -File $publishScript -SkipInstall" -ForegroundColor DarkGray
        }
        else {
            & pwsh -NoProfile -File $publishScript -SkipInstall
            if ($LASTEXITCODE -ne 0) {
                throw "publish-rpc.ps1 failed with exit code $LASTEXITCODE"
            }
        }
    }

    $notesBody = New-QkrpcReleaseNotesBody -Tag $tagName -VersionFull $quickerRpcVersion -Changelog $changelogContent
    $notesPath = Join-Path $env:TEMP "qkrpc-release-notes-$tagName.md"
    Set-Content -LiteralPath $notesPath -Value $notesBody -Encoding utf8NoBOM

    if ($DryRun) {
        Write-Host "[DryRun] Expect assets: $zipPath, $setupPath" -ForegroundColor DarkGray
        Write-Host '[DryRun] Done (LocalBuild).' -ForegroundColor DarkGray
        exit 0
    }

    $assetPaths = @(Get-ReleaseAssetPaths)
    Invoke-LocalReleaseUpload -AssetPaths $assetPaths -NotesPath $notesPath -Title $ReleaseTitle

    Write-Host ''
    Write-Host "Release completed (local build): $tagName" -ForegroundColor Green
    Write-Host "Assets: $($assetPaths -join ', ')" -ForegroundColor Cyan
    Write-Host ''
    Write-Host 'Users can install with:' -ForegroundColor Yellow
    Write-Host "  $installUrl"
    exit 0
}

if ($DryRun) {
    Write-Host "[DryRun] CI will build zip + setup.exe via release-cli.yml" -ForegroundColor DarkGray
    Write-Host "[DryRun] $workflowUrl" -ForegroundColor DarkGray
    Write-Host '[DryRun] Done.' -ForegroundColor DarkGray
    exit 0
}

Write-Host ''
Write-Host "Tag pushed: $tagName" -ForegroundColor Green
Write-Host "GitHub Actions builds qkrpc zip/setup + QuickerAgent installer and publishes the release." -ForegroundColor Cyan
Write-Host "Workflow: $workflowUrl" -ForegroundColor Cyan
Write-Host "Release (when ready): $releaseUrl" -ForegroundColor Cyan

$ciError = $null
if ($WaitForCi) {
    try {
        Wait-ReleaseCliWorkflow -RepoSlug $repoSlug -Tag $tagName
        Write-Host ''
        Write-Host "Release completed: $releaseUrl" -ForegroundColor Green
    }
    catch {
        $ciError = $_
        Write-Host ''
        Write-Host 'GitHub Actions release failed (check local preflight log first — often the same fix).' -ForegroundColor Yellow
    }

    if (-not $ciError -and -not $SkipBitifulUpload) {
        $bitifulScript = Join-Path $PSScriptRoot 'Upload-QuickerAgentToBitiful.ps1'
        if (-not (Test-Path -LiteralPath $bitifulScript)) {
            throw "Upload-QuickerAgentToBitiful.ps1 not found: $bitifulScript"
        }

        Write-Host ''
        Write-Host 'Uploading QuickerAgent installer to Bitiful (local network)...' -ForegroundColor Cyan
        Import-BitifulEnvFromFiles -PublishDir $PSScriptRoot
        if (Test-BitifulConfigured) {
            if ($DryRun) {
                & pwsh -NoProfile -File $bitifulScript -RepoRoot $RepoRoot -Tag $tagName -Version $quickerRpcVersion -DryRun
            }
            else {
                & pwsh -NoProfile -File $bitifulScript -RepoRoot $RepoRoot -Tag $tagName -Version $quickerRpcVersion
                if ($LASTEXITCODE -ne 0) {
                    throw "Upload-QuickerAgentToBitiful.ps1 failed with exit code $LASTEXITCODE"
                }
            }
        }
        else {
            Write-Warning @'
Bitiful credentials not found; skipped local upload.
Copy publish/.env.example to publish/.env, or set BITIFUL_* env vars.
Run: pwsh ./publish/Upload-QuickerAgentToBitiful.ps1 -Tag <tag>
'@
        }
    }

    if (-not $ciError -and -not $SkipSyncQuickerAgentActionDoc) {
        $syncScript = Join-Path $PSScriptRoot 'Sync-QuickerAgentActionDoc.ps1'
        if (-not (Test-Path -LiteralPath $syncScript)) {
            throw "Sync-QuickerAgentActionDoc.ps1 not found: $syncScript"
        }

        Write-Host ''
        Write-Host 'Syncing QuickerAgent action page (Bitiful links from version.json)...' -ForegroundColor Cyan
        if ($DryRun) {
            & pwsh -NoProfile -File $syncScript -RepoRoot $RepoRoot -Version $semantic -DryRun
        }
        else {
            & pwsh -NoProfile -File $syncScript -RepoRoot $RepoRoot -Version $semantic -Push
            if ($LASTEXITCODE -ne 0) {
                throw "Sync-QuickerAgentActionDoc.ps1 failed with exit code $LASTEXITCODE"
            }
        }
    }
}
else {
    Write-Host ''
    Write-Host 'Tip: pass -WaitForCi to block until the workflow finishes (includes local Bitiful upload + action page sync).' -ForegroundColor DarkGray
    if ($preflightBackground) {
        Write-Host "Tip: local preflight log: $($preflightBackground.LogFile)" -ForegroundColor DarkGray
    }
    if (-not $SkipSyncQuickerAgentActionDoc) {
        Write-Host 'Tip: after CI, run: pwsh ./publish/Upload-QuickerAgentToBitiful.ps1 -Tag <tag>' -ForegroundColor DarkGray
        Write-Host 'Tip: then: pwsh ./publish/Sync-QuickerAgentActionDoc.ps1 -Push' -ForegroundColor DarkGray
    }
}

$preflightOk = Complete-QuickerAgentPreflightBackground `
    -Preflight $preflightBackground `
    -Wait:($WaitForPreflight) `
    -TagName $tagName

if ($ciError) {
    throw $ciError
}

Write-Host ''
Write-Host 'Users can install with (after CI completes):' -ForegroundColor Yellow
Write-Host "  $installUrl"

if ($preflightOk -eq $false -and $WaitForPreflight) {
    exit 1
}
