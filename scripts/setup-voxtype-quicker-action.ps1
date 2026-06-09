#Requires -Version 7.0
<#
.SYNOPSIS
  Apply or recreate VoxType Quicker action + VoxType_Run subprogram via qkrpc.

.DESCRIPTION
  Creates/updates:
  - Global subprogram VoxType_Run (%%66690bf9-9ae5-496c-b472-bf4cc78ecb07)
  - Action "VoxType 语音输入" (c1c5a328-b827-42eb-9a7d-9f43593e22fa)

  Dev: seed local plugin DLL under Documents\Quicker\_packages\voxtype.plugin\

.EXAMPLE
  pwsh -NoProfile -File ./scripts/setup-voxtype-quicker-action.ps1 -SeedLocalPlugin
#>
param(
    [switch]$SeedLocalPlugin,
    [string]$PluginDll = "..\voxtype\plugin\bin\Release\net472\VoxType.Plugin.dll"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$PatchDir = Join-Path $Root "scripts/voxtype-quicker"

$SubProgramId = "66690bf9-9ae5-496c-b472-bf4cc78ecb07"
$ActionId = "c1c5a328-b827-42eb-9a7d-9f43593e22fa"

if ($SeedLocalPlugin) {
    $src = Resolve-Path (Join-Path $Root $PluginDll) -ErrorAction SilentlyContinue
    if (-not $src) {
        Write-Warning "Build plugin first: cd voxtype/plugin && dotnet build -c Release"
    } else {
        $destDir = Join-Path $env:USERPROFILE "Documents/Quicker/_packages/voxtype.plugin/0.1.0.0"
        New-Item -ItemType Directory -Force -Path $destDir | Out-Null
        Copy-Item $src (Join-Path $destDir "VoxType.Plugin.0.1.0.0.dll") -Force
        $channel = Join-Path (Split-Path $src) "voxtype-plugin-channel.json"
        if (Test-Path $channel) { Copy-Item $channel $destDir -Force }
        Write-Host "Seeded local plugin: $destDir" -ForegroundColor Green
    }
}

Write-Host "==> Replace subprogram VoxType_Run" -ForegroundColor Cyan
$spFile = Join-Path $PatchDir "voxtype-run-subprogram.patch.json"
qkrpc subprogram replace --id $SubProgramId --program-file $spFile --force --json | Out-Null

Write-Host "==> Replace action VoxType 语音输入" -ForegroundColor Cyan
$actFile = Join-Path $PatchDir "voxtype-voice-action.patch.json"
qkrpc action replace --id $ActionId --xaction-file $actFile --force --json | Out-Null

Write-Host @"

Done.
  Subprogram: VoxType_Run  %%$SubProgramId
  Action:     VoxType 语音输入  $ActionId

Run examples:
  qkrpc action run --id $ActionId --param toggle --wait
  qkrpc action run --id $ActionId --param download --wait
  qkrpc action run --id $ActionId --param start --wait

Publish voxtype.plugin to getquicker (包名 voxtype.plugin) to enable network dep download.

"@ -ForegroundColor DarkGray
