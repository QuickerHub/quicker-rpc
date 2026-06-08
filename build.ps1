#!/usr/bin/env pwsh
# Build QuickerRpc plugin (qkbuild) and publish qkrpc CLI (publish-rpc.ps1).
# On success, launches the Quicker action that loads/reloads the plugin (quicker:runaction).
# Stops any running qkrpc serve before build (unlocks DLLs), then starts serve from publish/cli.
# Examples:
#   pwsh ./build.ps1
#   pwsh ./build.ps1 -Test          # or -t: skip CLI zip/setup + redundant plugin publish
#   pwsh ./build.ps1 -Publish -NoVersion   # release: upload quicker.rpc, no version bump
#   pwsh ./build.ps1 -Test -SkipCliPackaging:$false   # force full CLI packaging
#   pwsh ./build.ps1 -Test -SkipQkrpcServe            # no kill/restart of qkrpc serve

param(
    [switch]$SkipCliPackaging,
    [switch]$SkipQkrpcServe,
  # First-class qkbuild flags (avoid PowerShell common-parameter clash on bare -p / -n).
    [Alias('p')]
    [switch]$Publish,
    [Alias('n')]
    [switch]$NoVersion,
    [Alias('t')]
    [switch]$Test,
    [Parameter(ValueFromRemainingArguments = $true)]
    [object[]]$QkbuildArgs
)

$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'publish\qkrpc-publish-lib.ps1')

function Expand-QkbuildArgTokens {
    param([object[]]$Raw)
    $out = [System.Collections.Generic.List[string]]::new()
    foreach ($item in @($Raw)) {
        if ($null -eq $item) { continue }
        if ($item -is [System.Array]) {
            foreach ($sub in $item) {
                if (-not [string]::IsNullOrWhiteSpace([string]$sub)) {
                    $out.Add([string]$sub.Trim())
                }
            }
            continue
        }
        $text = [string]$item
        if ([string]::IsNullOrWhiteSpace($text)) { continue }
        $segments = if ($text -match '[\s,]') {
            $text -split '[\s,]+'
        }
        else {
            @($text)
        }
        foreach ($part in $segments) {
            if (-not [string]::IsNullOrWhiteSpace($part)) {
                $out.Add($part.Trim())
            }
        }
    }
    return $out
}

function Test-QkbuildFlag {
    param(
        [string[]]$Tokens,
        [string[]]$Names
    )
    foreach ($token in $Tokens) {
        $t = $token.Trim()
        foreach ($name in $Names) {
            if ($t -eq $name) { return $true }
        }
    }
    return $false
}

function Get-QkbuildInvocationArgs {
    param(
        [switch]$Publish,
        [switch]$NoVersion,
        [switch]$Test,
        [object[]]$Extra = @()
    )

    $extraTokens = Expand-QkbuildArgTokens -Raw $Extra
    if (Test-QkbuildFlag -Tokens $extraTokens -Names @('-p', '--publish')) {
        $Publish = $true
    }
    if (Test-QkbuildFlag -Tokens $extraTokens -Names @('-n', '--no-version')) {
        $NoVersion = $true
    }
    if (Test-QkbuildFlag -Tokens $extraTokens -Names @('-t', '--test')) {
        $Test = $true
    }

    $reserved = [System.Collections.Generic.HashSet[string]]::new(
        [StringComparer]::OrdinalIgnoreCase
    )
    foreach ($name in @('-p', '--publish', '-n', '--no-version', '-t', '--test')) {
        [void]$reserved.Add($name)
    }

    $args = [System.Collections.Generic.List[string]]::new()
    if ($Test) { $args.Add('--test') }
    if ($Publish) { $args.Add('--publish') }
    if ($NoVersion) { $args.Add('--no-version') }

    foreach ($token in $extraTokens) {
        if ($reserved.Contains($token)) { continue }
        $args.Add($token)
    }

    return ,@{
        Args    = $args.ToArray()
        Publish = [bool]$Publish
        NoVersion = [bool]$NoVersion
        Test    = [bool]$Test
    }
}

# Keep in sync with QuickerRpc.Contracts.Rpc.QuickerRpcBootstrap.PluginRunActionId
$PluginRunActionUri = 'quicker:runaction:aa5917ad-1256-4c73-7022-08debe3efcbe?plugin'

