#!/usr/bin/env pwsh
# Build QuickerRpc plugin (qkbuild) and publish qkrpc CLI (publish-rpc.ps1).
# On success, launches the Quicker action that loads/reloads the plugin (quicker:runaction).
# Stops any running qkrpc serve before build (unlocks DLLs), then starts serve from publish/cli.
# Examples:
#   pwsh ./build.ps1
#   pwsh ./build.ps1 -t          # test: skip CLI zip/setup + redundant plugin publish
#   pwsh ./build.ps1 -p -n
#   pwsh ./build.ps1 -t -SkipCliPackaging:$false   # force full CLI packaging
#   pwsh ./build.ps1 -t -SkipQkrpcServe            # no kill/restart of qkrpc serve

param(
    [switch]$SkipCliPackaging,
    [switch]$SkipQkrpcServe,
    [Parameter(ValueFromRemainingArguments = $true)]
    [object[]]$QkbuildArgs
)

$ErrorActionPreference = 'Stop'

# Keep in sync with QuickerRpc.Contracts.Rpc.QuickerRpcBootstrap.PluginRunActionId
$PluginRunActionUri = 'quicker:runaction:aa5917ad-1256-4c73-7022-08debe3efcbe'

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
    $stopped = [System.Collections.Generic.List[int]]::new()
    $procs = Get-CimInstance Win32_Process -Filter "Name = 'qkrpc.exe'" -ErrorAction SilentlyContinue
    foreach ($proc in $procs) {
        $cmd = $proc.CommandLine
        if ([string]::IsNullOrWhiteSpace($cmd)) {
            continue
        }
        if ($cmd -notmatch '\bserve\b') {
            continue
        }
        $procId = $proc.ProcessId
        try {
            Stop-Process -Id $procId -Force -ErrorAction Stop
            $stopped.Add($procId) | Out-Null
        }
        catch {
            Write-Warning "Could not stop qkrpc serve (PID $procId): $_"
        }
    }

    if ($stopped.Count -gt 0) {
        Write-Host "Stopped qkrpc serve (PID(s): $($stopped -join ', '))." -ForegroundColor Yellow
        Start-Sleep -Seconds 2
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
    $exe = Join-Path $RepoRoot 'publish\cli\qkrpc.exe'
    if (-not (Test-Path -LiteralPath $exe)) {
        Write-Warning "qkrpc.exe not found at $exe; skip starting serve."
        return
    }

    if (Test-QkrpcServeHealth -BaseUrl $base -TimeoutSec 2) {
        Write-Host "qkrpc serve already healthy at $base" -ForegroundColor Green
        return
    }

    $cwd = Split-Path -Parent $exe
    Write-Host "=== qkrpc serve ===" -ForegroundColor Cyan
    Write-Host "Starting qkrpc serve at $base ..." -ForegroundColor Yellow
    $null = Start-Process -FilePath $exe -ArgumentList @(
        'serve',
        '--host', $HostName,
        '--port', "$port"
    ) -WorkingDirectory $cwd -WindowStyle Hidden

    $deadline = (Get-Date).AddSeconds(45)
    while ((Get-Date) -lt $deadline) {
        if (Test-QkrpcServeHealth -BaseUrl $base -TimeoutSec 3) {
            Write-Host "qkrpc serve ready: $base (GET /health)" -ForegroundColor Green
            Write-Host "  agent-gui: set QKRPC_HTTP_URL=$base or use node agent-gui/start.mjs --dev" -ForegroundColor DarkGray
            return
        }
        Start-Sleep -Milliseconds 400
    }

    Write-Warning "qkrpc serve did not become healthy at $base within 45s (Quicker + plugin loaded?)."
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

$testBuild = ($QkbuildArgs -contains '-t')
if ($SkipCliPackaging.IsPresent) {
    $skipPackaging = [bool]$SkipCliPackaging
}
else {
    $skipPackaging = $testBuild
}

Push-Location $PSScriptRoot
try {
    if (-not $SkipQkrpcServe) {
        Write-Host "=== Stop qkrpc serve (pre-build) ===" -ForegroundColor Cyan
        Stop-QkrpcServe
    }

    Write-Host "=== Action authoring docs ===" -ForegroundColor Cyan
    pwsh -NoProfile -File .\scripts\Generate-ActionAuthoringDocs.ps1
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }

    Write-Host "=== QuickerRpc.Plugin (qkbuild) ===" -ForegroundColor Cyan
    $qkbuildCmd = @('build', '-c', 'build.yaml', '--project-path', '.\QuickerRpc.Plugin') + @($QkbuildArgs)
    & qkbuild @qkbuildCmd
    if ($LASTEXITCODE -ne 0) {
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

    if (-not $SkipQkrpcServe) {
        Start-QkrpcServe -RepoRoot $PSScriptRoot
    }

    Invoke-QuickerRpcPluginRunAction
    exit 0
}
finally {
    Pop-Location
}
