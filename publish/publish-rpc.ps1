# Publishes QuickerRpc.Console as non-single-file win-x64 self-contained layout.
# Safe to run from repo root or from this directory.

param(
    [switch]$SkipInstall,
    [switch]$SkipPath,
    [switch]$SkipSetup,
    # Test build (-t): skip zip, setup.exe, and publish/plugin (plugin already from qkbuild).
    [switch]$SkipPackaging,
    # Dev-only: bundle agent-gui/benchmarks/mock-profiles into publish/cli (not for QuickerAgent).
    [switch]$IncludeMockProfiles
)

# Backward-compatible alias for Publish-GitHubRelease.ps1 and older docs.
if ($SkipPath) { $SkipInstall = $true }

$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'qkrpc-publish-lib.ps1')

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

function Get-QuickerRpcVersionFromJson {
    param([string]$RepoRoot)

    $versionFile = Join-Path $RepoRoot 'version.json'
    if (-not (Test-Path -LiteralPath $versionFile)) {
        throw "version.json not found at $versionFile"
    }

    $json = Get-Content -LiteralPath $versionFile -Raw | ConvertFrom-Json
    $version = $json.QuickerRpc
    if ([string]::IsNullOrWhiteSpace($version)) {
        throw "version.json missing 'QuickerRpc' key"
    }

    return $version.ToString().Trim()
}

$repoRoot = Get-QuickerRpcRepoRoot -StartPath $PSScriptRoot
Set-Location -LiteralPath $repoRoot
$quickerRpcVersion = Get-QuickerRpcVersionFromJson -RepoRoot $repoRoot
$semver = Get-QuickerRpcSemVerFromVersion -Version $quickerRpcVersion

Write-Host "Publishing qkrpc.exe (QuickerRpc.Console, non-single-file, win-x64, self-contained)..." -ForegroundColor Green
Write-Host "Version (version.json): $quickerRpcVersion ($semver)" -ForegroundColor Cyan

$publishDir = Join-Path $repoRoot 'publish\cli'
# Stop qkrpc loaded from publish/cli (serve locks clrjit.dll) before removing the folder.
Clear-QkrpcPublishDirectory -PublishDir $publishDir
Write-Host "Creating publish directory: $publishDir" -ForegroundColor Yellow
New-Item -ItemType Directory -Path $publishDir -Force | Out-Null

$dotnetQuiet = @('-v:q', '--nologo')

$csproj = Join-Path $repoRoot 'QuickerRpc.Console\QuickerRpc.Console.csproj'
Write-Host "dotnet publish -> $publishDir (net10.0 production, mock excluded)" -ForegroundColor Yellow
dotnet publish $csproj -c Release -f net10.0 -r win-x64 --self-contained true -p:PublishSingleFile=false -p:DebugType=none -p:Version=$quickerRpcVersion -o $publishDir @dotnetQuiet

if ($LASTEXITCODE -ne 0) {
    Write-Host "Publish failed (dotnet exit $LASTEXITCODE)." -ForegroundColor Red
    exit $LASTEXITCODE
}

Get-ChildItem -LiteralPath $publishDir -Filter '*.pdb' -Recurse -File -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue

Assert-QkrpcPublishGoogleProtobuf -PublishDir $publishDir -RepoRoot $repoRoot

$skillsSource = Join-Path $repoRoot 'docs\skills'
$skillsDest = Join-Path $publishDir 'skills'
if (Test-Path -LiteralPath $skillsSource) {
    if (Test-Path -LiteralPath $skillsDest) {
        Remove-Item -LiteralPath $skillsDest -Recurse -Force
    }
    Copy-Item -LiteralPath $skillsSource -Destination $skillsDest -Recurse -Force
    Write-Host "Bundled agent skills -> $skillsDest" -ForegroundColor Cyan
}