function Get-QkrpcServePort {
    $raw = $env:QKRPC_PORT
    if ([string]::IsNullOrWhiteSpace($raw)) {
        $raw = $env:AGENT_GUI_QKRPC_PORT
    }
    if ([string]::IsNullOrWhiteSpace($raw)) {
        return 9477
    }
    $port = 0
    if ([int]::TryParse($raw.Trim(), [ref]$port) -and $port -gt 0) {
        return $port
    }
    return 9477
}

function Get-QkrpcServeBaseUrl {
    param([string]$HostName = '127.0.0.1', [int]$Port = (Get-QkrpcServePort))
    return "http://${HostName}:$Port"
}

function Test-QkrpcServeListening {
    param(
        [string]$BaseUrl,
        [int]$TimeoutSec = 3
    )
    try {
        $resp = Invoke-WebRequest -Uri "$BaseUrl/health" -UseBasicParsing -TimeoutSec $TimeoutSec
        if ($resp.StatusCode -ne 200 -and $resp.StatusCode -ne 503) {
            return $false
        }
        $json = $resp.Content | ConvertFrom-Json
        return $null -ne $json.PSObject.Properties['ok']
    }
    catch {
        return $false
    }
}

function Test-QkrpcServeHealth {
    param(
        [string]$BaseUrl,
        [int]$TimeoutSec = 3
    )
    try {
        $resp = Invoke-WebRequest -Uri "$BaseUrl/health" -UseBasicParsing -TimeoutSec $TimeoutSec
        if ($resp.StatusCode -ne 200) {
            return $false
        }
        $json = $resp.Content | ConvertFrom-Json
        return $json.ok -eq $true
    }
    catch {
        return $false
    }
}

function Stop-QkrpcServe {
    $stopped = Stop-QkrpcProcesses -ServeOnly -GraceMs 2000
    if ($stopped -gt 0) {
        Write-Host "Stopped qkrpc serve (see PID log above)." -ForegroundColor Yellow
    }
    else {
        Write-Host "No qkrpc serve process found." -ForegroundColor DarkGray
    }
}

function Start-QkrpcServe {
    param(
        [string]$RepoRoot,
        [string]$HostName = '127.0.0.1'
    )

    $port = Get-QkrpcServePort
    $base = Get-QkrpcServeBaseUrl -HostName $HostName -Port $port
    $installedExe = Join-Path (Get-QkrpcDefaultInstallDir) 'qkrpc.exe'
    if (Test-Path -LiteralPath $installedExe) {
        $exe = $installedExe
        $cwd = Get-QkrpcDefaultInstallDir
    }
    else {
        $exe = Join-Path $RepoRoot 'publish\cli\qkrpc.exe'
        $cwd = Split-Path -Parent $exe
    }
    if (-not (Test-Path -LiteralPath $exe)) {
        Write-Warning "qkrpc.exe not found at $exe; skip starting serve."
        return
    }

    if (Test-QkrpcServeListening -BaseUrl $base -TimeoutSec 2) {
        if (Test-QkrpcServeHealth -BaseUrl $base -TimeoutSec 2) {
            Write-Host "qkrpc serve already healthy at $base" -ForegroundColor Green
        }
        else {
            Write-Host "qkrpc serve already listening at $base (Quicker/plugin may still be loading)" -ForegroundColor Yellow
        }
        return
    }

    Write-Host "=== qkrpc serve ===" -ForegroundColor Cyan
    Write-Host "Starting qkrpc serve at $base ($exe) ..." -ForegroundColor Yellow
    $null = Start-Process -FilePath $exe -ArgumentList @(
        'serve',
        '--host', $HostName,
        '--port', "$port",
        '--no-bootstrap'
    ) -WorkingDirectory $cwd -WindowStyle Hidden

    $deadline = (Get-Date).AddSeconds(45)
    while ((Get-Date) -lt $deadline) {
        if (Test-QkrpcServeListening -BaseUrl $base -TimeoutSec 3) {
            if (Test-QkrpcServeHealth -BaseUrl $base -TimeoutSec 3) {
                Write-Host "qkrpc serve ready: $base (GET /health ok=true)" -ForegroundColor Green
            }
            else {
                Write-Host "qkrpc serve listening: $base (GET /health — Quicker/plugin not connected yet)" -ForegroundColor Yellow
            }
            Write-Host "  agent-gui: set QKRPC_HTTP_URL=$base or use node agent-gui/start.mjs --dev" -ForegroundColor DarkGray
            return
        }
        Start-Sleep -Milliseconds 400
    }

    Write-Warning "qkrpc serve did not start listening at $base within 45s."
}

