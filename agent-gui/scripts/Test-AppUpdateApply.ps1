#!/usr/bin/env pwsh
# Automate QuickerAgent in-app update apply testing (single installer spawn).
#
# Usage:
#   pwsh ./scripts/Test-AppUpdateApply.ps1 -Action unit
#   pwsh ./scripts/Test-AppUpdateApply.ps1 -Action prepare [-SkipBuild]
#   pwsh ./scripts/Test-AppUpdateApply.ps1 -Action launch
#   pwsh ./scripts/Test-AppUpdateApply.ps1 -Action full [-SkipBuild] [-ManualClick]
#   pwsh ./scripts/Test-AppUpdateApply.ps1 -Action reset
#
# Notes:
# - Auto-update uses the official @tauri-apps/plugin-updater (Release builds only).
# - Legacy pending.json / Rust updater tests were removed; this script needs a refresh
#   for the official updater flow (latest.json + signed NSIS bundle).
# - NSIS installer-hooks.nsh kills qkrpc/quicker-agent/bundled node before file copy; this script also stops qkrpc
#   after app exit when simulating update apply on installed builds.

[CmdletBinding()]
param(
    [ValidateSet('unit', 'prepare', 'launch', 'watch', 'full', 'reset')]
    [string] $Action = 'full',

    [switch] $SkipBuild,
    # Optional: use installed QuickerAgent instead of target/release build.
    [switch] $UseInstalled,

    [string] $InstalledExe = (Join-Path $env:LOCALAPPDATA 'QuickerAgent\quicker-agent.exe'),

    [string] $RemoteVersion = '',

    [switch] $ManualClick,

    # Installed 0.11.4 and earlier: close main window to trigger exit install (no update overlay).
    [switch] $ExitInstall,
    [int] $ClickWaitSec = 90,
    $MonitorSec = 45
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$AgentGuiRoot = Split-Path -Parent $ScriptDir
$RepoRoot = Split-Path -Parent $AgentGuiRoot
$TauriRoot = Join-Path $AgentGuiRoot 'src-tauri'
$ReleaseExe = Join-Path $TauriRoot 'target\release\quicker-agent.exe'
$BundleRoot = Join-Path $TauriRoot 'target\release\bundle\nsis'
$UpdatesDir = Join-Path $env:LOCALAPPDATA 'QuickerAgent\updates'
$PendingPath = Join-Path $UpdatesDir 'pending.json'

. (Join-Path $RepoRoot 'publish\qkrpc-publish-lib.ps1')

function Stop-InstalledQuickerAgent {
    Get-Process -Name 'quicker-agent' -ErrorAction SilentlyContinue | ForEach-Object {
        Write-Host "Stopping quicker-agent pid $($_.Id)" -ForegroundColor DarkYellow
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 1
}

function Wait-ForQuickerAgentUiReady {
    param([int] $TimeoutSec = 75)

    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        $failed = Get-Process -Name 'quicker-agent' -ErrorAction SilentlyContinue |
            Where-Object { $_.MainWindowTitle -like '*启动失败*' } |
            Select-Object -First 1
        if ($null -ne $failed) {
            throw 'QuickerAgent startup failed (启动失败 dialog). Free port 9477 and retry, or install 0.11.5+ with serve reuse fix.'
        }

        for ($port = 3000; $port -le 3010; $port += 1) {
            try {
                $res = Invoke-WebRequest -Uri "http://127.0.0.1:$port/" -TimeoutSec 2 -UseBasicParsing
                if ($res.StatusCode -eq 200) {
                    Write-Host "QuickerAgent UI ready on http://127.0.0.1:$port/" -ForegroundColor Green
                    return $port
                }
            }
            catch {
                # try next port
            }
        }
        Start-Sleep -Milliseconds 500
    }
    throw "QuickerAgent UI did not become ready within ${TimeoutSec}s"
}

function Clear-ExternalQkrpcServe {
    param([int] $Port = 9477)
    # Kill any qkrpc listening on the default port (including bundled serve from old installs).
    Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
        $proc = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
        if ($null -eq $proc) { return }
        if ($proc.ProcessName -ne 'qkrpc') { return }
        Write-Host "Stopping $($proc.ProcessName) on port $Port (pid $($proc.Id))" -ForegroundColor DarkYellow
        & taskkill.exe /PID $proc.Id /T /F 2>$null | Out-Null
    }
    Stop-QkrpcProcesses | Out-Null
}

