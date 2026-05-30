# Publishes QuickerRpc.Console as non-single-file win-x64 self-contained layout.
# Safe to run from repo root or from this directory.

$ErrorActionPreference = 'Stop'

function Get-QuickerRpcRepoRoot {
    param([string]$StartPath)

    if ([string]::IsNullOrWhiteSpace($StartPath)) {
        $StartPath = (Get-Location).Path
    }

    $current = (Resolve-Path -LiteralPath $StartPath).Path.TrimEnd('\')
    for ($i = 0; $i -lt 8; $i++) {
        $marker = Join-Path $current 'QuickerRpc.Console\QuickerRpc.Console.csproj'
        if (Test-Path -LiteralPath $marker) {
            return $current
        }
        $parent = Split-Path -Parent $current
        if ([string]::IsNullOrEmpty($parent)) {
            break
        }
        $current = (Get-Item -LiteralPath $parent).FullName.TrimEnd('\')
    }

    throw "Repository root not found (missing QuickerRpc.Console\QuickerRpc.Console.csproj). Start from quicker-rpc or run from publish/."
}

$repoRoot = Get-QuickerRpcRepoRoot -StartPath $PSScriptRoot
Set-Location -LiteralPath $repoRoot

Write-Host "Publishing qkrpc.exe (QuickerRpc.Console, non-single-file, win-x64, self-contained)..." -ForegroundColor Green

$publishDir = Join-Path $repoRoot 'publish\cli'
if (Test-Path -LiteralPath $publishDir) {
    Write-Host "Cleaning previous publish output..." -ForegroundColor Yellow
    Remove-Item -LiteralPath (Join-Path $publishDir '*') -Recurse -Force -ErrorAction SilentlyContinue
}
else {
    Write-Host "Creating publish directory: $publishDir" -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $publishDir -Force | Out-Null
}

$csproj = Join-Path $repoRoot 'QuickerRpc.Console\QuickerRpc.Console.csproj'
Write-Host "dotnet publish -> $publishDir" -ForegroundColor Yellow
dotnet publish $csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=false -o $publishDir

if ($LASTEXITCODE -ne 0) {
    Write-Host "Publish failed (dotnet exit $LASTEXITCODE)." -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host "Publishing QuickerRpc plugin (Release, net472)..." -ForegroundColor Green
$pluginCsproj = Join-Path $repoRoot 'QuickerRpc.Plugin\QuickerRpc.Plugin.csproj'
$pluginPublishDir = Join-Path $repoRoot 'publish\plugin'
if (Test-Path -LiteralPath $pluginPublishDir) {
    Remove-Item -LiteralPath (Join-Path $pluginPublishDir '*') -Recurse -Force -ErrorAction SilentlyContinue
}
else {
    New-Item -ItemType Directory -Path $pluginPublishDir -Force | Out-Null
}

dotnet publish $pluginCsproj -c Release -o $pluginPublishDir
if ($LASTEXITCODE -ne 0) {
    Write-Host "Plugin publish failed (dotnet exit $LASTEXITCODE)." -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host "Publish succeeded." -ForegroundColor Green
Write-Host "CLI:    $publishDir\qkrpc.exe" -ForegroundColor Cyan
Write-Host "Plugin: $pluginPublishDir\QuickerRpc.Plugin.*.dll" -ForegroundColor Cyan

$exePath = Join-Path $publishDir 'qkrpc.exe'
if (Test-Path -LiteralPath $exePath) {
    $fileInfo = Get-Item -LiteralPath $exePath
    Write-Host "CLI size: $([math]::Round($fileInfo.Length / 1MB, 2)) MB" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "Examples:" -ForegroundColor Yellow
Write-Host "  .\publish\cli\qkrpc.exe ping --json"
Write-Host "  .\publish\cli\qkrpc.exe action update --id <guid> --changelog ""fix"" --json"
Write-Host ""

try {
    $publishPath = (Resolve-Path -LiteralPath $publishDir).Path
}
catch {
    $publishPath = $publishDir
}

Write-Host "Adding publish/cli to user PATH (if missing)..." -ForegroundColor Yellow
Write-Host "Publish path: $publishPath" -ForegroundColor Cyan

$currentPath = [Environment]::GetEnvironmentVariable('PATH', 'User')
if ($currentPath -notlike "*$publishPath*") {
    $newPath = if ($currentPath) { "$currentPath;$publishPath" } else { $publishPath }
    [Environment]::SetEnvironmentVariable('PATH', $newPath, 'User')
    Write-Host "Appended to user PATH: $publishPath" -ForegroundColor Green
    Write-Host "Restart the terminal for PATH to take effect." -ForegroundColor Yellow
}
else {
    Write-Host "Publish path already on user PATH." -ForegroundColor Green
}

Write-Host ""
Write-Host "Load plugin in Quicker (expression registration):" -ForegroundColor Cyan
Write-Host "  load {packagePath}/QuickerRpc.Plugin.{version}.dll"
Write-Host "  type QuickerRpc.Plugin.AssemblyLoader, QuickerRpc.Plugin.{version}"

exit 0