$rulesSource = Join-Path $repoRoot 'docs\agent-rules'
$rulesDest = Join-Path $publishDir 'agent-rules'
if (Test-Path -LiteralPath $rulesSource) {
    if (Test-Path -LiteralPath $rulesDest) {
        Remove-Item -LiteralPath $rulesDest -Recurse -Force
    }
    Copy-Item -LiteralPath $rulesSource -Destination $rulesDest -Recurse -Force
    Write-Host "Bundled agent rules -> $rulesDest" -ForegroundColor Cyan
}

$cursorSyncScript = Join-Path $repoRoot 'scripts\sync-cursor-plugin.ps1'
if (Test-Path -LiteralPath $cursorSyncScript) {
    & pwsh -NoProfile -File $cursorSyncScript
    if ($LASTEXITCODE -ne 0) {
        Write-Host "sync-cursor-plugin failed (exit $LASTEXITCODE)." -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

$cursorPluginSource = Join-Path $repoRoot 'cursor-plugin\quicker-rpc'
$cursorPluginDest = Join-Path $publishDir 'cursor-plugin'
if (Test-Path -LiteralPath $cursorPluginSource) {
    if (Test-Path -LiteralPath $cursorPluginDest) {
        Remove-Item -LiteralPath $cursorPluginDest -Recurse -Force
    }
    Copy-Item -LiteralPath $cursorPluginSource -Destination $cursorPluginDest -Recurse -Force
    Write-Host "Bundled Cursor plugin -> $cursorPluginDest" -ForegroundColor Cyan
}

$codexSyncScript = Join-Path $repoRoot 'scripts\sync-codex-plugin.ps1'
if (Test-Path -LiteralPath $codexSyncScript) {
    & pwsh -NoProfile -File $codexSyncScript
    if ($LASTEXITCODE -ne 0) {
        Write-Host "sync-codex-plugin failed (exit $LASTEXITCODE)." -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

$codexPluginSource = Join-Path $repoRoot 'codex-plugin\quicker-rpc'
$codexPluginDest = Join-Path $publishDir 'codex-plugin'
if (Test-Path -LiteralPath $codexPluginSource) {
    if (Test-Path -LiteralPath $codexPluginDest) {
        Remove-Item -LiteralPath $codexPluginDest -Recurse -Force
    }
    Copy-Item -LiteralPath $codexPluginSource -Destination $codexPluginDest -Recurse -Force
    Write-Host "Bundled Codex plugin -> $codexPluginDest" -ForegroundColor Cyan
}

$mockProfilesSource = Join-Path $repoRoot 'agent-gui\benchmarks\mock-profiles'
$mockProfilesDest = Join-Path $publishDir 'benchmarks\mock-profiles'
if ($IncludeMockProfiles -and (Test-Path -LiteralPath $mockProfilesSource)) {
    if (Test-Path -LiteralPath $mockProfilesDest) {
        Remove-Item -LiteralPath $mockProfilesDest -Recurse -Force
    }
    Copy-Item -LiteralPath $mockProfilesSource -Destination $mockProfilesDest -Recurse -Force
    Write-Host "Bundled mock profiles (dev) -> $mockProfilesDest" -ForegroundColor Cyan
}

if (-not $SkipPackaging) {
    Write-Host "Publishing QuickerRpc plugin (Release, net472)..." -ForegroundColor Green
    $pluginCsproj = Join-Path $repoRoot 'QuickerRpc.Plugin\QuickerRpc.Plugin.csproj'
    $pluginPublishDir = Join-Path $repoRoot 'publish\plugin'
    if (Test-Path -LiteralPath $pluginPublishDir) {
        Remove-Item -LiteralPath (Join-Path $pluginPublishDir '*') -Recurse -Force -ErrorAction SilentlyContinue
    }
    else {
        New-Item -ItemType Directory -Path $pluginPublishDir -Force | Out-Null
    }

    dotnet publish $pluginCsproj -c Release -p:Version=$quickerRpcVersion -o $pluginPublishDir @dotnetQuiet
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Plugin publish failed (dotnet exit $LASTEXITCODE)." -ForegroundColor Red
        exit $LASTEXITCODE
    }

    $zipName = Get-QuickerRpcCliZipName -Version $quickerRpcVersion
    $zipPath = Join-Path $repoRoot "publish\$zipName"
    if (Test-Path -LiteralPath $zipPath) {
        Remove-Item -LiteralPath $zipPath -Force
    }

    Write-Host "Creating release archive: $zipName" -ForegroundColor Yellow
    Compress-Archive -Path (Join-Path $publishDir '*') -DestinationPath $zipPath -CompressionLevel Optimal -Force

    $latestZipName = Get-QkrpcLatestCliZipName
    $latestZipPath = Join-Path $repoRoot "publish\$latestZipName"
    Copy-Item -LiteralPath $zipPath -Destination $latestZipPath -Force
    Write-Host "Latest alias: $latestZipPath" -ForegroundColor Cyan

    $buildSetupScript = Join-Path $PSScriptRoot 'Build-QkrpcSetup.ps1'
    if ($SkipSetup) {
        Write-Host 'SkipSetup: setup.exe not built (use GitHub Actions release-cli or omit -SkipSetup).' -ForegroundColor Yellow
    }
    elseif (Test-Path -LiteralPath $buildSetupScript) {
        & pwsh -NoProfile -File $buildSetupScript -RepoRoot $repoRoot -SkipIfMissingCompiler
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Setup build failed (exit $LASTEXITCODE)." -ForegroundColor Red
            exit $LASTEXITCODE
        }
    }
    else {
        Write-Host "Build-QkrpcSetup.ps1 not found; skipping setup.exe." -ForegroundColor Yellow
    }
}
else {
    Write-Host "SkipPackaging: plugin DLL from qkbuild test package only; no zip/setup/publish/plugin." -ForegroundColor Yellow
}

Write-Host "Publish succeeded." -ForegroundColor Green
Write-Host "CLI:    $publishDir\qkrpc.exe" -ForegroundColor Cyan
if (-not $SkipPackaging) {
    Write-Host "Zip:    $zipPath" -ForegroundColor Cyan
    Write-Host "Plugin: $pluginPublishDir\QuickerRpc.Plugin.*.dll" -ForegroundColor Cyan
}

$exePath = Join-Path $publishDir 'qkrpc.exe'
if (Test-Path -LiteralPath $exePath) {
    $fileInfo = Get-Item -LiteralPath $exePath
    Write-Host "CLI size: $([math]::Round($fileInfo.Length / 1MB, 2)) MB" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "Examples:" -ForegroundColor Yellow
Write-Host "  qkrpc ping --json"
Write-Host "  qkrpc action update --id <guid> --changelog ""fix"" --json"
Write-Host ""
Write-Host "User install (after GitHub Release upload):" -ForegroundColor Yellow
Write-Host "  Download: $(Get-QkrpcLatestSetupDownloadUrl)"
Write-Host "  Or run: publish\$(Get-QkrpcLatestCliSetupName) (after Build-QkrpcSetup)"
Write-Host "  Cursor plugin: qkrpc agent setup --cursor-plugin"
Write-Host ""

if (-not $SkipInstall) {
    $installDir = Get-QkrpcDefaultInstallDir
    Install-QkrpcFromDirectory -SourceDirectory $publishDir -InstallDir $installDir | Out-Null
}
else {
    Write-Host "SkipInstall: CLI at publish/cli only (not deployed to $((Get-QkrpcDefaultInstallDir)))." -ForegroundColor DarkGray
    Write-Host "  Dev: build.ps1 -t and qkrpc serve use publish/cli; terminal PATH may still point at user install." -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "Load plugin in Quicker (expression registration):" -ForegroundColor Cyan
Write-Host "  load {packagePath}/QuickerRpc.Plugin.{version}.dll"
Write-Host "  type QuickerRpc.Plugin.Launcher, QuickerRpc.Plugin.{version}"

exit 0