function Write-Step([string] $Message) {
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Get-SetupProcessCount {
    @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
        $_.ProcessName -like '*setup*' -and $_.ProcessName -match '(?i)quicker.?agent'
    }).Count
}

function Stop-UpdateTestProcesses {
    Get-Process -ErrorAction SilentlyContinue | Where-Object {
        ($_.ProcessName -like '*quicker-agent*setup*') -or ($_.ProcessName -like '*QuickerAgent*setup*') -or ($_.ProcessName -eq 'quicker-agent' -and $_.Path -like '*\target\release\*')
    } | ForEach-Object {
        Write-Host "Stopping $($_.ProcessName) (pid $($_.Id))" -ForegroundColor DarkYellow
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Milliseconds 800
}

function Copy-SetupForPending([System.IO.FileInfo] $SetupFile, [string] $DestPath) {
    $source = $SetupFile.FullName
    if ($source -eq $DestPath) {
        return
    }
    if ((Test-Path -LiteralPath $DestPath) -and $SetupFile.Length -eq (Get-Item -LiteralPath $DestPath).Length) {
        Write-Host "Reusing existing setup at $DestPath" -ForegroundColor DarkCyan
        return
    }

    $attempts = 0
    while ($attempts -lt 4) {
        try {
            Copy-Item -LiteralPath $source -Destination $DestPath -Force -ErrorAction Stop
            return
        }
        catch {
            $attempts++
            if ($attempts -ge 4) { throw }
            Write-Host "Setup file locked, stopping installers and retrying ($attempts/3)…" -ForegroundColor Yellow
            Stop-UpdateTestProcesses
            Start-Sleep -Seconds 1
        }
    }
}

function Invoke-UnitTests {
    Write-Step 'Running Rust update_apply unit tests'
    Push-Location $TauriRoot
    try {
        cargo test update_apply -- --nocapture
        if ($LASTEXITCODE -ne 0) {
            throw "cargo test update_apply failed with exit code $LASTEXITCODE"
        }
    }
    finally {
        Pop-Location
    }
}

function Resolve-SetupArtifact {
    if (-not (Test-Path -LiteralPath $BundleRoot)) {
        return $null
    }
    $setup = Get-ChildItem -LiteralPath $BundleRoot -Filter '*setup*.exe' -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    if ($null -eq $setup) { return $null }
    return $setup
}

function Invoke-ReleaseBuild {
    Write-Step 'Building QuickerAgent Release (pnpm tauri build)'
    Push-Location $AgentGuiRoot
    try {
        pnpm tauri build
        if ($LASTEXITCODE -ne 0) {
            throw "pnpm tauri build failed with exit code $LASTEXITCODE"
        }
    }
    finally {
        Pop-Location
    }
}

function Get-LaunchExe([hashtable] $Artifacts) {
    if ($UseInstalled -and (Test-Path -LiteralPath $InstalledExe)) {
        Write-Host "Using installed QuickerAgent: $InstalledExe" -ForegroundColor DarkCyan
        return $InstalledExe
    }
    return $Artifacts.ReleaseExe
}

function Get-SetupForPending([hashtable] $Artifacts) {
    if ($null -ne $Artifacts.Setup) {
        return $Artifacts.Setup
    }
    $updatesSetup = Get-ChildItem -LiteralPath $UpdatesDir -Filter '*setup*.exe' -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    if ($null -ne $updatesSetup) {
        return $updatesSetup
    }
    throw 'No setup.exe found. Build first or download installer into updates folder.'
}

function Ensure-SetupArtifact {
    param([switch] $AllowDownload)

    if (-not $SkipBuild) {
        try {
            Invoke-ReleaseBuild
        }
        catch {
            if (-not $AllowDownload) { throw }
            Write-Host "Release build failed; falling back to Bitiful download." -ForegroundColor Yellow
        }
    }

    $setup = Resolve-SetupArtifact
    if ($null -ne $setup) {
        return @{
            ReleaseExe = if (Test-Path -LiteralPath $ReleaseExe) { $ReleaseExe } else { $InstalledExe }
            Setup      = $setup
        }
    }

    if (-not $AllowDownload) {
        throw "NSIS setup.exe not found under $BundleRoot"
    }

    Write-Step 'Downloading QuickerAgent setup from Bitiful (for pending.json seed)'
    New-Item -ItemType Directory -Force -Path $UpdatesDir | Out-Null
    $remoteVersion = (Invoke-RestMethod -Uri 'https://s3.bitiful.net/quicker-pkgs/quicker-rpc/quicker-agent/version.txt').Trim()
    $dest = Join-Path $UpdatesDir "quicker-agent-$remoteVersion-x64-setup.exe"
    if (-not (Test-Path -LiteralPath $dest)) {
        $url = "https://s3.bitiful.net/quicker-pkgs/quicker-rpc/quicker-agent/quicker-agent-$remoteVersion-x64-setup.exe"
        Invoke-WebRequest -Uri $url -OutFile $dest
    }
    return @{
        ReleaseExe = if (Test-Path -LiteralPath $ReleaseExe) { $ReleaseExe } else { $InstalledExe }
        Setup      = Get-Item -LiteralPath $dest
    }
}

function Initialize-PendingUpdate([System.IO.FileInfo] $SetupFile) {
    Write-Step "Seeding pending update at $UpdatesDir"
    New-Item -ItemType Directory -Force -Path $UpdatesDir | Out-Null

    $destName = $SetupFile.Name
    $destPath = Join-Path $UpdatesDir $destName
    Copy-SetupForPending -SetupFile $SetupFile -DestPath $destPath

    if ($RemoteVersion.Trim()) {
        $remoteVersion = $RemoteVersion.Trim()
    }
    elseif ($destName -match 'quicker-agent-([\d.]+)-x64-setup\.exe') {
        $remoteVersion = $Matches[1]
    }
    else {
        $remoteVersion = '0.0.0-test'
    }

    $manifest = [ordered]@{
        remoteVersion = $remoteVersion
        setupPath     = $destPath
        downloadUrl   = 'file://local-test'
    }
    ($manifest | ConvertTo-Json -Depth 4) | Set-Content -LiteralPath $PendingPath -Encoding utf8

    Write-Host "pending.json -> $PendingPath" -ForegroundColor Green
    Write-Host "setup copy   -> $destPath" -ForegroundColor Green
    Write-Host "remoteVersion = $remoteVersion" -ForegroundColor Green
}

function Start-ReleaseApp {
    param([string] $ExePath)

    Write-Step "Launching Release QuickerAgent: $ExePath"
    $proc = Start-Process -FilePath $ExePath -PassThru
    Start-Sleep -Seconds 4
    return $proc
}

function Wait-ForQuickerAgentProcess {
    param([int] $TimeoutSec = 45)
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        $proc = Get-Process -Name 'quicker-agent' -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($null -ne $proc) { return $proc }
        Start-Sleep -Milliseconds 400
    }
    return $null
}

