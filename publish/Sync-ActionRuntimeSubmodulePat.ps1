#!/usr/bin/env pwsh
# Sync ACTIONRUNTIME_SUBMODULE_PAT → GitHub Actions secret for private submodule checkout in release-cli.yml.
#
# The PAT must read https://github.com/QuickerOrg/Quicker.ActionRuntime (classic: repo scope;
# fine-grained: Contents read on that repo). Used only at CI checkout — not shipped in qkrpc.

[CmdletBinding()]
param(
    [string]$RepoRoot = '',
    [string]$SecretName = 'ACTIONRUNTIME_SUBMODULE_PAT',
    [string]$Token = '',
    [switch]$FromGhAuth,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $RepoRoot) {
    $RepoRoot = Split-Path -Parent $PSScriptRoot
}

function Assert-GhAvailable {
    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        throw 'gh CLI not found. Install from https://cli.github.com/ and run: gh auth login'
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

function Read-DotEnvValue {
    param([string]$Path, [string]$Key)
    if (-not (Test-Path -LiteralPath $Path)) {
        return ''
    }
    foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
        $trimmed = $line.Trim()
        if ($trimmed -eq '' -or $trimmed.StartsWith('#')) {
            continue
        }
        if ($trimmed -match "^\s*$([regex]::Escape($Key))\s*=\s*(.*)$") {
            return $Matches[1].Trim().Trim('"').Trim("'")
        }
    }
    return ''
}

function Assert-ActionRuntimeRepoReadable {
    param([string]$Pat)
    $prev = $env:GH_TOKEN
    try {
        $env:GH_TOKEN = $Pat
        gh api repos/QuickerOrg/Quicker.ActionRuntime --jq .full_name 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw 'PAT cannot read QuickerOrg/Quicker.ActionRuntime. Grant repo read (classic repo scope or fine-grained Contents read).'
        }
    } finally {
        if ($null -eq $prev) {
            Remove-Item Env:GH_TOKEN -ErrorAction SilentlyContinue
        } else {
            $env:GH_TOKEN = $prev
        }
    }
}

Assert-GhAvailable

$repoSlug = Get-RepoSlug -Root $RepoRoot
if (-not $repoSlug) {
    throw 'Could not resolve GitHub repo slug from git remote origin.'
}

if ([string]::IsNullOrWhiteSpace($Token)) {
    $envPath = Join-Path $RepoRoot 'publish/.env'
    $Token = Read-DotEnvValue -Path $envPath -Key 'ACTIONRUNTIME_SUBMODULE_PAT'
}

if ([string]::IsNullOrWhiteSpace($Token) -and $FromGhAuth) {
    $Token = (gh auth token).Trim()
}

if ([string]::IsNullOrWhiteSpace($Token)) {
    throw @"
Missing PAT. Set publish/.env → ACTIONRUNTIME_SUBMODULE_PAT=<token>, or pass -Token, or -FromGhAuth (uses gh auth token).
Create a fine-grained PAT on QuickerOrg/Quicker.ActionRuntime with Contents read-only (recommended).
"@
}

Assert-ActionRuntimeRepoReadable -Pat $Token

Write-Host "Target repo: $repoSlug"
Write-Host "Secret: $SecretName (length $($Token.Length))"
Write-Host 'Submodule: QuickerOrg/Quicker.ActionRuntime (private, read-only at CI checkout)'

if ($DryRun) {
    Write-Host "[DryRun] Would run: gh secret set $SecretName --repo $repoSlug"
    exit 0
}

gh secret set $SecretName --repo $repoSlug --body $Token
if ($LASTEXITCODE -ne 0) {
    throw "gh secret set failed (exit $LASTEXITCODE)."
}

Write-Host "GitHub secret '$SecretName' updated on $repoSlug." -ForegroundColor Green
