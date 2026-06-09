#!/usr/bin/env pwsh
# Upload plugin gallery registry.json to Bitiful (and optionally GitHub release asset).

[CmdletBinding()]
param(
    [string]$RepoRoot = '',
    [string]$RegistryPath = '',
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'qkrpc-publish-lib.ps1')

if (-not $RepoRoot) {
    $RepoRoot = Split-Path -Parent $PSScriptRoot
}
if (-not $RegistryPath) {
    $RegistryPath = Join-Path $RepoRoot 'publish/registry/registry.json'
}
if (-not (Test-Path -LiteralPath $RegistryPath)) {
    throw "Registry file not found: $RegistryPath"
}

Import-BitifulEnvFromFiles -PublishDir $PSScriptRoot
if (-not (Test-BitifulConfigured)) {
    throw 'Bitiful credentials required (publish/.env).'
}

$uploadScript = Join-Path $PSScriptRoot 'bitiful_upload.py'
$endpointUrl = if ([string]::IsNullOrWhiteSpace($env:BITIFUL_ENDPOINT_URL)) {
    'https://s3.bitiful.net'
}
else {
    $env:BITIFUL_ENDPOINT_URL.Trim()
}

$objectPrefix = 'quicker-agent/plugins'
$destCopy = Join-Path $env:TEMP "registry-upload-$PID.json"
Copy-Item -LiteralPath $RegistryPath -Destination $destCopy -Force

if ($DryRun) {
    Write-Host "[DryRun] Would upload $RegistryPath to s3://$objectPrefix/registry.json" -ForegroundColor DarkGray
    exit 0
}

$commonArgs = @(
    $uploadScript, $destCopy,
    '--asset',
    '--endpoint-url', $endpointUrl,
    '--object-prefix', $objectPrefix
)

if (Get-Command uv -ErrorAction SilentlyContinue) {
    & uv run --no-sync --with boto3 python @commonArgs
}
elseif (Get-Command python -ErrorAction SilentlyContinue) {
    & python @commonArgs
}
else {
    throw 'Neither uv nor python found for Bitiful upload.'
}

if ($LASTEXITCODE -ne 0) {
    throw "Registry upload failed with exit code $LASTEXITCODE"
}

Write-Host 'Uploaded registry: https://s3.bitiful.net/quicker-pkgs/quicker-agent/plugins/registry.json' -ForegroundColor Green
