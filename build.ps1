#!/usr/bin/env pwsh
# Monorepo entry: forwards to QuickerRpc/build.ps1 (plugin + CLI publish).
param(
    [switch]$SkipCliPackaging,
    [switch]$SkipQkrpcServe,
    [Alias('p')]
    [switch]$Publish,
    [Alias('n')]
    [switch]$NoVersion,
    [Alias('t')]
    [switch]$Test,
    [switch]$Net10,
    [switch]$Net472,
    [switch]$SingleHost,
    [Parameter(ValueFromRemainingArguments = $true)]
    [object[]]$QkbuildArgs
)

$ErrorActionPreference = 'Stop'
$productBuild = Join-Path $PSScriptRoot 'QuickerRpc\build.ps1'
if (-not (Test-Path -LiteralPath $productBuild)) {
    Write-Error "Missing $productBuild"
}

& pwsh -NoProfile -File $productBuild @PSBoundParameters
exit $LASTEXITCODE
