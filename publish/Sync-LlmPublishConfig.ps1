#!/usr/bin/env pwsh
# Sync agent-gui/llm-publish.config.json → GitHub Actions secret BUNDLED_LLM_CONFIG
# and Bitiful OSS (runtime refresh for installed QuickerAgent).

[CmdletBinding()]
param(
    [string]$RepoRoot = '',
    [string]$ConfigPath = '',
    [string]$SecretName = 'BUNDLED_LLM_CONFIG',
    [switch]$SkipBitiful,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'qkrpc-publish-lib.ps1')

if (-not $RepoRoot) {
    $RepoRoot = Split-Path -Parent $PSScriptRoot
}

if (-not $ConfigPath) {
    $ConfigPath = Join-Path $RepoRoot 'agent-gui/llm-publish.config.json'
}

function Assert-GhAvailable {
    $gh = Get-Command gh -ErrorAction SilentlyContinue
    if (-not $gh) {
        throw 'gh CLI not found. Install GitHub CLI and run: gh auth login'
    }
    gh auth status 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw 'gh is not authenticated. Run: gh auth login'
    }
}

function Get-RepoSlug {
    param([string]$Root)
    $remote = git -C $Root remote get-url origin 2>$null
    if (-not $remote) {
        return $null
    }
    if ($remote -match 'github\.com[:/](?<owner>[^/]+)/(?<repo>[^/.]+)') {
        return "$($Matches.owner)/$($Matches.repo)"
    }
    return $null
}

function Read-PublishConfig {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "llm publish config not found: $Path`nCopy agent-gui/llm-publish.config.example.json → agent-gui/llm-publish.config.json"
    }

    try {
        return Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
    } catch {
        throw "Invalid JSON in $Path`: $($_.Exception.Message)"
    }
}

function Assert-PublishConfigShape {
    param($Config, [string]$Path)

    $endpoints = @($Config.endpoints)
    if ($endpoints.Count -eq 0) {
        throw "$Path must contain at least one endpoint in 'endpoints'."
    }

    $valid = 0
    foreach ($entry in $endpoints) {
        $apiKey = [string]$entry.apiKey
        if ([string]::IsNullOrWhiteSpace($apiKey)) {
            continue
        }
        $valid++
    }

    if ($valid -eq 0) {
        throw "$Path has endpoints but none include a non-empty apiKey."
    }

    return $valid
}

function Remove-OrphanPublishGroups {
    param($Config, [string]$Path)

    if (-not $Config.groups) {
        return $Config
    }

    $referenced = @{}
    foreach ($entry in @($Config.endpoints)) {
        $groupId = [string]$entry.group
        if (-not [string]::IsNullOrWhiteSpace($groupId)) {
            $referenced[$groupId.Trim()] = $true
        }
    }

    foreach ($prop in @($Config.groups.PSObject.Properties)) {
        if ($referenced.ContainsKey($prop.Name)) {
            continue
        }
        Write-Host "Removing orphan group '$($prop.Name)' from $Path (no endpoints reference it)" -ForegroundColor Yellow
        $Config.groups.PSObject.Properties.Remove($prop.Name)
    }

    if ($Config.groups.PSObject.Properties.Count -eq 0) {
        $Config.PSObject.Properties.Remove('groups')
    }

    return $Config
}

function ConvertTo-CompactJson {
    param($Object)
    return ($Object | ConvertTo-Json -Compress -Depth 32)
}

$config = Read-PublishConfig -Path $ConfigPath
$config = Remove-OrphanPublishGroups -Config $config -Path $ConfigPath
$endpointCount = Assert-PublishConfigShape -Config $config -Path $ConfigPath
$body = ConvertTo-CompactJson -Object $config

Write-Host "Config: $ConfigPath"
Write-Host "Endpoints with apiKey: $endpointCount"
Write-Host "Secret: $SecretName ($($body.Length) chars)"

if ($DryRun) {
    Write-Host '[DryRun] Would run: gh secret set ...'
    if (-not $SkipBitiful) {
        Write-Host "[DryRun] Would upload llm-publish.config.json -> $(Get-QuickerAgentBitifulLlmPublishConfigUrl)"
    }
    exit 0
}

Assert-GhAvailable

$repoSlug = Get-RepoSlug -Root $RepoRoot
$ghArgs = @('secret', 'set', $SecretName, '--body', $body)
if ($repoSlug) {
    $ghArgs += @('--repo', $repoSlug)
    Write-Host "Repository: $repoSlug"
}

& gh @ghArgs
if ($LASTEXITCODE -ne 0) {
    throw "gh secret set failed with exit code $LASTEXITCODE"
}

Write-Host "Uploaded $SecretName to GitHub Actions secrets."

$bitifulUploaded = $false
if (-not $SkipBitiful) {
    Import-PublishSecretsFromFiles -PublishDir $PSScriptRoot
    $bitifulUploaded = [bool](Invoke-LlmPublishConfigBitifulUploadAuto `
        -RepoRoot $RepoRoot `
        -ConfigPath $ConfigPath `
        -PublishDir $PSScriptRoot)
}

Write-Host ''
Write-Host '=== publish config sync summary ===' -ForegroundColor Green
Write-Host "  Endpoints: $endpointCount"
Write-Host "  GitHub secret: $SecretName (repo-level, CI QuickerAgent build)"
if ($SkipBitiful) {
    Write-Host '  Bitiful OSS: skipped (-SkipBitiful)' -ForegroundColor DarkGray
}
elseif ($bitifulUploaded) {
    Write-Host "  Bitiful OSS: encrypted -> $(Get-QuickerAgentBitifulLlmPublishConfigUrl)" -ForegroundColor Cyan
}
else {
    Write-Host '  Bitiful OSS: skipped (missing BITIFUL_* or LLM_REMOTE_PUBLISH_CIPHER_PEPPER in publish/.env)' -ForegroundColor Yellow
}
Write-Host '  Installed agents: pull via Settings -> 拉取最新内置配置 (no reinstall)' -ForegroundColor DarkGray
Write-Host '  Pepper secret: unchanged (LLM_REMOTE_PUBLISH_CIPHER_PEPPER must stay fixed)' -ForegroundColor DarkGray