function Request-QuickerAgentExit {
    param([int] $TimeoutSec = 20)

    $proc = Wait-ForQuickerAgentProcess -TimeoutSec $TimeoutSec
    if ($null -eq $proc) {
        Write-Host 'QuickerAgent process not found; skip auto-close.' -ForegroundColor Yellow
        return $false
    }

    Write-Step "Closing QuickerAgent (pid $($proc.Id)) to trigger exit install"
    $null = $proc.CloseMainWindow()
    Start-Sleep -Seconds 2

    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        if ((Get-SetupProcessCount) -gt 0) { return $true }
        if ($null -eq (Get-Process -Id $proc.Id -ErrorAction SilentlyContinue)) {
            return $true
        }
        Start-Sleep -Milliseconds 400
    }

    if ($null -ne (Get-Process -Id $proc.Id -ErrorAction SilentlyContinue)) {
        Write-Host 'Process still running; sending second CloseMainWindow…' -ForegroundColor Yellow
        $null = $proc.CloseMainWindow()
        Start-Sleep -Seconds 3
    }
    return $null -eq (Get-Process -Id $proc.Id -ErrorAction SilentlyContinue)
}

function Wait-ForUpdateOverlay {
    param([int] $TimeoutSec = 60)

    Add-Type -AssemblyName UIAutomationClient
    Add-Type -AssemblyName UIAutomationTypes

    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        $root = [System.Windows.Automation.AutomationElement]::RootElement
        $names = @('软件更新', 'QuickerAgent 更新已就绪', 'QuickerAgent')
        foreach ($name in $names) {
            $cond = New-Object System.Windows.Automation.PropertyCondition(
                [System.Windows.Automation.AutomationElement]::NameProperty,
                $name
            )
            $element = $root.FindFirst(
                [System.Windows.Automation.TreeScope]::Children,
                $cond
            )
            if ($null -ne $element) {
                return $true
            }
        }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

function Find-AutomationElementByName {
    param(
        [System.Windows.Automation.AutomationElement] $Root,
        [string] $Name,
        [System.Windows.Automation.TreeScope] $Scope = [System.Windows.Automation.TreeScope]::Descendants
    )

    $cond = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::NameProperty,
        $Name
    )
    return $Root.FindFirst($Scope, $cond)
}