function Invoke-QuickerRpcPluginRunAction {
    Write-Host "=== QuickerRpc plugin (run action) ===" -ForegroundColor Cyan
    try {
        Start-Process $PluginRunActionUri | Out-Null
        Write-Host "Started: $PluginRunActionUri"
    }
    catch {
        Write-Warning "Could not start Quicker action (is Quicker running / protocol registered?): $_"
    }
}

$qkMeta = Get-QkbuildInvocationArgs -Publish:$Publish -NoVersion:$NoVersion -Test:$Test -Extra $QkbuildArgs
$qkbuildArgsResolved = $qkMeta.Args
$testBuild = $qkMeta.Test
$quickerDependencyUpload = $qkMeta.Publish -and $qkMeta.NoVersion

if ($qkMeta.Publish) {
    $versionJsonPath = Join-Path $PSScriptRoot 'version.json'
    $versionFromFile = (Get-Content -Raw -Path $versionJsonPath | ConvertFrom-Json).QuickerRpc
    $explicitVersion = Get-QuickerRpcVersionFromQkbuildArgs -Tokens $qkbuildArgsResolved
    $candidateVersion = if ($explicitVersion) { $explicitVersion } else { [string]$versionFromFile }
    Assert-QuickerRpcVersionMonotonic `
        -RepoRoot $PSScriptRoot `
        -CandidateVersion $candidateVersion `
        -AllowEqual:([bool]$quickerDependencyUpload)
}

if ($SkipCliPackaging.IsPresent) {
    $skipPackaging = [bool]$SkipCliPackaging
}
elseif ($quickerDependencyUpload) {
    # After GitHub Release: upload quicker.rpc + refresh local CLI; skip zip/setup/redundant plugin publish.
    $skipPackaging = $true
}
else {
    $skipPackaging = $testBuild
}

Push-Location $PSScriptRoot
$shouldStartQkrpcServe = -not $SkipQkrpcServe
try {
    if ($shouldStartQkrpcServe) {
        Write-Host "=== Stop qkrpc serve (pre-build) ===" -ForegroundColor Cyan
        Write-Host "  agent-gui dev on :3000 is left running (only qkrpc serve restarts)." -ForegroundColor DarkGray
        Stop-QkrpcServe
    }

    Write-Host "=== Action authoring docs ===" -ForegroundColor Cyan
    pwsh -NoProfile -File .\scripts\Generate-ActionAuthoringDocs.ps1
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }

    Write-Host "=== QuickerRpc.Plugin (qkbuild) ===" -ForegroundColor Cyan
    if ($quickerDependencyUpload) {
        Write-Host "Mode: Quicker dependency upload (--publish --no-version); CLI zip/setup skipped." -ForegroundColor Yellow
    }
    if ($qkbuildArgsResolved.Count -gt 0) {
        Write-Host "qkbuild args: $($qkbuildArgsResolved -join ' ')" -ForegroundColor DarkGray
    }
    $qkbuildCmd = @('build', '-c', 'build.yaml', '--project-path', '.\QuickerRpc.Plugin') + $qkbuildArgsResolved
    & qkbuild @qkbuildCmd
    if ($LASTEXITCODE -ne 0) {
        Write-Host "qkbuild failed (exit $LASTEXITCODE)." -ForegroundColor Red
        exit $LASTEXITCODE
    }

    Write-Host "=== qkrpc CLI (publish-rpc.ps1) ===" -ForegroundColor Cyan
    if ($skipPackaging) {
        Write-Host "SkipCliPackaging: dotnet publish CLI + install only (no zip, setup.exe, publish/plugin)." -ForegroundColor Yellow
    }
    $publishArgs = @()
    if ($skipPackaging) {
        $publishArgs += '-SkipPackaging'
    }
    pwsh -NoProfile -File .\publish\publish-rpc.ps1 @publishArgs
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }

    Invoke-QuickerRpcPluginRunAction

    if ($shouldStartQkrpcServe) {
        Start-QkrpcServe -RepoRoot $PSScriptRoot
        $shouldStartQkrpcServe = $false
    }

    exit 0
}
finally {
    if ($shouldStartQkrpcServe) {
        Write-Warning "Build did not finish; restarting qkrpc serve from existing publish/cli so agent-gui can reconnect."
        Start-QkrpcServe -RepoRoot $PSScriptRoot
    }
    Pop-Location
}
