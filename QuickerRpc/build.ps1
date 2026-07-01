#!/usr/bin/env pwsh
# QuickerRpc product build: qkbuild plugin + publish qkrpc CLI (via monorepo publish/).
# Run from repo root: pwsh ./build.ps1 -t  (wrapper forwards here)

param(
    [switch]$SkipCliPackaging,
    [switch]$SkipQkrpcServe,
    [switch]$SkipInstall,
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

$ProductRoot = $PSScriptRoot
$MonorepoRoot = Split-Path -Parent $ProductRoot

. (Join-Path $MonorepoRoot 'publish\qkrpc-publish-lib.ps1')

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
        $segments = if ($text -match '[\s,]') { $text -split '[\s,]+' } else { @($text) }
        foreach ($part in $segments) {
            if (-not [string]::IsNullOrWhiteSpace($part)) { $out.Add($part.Trim()) }
        }
    }
    return $out
}

function Test-QkbuildFlag {
    param([string[]]$Tokens, [string[]]$Names)
    foreach ($token in $Tokens) {
        foreach ($name in $Names) {
            if ($token.Trim() -eq $name) { return $true }
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
    if (Test-QkbuildFlag -Tokens $extraTokens -Names @('-p', '--publish')) { $Publish = $true }
    if (Test-QkbuildFlag -Tokens $extraTokens -Names @('-n', '--no-version')) { $NoVersion = $true }
    if (Test-QkbuildFlag -Tokens $extraTokens -Names @('-t', '--test')) { $Test = $true }

    $reserved = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($name in @('-p', '--publish', '-n', '--no-version', '-t', '--test')) { [void]$reserved.Add($name) }

    $args = [System.Collections.Generic.List[string]]::new()
    if ($Test) { $args.Add('--test') }
    if ($Publish) { $args.Add('--publish') }
    if ($NoVersion) { $args.Add('--no-version') }
    foreach ($token in $extraTokens) {
        if (-not $reserved.Contains($token)) { $args.Add($token) }
    }

    return ,@{
        Args      = $args.ToArray()
        Publish   = [bool]$Publish
        NoVersion = [bool]$NoVersion
        Test      = [bool]$Test
    }
}

function Get-PreparedQkbuildConfigPath {
    param(
        [string]$HostProfilePass
    )

    $configPath = Join-Path $ProductRoot 'build.yaml'
    # MonorepoRoot = tools/qkrpc; workspace root is two levels above that.
    $workspaceRoot = (Resolve-Path (Join-Path $MonorepoRoot '..\..')).Path
    $prepareScript = Join-Path $workspaceRoot 'scripts\prepare-qkbuild-config.mjs'
    if (-not (Test-Path -LiteralPath $prepareScript)) {
        return $configPath
    }

    $prepareArgs = @(
        'node', $prepareScript,
        '--project-root', $ProductRoot,
        '--config', 'build.yaml'
    )
    if (-not [string]::IsNullOrWhiteSpace($HostProfilePass)) {
        $prepareArgs += @('--host-profile', $HostProfilePass)
    }

    $prepared = (& $prepareArgs[0] $prepareArgs[1..($prepareArgs.Length - 1)] 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($prepared)) {
        throw "prepare-qkbuild-config failed for host profile '$HostProfilePass'."
    }
    if (Test-Path -LiteralPath $prepared) {
        return $prepared
    }

    return $configPath
}

function Resolve-QkbuildProjectPath {
    param(
        [string]$HostProfilePass
    )

    if ($HostProfilePass -eq 'net10') {
        return Join-Path $ProductRoot 'src\QuickerRpc.Plugin.V2'
    }

    return Join-Path $ProductRoot 'src\QuickerRpc.Plugin.V1'
}

function Invoke-QuickerRpcQkbuildPass {
    param(
        [string]$HostProfilePass,
        [string[]]$QkbuildArgsResolved,
        [string]$PassLabel
    )

    $configPath = Get-PreparedQkbuildConfigPath -HostProfilePass $HostProfilePass
    $projectPath = Resolve-QkbuildProjectPath -HostProfilePass $HostProfilePass

    Write-Host "=== QuickerRpc.Plugin $(if ($HostProfilePass -eq 'net10') { 'V2 (net10)' } else { 'V1 (net472)' }) (qkbuild) ===" -ForegroundColor Cyan
    Write-Host "host pass: $PassLabel" -ForegroundColor Cyan
    if ($configPath -ne (Join-Path $ProductRoot 'build.yaml')) {
        Write-Host "host profile: merged config $($configPath.Replace($ProductRoot, '').TrimStart('\','/'))" -ForegroundColor DarkCyan
    }
    Write-Host "project: $projectPath" -ForegroundColor DarkCyan
    if ($QkbuildArgsResolved.Count -gt 0) {
        Write-Host "qkbuild args: $($QkbuildArgsResolved -join ' ')" -ForegroundColor DarkGray
    }

    Push-Location $ProductRoot
    try {
        $qkbuildCmd = @('build', '-c', $configPath, '--project-path', $projectPath) + $QkbuildArgsResolved
        & qkbuild @qkbuildCmd
        if ($LASTEXITCODE -ne 0) {
            Write-Host "qkbuild failed (exit $LASTEXITCODE)." -ForegroundColor Red
            exit $LASTEXITCODE
        }
    }
    finally {
        Pop-Location
    }
}

function Resolve-QkbuildPassPlan {
    param(
        [switch]$Publish,
        [switch]$NoVersion,
        [switch]$SingleHost,
        [switch]$Net10,
        [switch]$Net472
    )

    $net10Sidecar = Join-Path $ProductRoot 'build.net10.yaml'
    $dualEligible = Test-Path -LiteralPath $net10Sidecar

    if (-not $Publish) {
        return ,@(
            [ordered]@{
                HostProfile = if ($Net10) { 'net10' } else { 'net472' }
                NoVersion   = [bool]$NoVersion
                Label       = 'build'
            }
        )
    }

    if ($Net10) {
        return ,@(
            [ordered]@{
                HostProfile = 'net10'
                NoVersion   = [bool]$NoVersion
                Label       = 'net10 (v2 only)'
            }
        )
    }

    if ($Net472 -or $SingleHost -or -not $dualEligible) {
        return ,@(
            [ordered]@{
                HostProfile = 'net472'
                NoVersion   = [bool]$NoVersion
                Label       = 'net472 (v1 only)'
            }
        )
    }

    return @(
        [ordered]@{
            HostProfile = 'net472'
            NoVersion   = [bool]$NoVersion
            Label       = 'net472 (v1)'
        },
        [ordered]@{
            HostProfile = 'net10'
            NoVersion   = $true
            Label       = 'net10 (v2)'
        }
    )
}

$PluginRunActionUri = 'quicker:runaction:aa5917ad-1256-4c73-7022-08debe3efcbe?plugin'

function Get-QkrpcServePort {
    $raw = if ($env:QKRPC_PORT) { $env:QKRPC_PORT } else { $env:AGENT_GUI_QKRPC_PORT }
    if ([string]::IsNullOrWhiteSpace($raw)) { return 9477 }
    $port = 0
    if ([int]::TryParse($raw.Trim(), [ref]$port) -and $port -gt 0) { return $port }
    return 9477
}

function Get-QkrpcServeBaseUrl {
    param([string]$HostName = '127.0.0.1', [int]$Port = (Get-QkrpcServePort))
    return "http://${HostName}:$Port"
}

function Test-QkrpcServeListening {
    param([string]$BaseUrl, [int]$TimeoutSec = 3)
    try {
        $resp = Invoke-WebRequest -Uri "$BaseUrl/health" -UseBasicParsing -TimeoutSec $TimeoutSec
        if ($resp.StatusCode -ne 200 -and $resp.StatusCode -ne 503) { return $false }
        $json = $resp.Content | ConvertFrom-Json
        return $null -ne $json.PSObject.Properties['ok']
    }
    catch { return $false }
}

function Test-QkrpcServeHealth {
    param([string]$BaseUrl, [int]$TimeoutSec = 3)
    try {
        $resp = Invoke-WebRequest -Uri "$BaseUrl/health" -UseBasicParsing -TimeoutSec $TimeoutSec
        if ($resp.StatusCode -ne 200) { return $false }
        return ($resp.Content | ConvertFrom-Json).ok -eq $true
    }
    catch { return $false }
}

function Stop-QkrpcServe {
    param([string]$RepoRoot = $MonorepoRoot)
    $publishCli = Join-Path $RepoRoot 'publish\cli'
    if (Test-Path -LiteralPath $publishCli) {
        Stop-QkrpcProcessesUsingDirectory -Directory $publishCli -GraceMs 2000 | Out-Null
    }
    $stopped = Stop-QkrpcProcesses -ServeOnly -GraceMs 2000
    if ($stopped -gt 0) { Write-Host "Stopped qkrpc serve (see PID log above)." -ForegroundColor Yellow }
    else { Write-Host "No qkrpc serve process found." -ForegroundColor DarkGray }
}

function Start-QkrpcServe {
    param([string]$RepoRoot = $MonorepoRoot, [string]$HostName = '127.0.0.1')
    $port = Get-QkrpcServePort
    $base = Get-QkrpcServeBaseUrl -HostName $HostName -Port $port
    $repoCliExe = Join-Path $RepoRoot 'publish\cli\qkrpc.exe'
    $installedExe = Join-Path (Get-QkrpcDefaultInstallDir) 'qkrpc.exe'
    if (Test-Path -LiteralPath $repoCliExe) { $exe = $repoCliExe; $cwd = Split-Path -Parent $repoCliExe }
    elseif (Test-Path -LiteralPath $installedExe) { $exe = $installedExe; $cwd = Get-QkrpcDefaultInstallDir }
    else { $exe = $repoCliExe; $cwd = Split-Path -Parent $repoCliExe }
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
    $null = Start-Process -FilePath $exe -ArgumentList @('serve', '--host', $HostName, '--port', "$port", '--no-bootstrap') -WorkingDirectory $cwd -WindowStyle Hidden
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
    param([int]$DelaySeconds = 0)
    if ($DelaySeconds -gt 0) {
        Write-Host "Waiting ${DelaySeconds}s after version variable update before reloading plugin..." -ForegroundColor DarkGray
        Start-Sleep -Seconds $DelaySeconds
    }
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
$passPlan = Resolve-QkbuildPassPlan -Publish:$Publish -NoVersion:$NoVersion -SingleHost:$SingleHost -Net10:$Net10 -Net472:$Net472
$quickerDependencyUpload = $qkMeta.Publish -and $qkMeta.NoVersion

if ($qkMeta.Publish) {
    $versionJsonPath = Join-Path $ProductRoot 'version.json'
    $versionFromFile = (Get-Content -Raw -Path $versionJsonPath | ConvertFrom-Json).QuickerRpc
    $explicitVersion = Get-QuickerRpcVersionFromQkbuildArgs -Tokens $qkbuildArgsResolved
    $candidateVersion = if ($explicitVersion) { $explicitVersion } else { [string]$versionFromFile }
    Assert-QuickerRpcVersionMonotonic `
        -RepoRoot $MonorepoRoot `
        -CandidateVersion $candidateVersion `
        -AllowEqual:([bool]$quickerDependencyUpload)
}

if ($SkipCliPackaging.IsPresent) { $skipPackaging = [bool]$SkipCliPackaging }
elseif ($quickerDependencyUpload) { $skipPackaging = $true }
else { $skipPackaging = $testBuild }

$shouldStartQkrpcServe = -not $SkipQkrpcServe
try {
    if ($shouldStartQkrpcServe) {
        Write-Host "=== Stop qkrpc serve (pre-build) ===" -ForegroundColor Cyan
        Write-Host "  agent-gui dev on :3000 is left running (only qkrpc serve restarts)." -ForegroundColor DarkGray
        Stop-QkrpcServe -RepoRoot $MonorepoRoot
    }

    Write-Host "=== Action authoring docs ===" -ForegroundColor Cyan
    pwsh -NoProfile -File (Join-Path $MonorepoRoot 'scripts\Generate-ActionAuthoringDocs.ps1')
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    $qkbuildArgsResolved = $qkMeta.Args
    if ($qkMeta.Publish) {
        Write-Host "publish plan: $($passPlan.Count) pass(es)" -ForegroundColor DarkCyan
        foreach ($pass in $passPlan) {
            $passNoVersion = if ($pass.NoVersion) { '--no-version' } else { 'next-patch' }
            Write-Host "  - $($pass.Label): $($pass.HostProfile) $passNoVersion" -ForegroundColor DarkGray
        }
        [Console]::Out.Flush()
    }

    if ($passPlan.Count -gt 1) {
        Write-Host ''
        Write-Host 'dual-host publish: net472 (V1) then net10 (V2, same version)' -ForegroundColor Magenta
        Write-Host ''
    }

    $testBuild = $qkMeta.Test
    $runPluginReload = $true

    for ($i = 0; $i -lt $passPlan.Count; $i++) {
        $pass = $passPlan[$i]
        if ($passPlan.Count -gt 1) {
            Write-Host ''
            Write-Host "=== dual-host pass $($i + 1)/$($passPlan.Count): $($pass.Label) ===" -ForegroundColor Magenta
        }

        $passMeta = Get-QkbuildInvocationArgs -Publish:$qkMeta.Publish -NoVersion:([bool]$pass.NoVersion) -Test:$qkMeta.Test -Extra $QkbuildArgs
        $passQkbuildArgs = $passMeta.Args

        if ($quickerDependencyUpload) {
            Write-Host "Mode: Quicker dependency upload (--publish --no-version); CLI zip/setup skipped." -ForegroundColor Yellow
        }

        Invoke-QuickerRpcQkbuildPass -HostProfilePass $pass.HostProfile -QkbuildArgsResolved $passQkbuildArgs -PassLabel $pass.Label

        if ($pass.HostProfile -eq 'net472') {
            Invoke-QuickerRpcPluginRunAction -DelaySeconds 1
        }
        else {
            $runPluginReload = $false
        }
    }

    if (-not $runPluginReload -and $passPlan.Count -eq 1 -and $passPlan[0].HostProfile -eq 'net10') {
        Write-Host 'Skip V1 plugin runaction reload (net10-only pass).' -ForegroundColor DarkGray
    }

    Write-Host "=== qkrpc CLI (publish-rpc.ps1) ===" -ForegroundColor Cyan
    if ($skipPackaging) {
        Write-Host "SkipCliPackaging: dotnet publish CLI + install only (no zip, setup.exe, publish/plugin)." -ForegroundColor Yellow
    }
    $publishArgs = @()
    if ($skipPackaging) { $publishArgs += '-SkipPackaging' }
    if ($SkipInstall) { $publishArgs += '-SkipInstall' }
    pwsh -NoProfile -File (Join-Path $MonorepoRoot 'publish\publish-rpc.ps1') @publishArgs
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    if ($shouldStartQkrpcServe) {
        Start-QkrpcServe -RepoRoot $MonorepoRoot
        $shouldStartQkrpcServe = $false
    }

    exit 0
}
finally {
    if ($shouldStartQkrpcServe) {
        Write-Warning "Build did not finish; restarting qkrpc serve from existing publish/cli so agent-gui can reconnect."
        Start-QkrpcServe -RepoRoot $MonorepoRoot
    }
}