function Invoke-ClickUpdateButton {
    param([int] $TimeoutSec = 30)

    Add-Type -AssemblyName UIAutomationClient
    Add-Type -AssemblyName UIAutomationTypes

    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        $desktop = [System.Windows.Automation.AutomationElement]::RootElement
        $agentWindow = Find-AutomationElementByName -Root $desktop -Name 'QuickerAgent' -Scope ([System.Windows.Automation.TreeScope]::Children)
        if ($null -eq $agentWindow) {
            $agentWindow = Find-AutomationElementByName -Root $desktop -Name '软件更新' -Scope ([System.Windows.Automation.TreeScope]::Children)
        }
        $searchRoot = if ($null -ne $agentWindow) { $agentWindow } else { $desktop }

        $button = Find-AutomationElementByName -Root $searchRoot -Name '立即更新并重启'
        if ($null -ne $button) {
            $invoke = $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
            if ($null -ne $invoke) {
                $invoke.Invoke()
                return $true
            }
        }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

function Watch-SetupProcessCount {
    param(
        [int] $DurationSec = 20,
        [int] $IntervalMs = 400
    )

    $max = 0
    $samples = @()
    $deadline = (Get-Date).AddSeconds($DurationSec)
    while ((Get-Date) -lt $deadline) {
        $count = Get-SetupProcessCount
        if ($count -gt $max) { $max = $count }
        $samples += $count
        Start-Sleep -Milliseconds $IntervalMs
    }
    return @{
        MaxCount = $max
        Samples  = $samples
    }
}

function Reset-UpdateState {
    Write-Step 'Resetting local update test state'
    Stop-UpdateTestProcesses
    if (Test-Path -LiteralPath $PendingPath) {
        Remove-Item -LiteralPath $PendingPath -Force
    }
    $skipped = Join-Path $UpdatesDir 'skipped-version.txt'
    if (Test-Path -LiteralPath $skipped) {
        Remove-Item -LiteralPath $skipped -Force
    }
    Write-Host 'Done.' -ForegroundColor Green
}

function Invoke-FullTest {
    Invoke-UnitTests

    $artifacts = Ensure-SetupArtifact -AllowDownload
    Reset-UpdateState
    Initialize-PendingUpdate -SetupFile $artifacts.Setup

    $before = Get-SetupProcessCount
    $launchExe = Get-LaunchExe -Artifacts $artifacts
    if (-not (Test-Path -LiteralPath $launchExe)) {
        throw "Launch exe not found: $launchExe"
    }
    if ($UseInstalled) {
        Stop-InstalledQuickerAgent
        Clear-ExternalQkrpcServe -Port 9477
    }
    $app = Start-ReleaseApp -ExePath $launchExe
    $null = Wait-ForQuickerAgentUiReady -TimeoutSec 75

    $clicked = $false
    if ($UseInstalled) {
        Write-Host ''
        Write-Host 'Installed build (e.g. 0.11.4) has no update overlay UI.' -ForegroundColor Yellow
        Write-Host 'pending.json is seeded; install triggers on app exit.' -ForegroundColor Yellow
        if ($ExitInstall -or -not $ManualClick) {
            Start-Sleep -Seconds 6
            $null = Request-QuickerAgentExit
            Stop-QkrpcProcesses | Out-Null
        }
        else {
            Write-Host "ManualClick: close QuickerAgent within ${ClickWaitSec}s to trigger exit install…" -ForegroundColor Yellow
            $manualDeadline = (Get-Date).AddSeconds($ClickWaitSec)
            while ((Get-Date) -lt $manualDeadline) {
                if ((Get-SetupProcessCount) -gt $before) { break }
                if ($null -eq (Get-Process -Name 'quicker-agent' -ErrorAction SilentlyContinue)) { break }
                Start-Sleep -Milliseconds 500
            }
        }
    }
    else {
        if (-not (Wait-ForUpdateOverlay -TimeoutSec 60)) {
            Stop-UpdateTestProcesses
            throw 'Update overlay did not appear within 60s. Is this a Release build with pending.json?'
        }
        Write-Host 'Update overlay detected.' -ForegroundColor Green

        if (-not $ManualClick) {
            Write-Step 'Clicking "立即更新并重启" via UI Automation'
            $clicked = Invoke-ClickUpdateButton -TimeoutSec $ClickWaitSec
            if (-not $clicked) {
                Write-Host 'UI Automation click failed; waiting for manual click…' -ForegroundColor Yellow
            }
        }
        else {
            Write-Host "ManualClick: please click 立即更新并重启 within ${ClickWaitSec}s" -ForegroundColor Yellow
        }

        if (-not $clicked) {
            $manualDeadline = (Get-Date).AddSeconds($ClickWaitSec)
            while ((Get-Date) -lt $manualDeadline) {
                if ((Get-SetupProcessCount) -gt $before) { break }
                Start-Sleep -Milliseconds 500
            }
        }
        Stop-QkrpcProcesses | Out-Null
    }

    Start-Sleep -Seconds 2
    $watch = Watch-SetupProcessCount -DurationSec $MonitorSec

    Write-Host ''
    Write-Host '--- update apply test result ---' -ForegroundColor Cyan
    Write-Host "setup.exe max count : $($watch.MaxCount) (expected <= 1)"
    Write-Host "setup.exe samples : $($watch.Samples -join ', ')"

    Stop-UpdateTestProcesses

    if ($watch.MaxCount -eq 0) {
        Write-Host 'SKIP: no installer process detected (exit install may not have run).' -ForegroundColor Yellow
        exit 2
    }

    if ($watch.MaxCount -gt 1) {
        throw "FAIL: detected $($watch.MaxCount) installer processes (expected at most 1)"
    }

    Write-Host 'PASS: at most one installer process detected.' -ForegroundColor Green
}

switch ($Action) {
    'unit' {
        Invoke-UnitTests
    }
    'prepare' {
        $artifacts = Ensure-SetupArtifact -AllowDownload
        Reset-UpdateState
        Initialize-PendingUpdate -SetupFile (Get-SetupForPending -Artifacts $artifacts)
        Write-Host "Run: pwsh ./scripts/Test-AppUpdateApply.ps1 -Action launch -UseInstalled" -ForegroundColor DarkCyan
    }
    'launch' {
        $exe = if ($UseInstalled -and (Test-Path -LiteralPath $InstalledExe)) { $InstalledExe } else { $ReleaseExe }
        if (-not (Test-Path -LiteralPath $exe)) {
            throw "Launch exe missing: $exe"
        }
        if (-not (Test-Path -LiteralPath $PendingPath)) {
            throw "pending.json missing. Run -Action prepare first."
        }
        Start-ReleaseApp -ExePath $exe | Out-Null
    }
    'watch' {
        Write-Host "Watching setup.exe count for ${MonitorSec}s…"
        $watch = Watch-SetupProcessCount -DurationSec $MonitorSec
        Write-Host "Max count: $($watch.MaxCount)"
    }
    'reset' {
        Reset-UpdateState
    }
    'full' {
        Invoke-FullTest
    }
}
