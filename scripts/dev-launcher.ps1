# Shared dev launcher helpers (dot-sourced by dev.ps1 for Tauri / port prep).
# Public entry point: pwsh ./dev.ps1

function Test-QkrpcServeHealth {
    param(
        [string]$BaseUrl = 'http://127.0.0.1:9477',
        [int]$TimeoutSec = 2
    )
    try {
        $resp = Invoke-WebRequest -Uri "$BaseUrl/health" -UseBasicParsing -TimeoutSec $TimeoutSec
        if ($resp.StatusCode -ne 200) { return $false }
        $json = $resp.Content | ConvertFrom-Json
        return $json.ok -eq $true
    }
    catch { return $false }
}

function Stop-DevProcessTree {
    param([int]$ProcessId)
    if ($ProcessId -le 0 -or $ProcessId -eq $PID) { return $false }
    & taskkill.exe /PID $ProcessId /T /F 2>$null | Out-Null
    return $LASTEXITCODE -eq 0
}

function Get-DevAgentGuiPort {
    $raw = $env:AGENT_GUI_PORT
    if (-not [string]::IsNullOrWhiteSpace($raw)) {
        $parsed = 0
        if ([int]::TryParse($raw.Trim(), [ref]$parsed) -and $parsed -gt 0) { return $parsed }
    }
    return 3000
}

function Test-DevAgentGuiPortListening {
    param([int]$Port)
    try {
        return @(
            Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        ).Count -gt 0
    }
    catch { return $false }
}

function Test-DevAgentGuiFrontendHealthy {
    param(
        [int]$Port,
        [string]$BindHost = '127.0.0.1',
        [int]$TimeoutSec = 3
    )
    $base = "http://${BindHost}:$Port"
    foreach ($path in @('/api/ping', '/')) {
        try {
            $resp = Invoke-WebRequest -Uri "$base$path" -UseBasicParsing -TimeoutSec $TimeoutSec
            if ($resp.StatusCode -eq 200) { return $true }
        }
        catch { continue }
    }
    return $false
}

function Get-DevAgentGuiBundler {
    param([string]$AgentGuiRoot)
    $infoPath = Join-Path $AgentGuiRoot '.local/dev-server.json'
    if (-not (Test-Path -LiteralPath $infoPath)) { return $null }
    try {
        $info = Get-Content -LiteralPath $infoPath -Raw | ConvertFrom-Json
        if ($info.bundler -in @('webpack', 'turbopack')) { return [string]$info.bundler }
    }
    catch { }
    return $null
}

function Normalize-DevProbePath {
    param([string]$Text)
    if ([string]::IsNullOrWhiteSpace($Text)) { return '' }
    return $Text.Trim().Replace('/', '\').ToLowerInvariant()
}

function Test-ProductionQuickerAgentPortProcess {
    param([int]$ProcessId)
    if ($ProcessId -le 0) { return $false }
    try {
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction Stop
    }
    catch { return $false }

    $name = [string]$proc.Name
    $cmd = Normalize-DevProbePath ([string]$proc.CommandLine)
    $exe = Normalize-DevProbePath ([string]$proc.ExecutablePath)
    $pathText = "$cmd $exe".Trim()
    if ([string]::IsNullOrWhiteSpace($pathText)) { return $false }
    if ($pathText -match '\\agent-gui\\' -or $pathText -match '\\src-tauri\\target\\') { return $false }

    $installRoot = Normalize-DevProbePath (Join-Path $env:LOCALAPPDATA 'QuickerAgent')
    if (-not [string]::IsNullOrWhiteSpace($installRoot) -and $pathText.StartsWith($installRoot)) {
        if ($name -ieq 'quicker-agent.exe') { return $true }
        if ($name -ieq 'node.exe' -and $pathText -match 'resources\\node\\' -and $pathText -match 'server\.js') { return $true }
    }
    if ($name -ieq 'quicker-agent.exe') {
        return (
            ($pathText -match '\\quickeragent\\quicker-agent\.exe' -or
                $pathText -match '\\programs\\quickeragent\\quicker-agent\.exe') -and
            $pathText -notmatch '\\agent-gui\\' -and
            $pathText -notmatch '\\src-tauri\\target\\'
        )
    }
    if ($name -ieq 'node.exe') {
        return (
            ($pathText -match '\\quickeragent\\resources\\node\\' -and
                ($pathText -match '\\quickeragent\\resources\\app\\' -or $pathText -match 'server\.js')) -and
            $pathText -notmatch '\\agent-gui\\'
        )
    }
    return $false
}

function Get-NextFreeDevAgentGuiPort {
    param([int]$StartPort = 3000, [int]$MaxAttempts = 20)
    for ($port = $StartPort; $port -lt ($StartPort + $MaxAttempts); $port++) {
        if (-not (Test-DevAgentGuiPortListening -Port $port)) { return $port }
    }
    return $StartPort
}

function Test-ProductionQuickerAgentUiOnPort {
    param([int]$Port)
    $pids = @(
        Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
            ForEach-Object { $_.OwningProcess } |
            Sort-Object -Unique
    ) | Where-Object { $_ -gt 0 }
    foreach ($procId in $pids) {
        if (Test-ProductionQuickerAgentPortProcess -ProcessId $procId) { return $true }
    }
    return $false
}

function Resolve-DevAgentGuiPortAvoidingProduction {
    param([int]$PreferredPort)
    if (-not (Test-DevAgentGuiPortListening -Port $PreferredPort)) { return $PreferredPort }
    if (-not (Test-ProductionQuickerAgentUiOnPort -Port $PreferredPort)) { return $PreferredPort }
    $altPort = Get-NextFreeDevAgentGuiPort -StartPort ($PreferredPort + 1)
    $env:AGENT_GUI_PORT = [string]$altPort
    Write-Host "Installed QuickerAgent is using :$PreferredPort; dev will use :$altPort." -ForegroundColor DarkCyan
    return $altPort
}

function Stop-DevAgentGui {
    param([string]$AgentGuiRoot)
    $stopScript = Join-Path $AgentGuiRoot 'scripts/stop-agent-gui-dev.mjs'
    if (-not (Test-Path -LiteralPath $stopScript)) {
        Write-Warning "Missing $stopScript; skip stopping prior dev."
        return
    }
    node $stopScript
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

function Clear-DevAgentGuiPortListeners {
    param([int]$Port)
    for ($attempt = 1; $attempt -le 6; $attempt++) {
        if (-not (Test-DevAgentGuiPortListening -Port $Port)) { return $true }
        $pids = @(
            Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
                ForEach-Object { $_.OwningProcess } |
                Sort-Object -Unique
        ) | Where-Object { $_ -gt 0 -and $_ -ne $PID }
        if ($pids.Count -eq 0) {
            Start-Sleep -Milliseconds 400
            continue
        }
        $killable = @($pids | Where-Object { -not (Test-ProductionQuickerAgentPortProcess -ProcessId $_) })
        if ($killable.Count -eq 0) {
            Write-Host "agent-gui: port $Port held by installed QuickerAgent; leaving it alone." -ForegroundColor DarkCyan
            return $false
        }
        Write-Host "agent-gui: freeing port $Port (PID(s): $($killable -join ', '))" -ForegroundColor Yellow
        foreach ($procId in $killable) { Stop-DevProcessTree -ProcessId $procId | Out-Null }
        Start-Sleep -Milliseconds 600
    }
    return -not (Test-DevAgentGuiPortListening -Port $Port)
}

function Ensure-DevAgentGuiDeps {
    param([string]$AgentGuiRoot)
    if (-not (Test-Path -LiteralPath (Join-Path $AgentGuiRoot 'node_modules'))) {
        Write-Host "Running pnpm install in agent-gui ..." -ForegroundColor Yellow
        pnpm --dir $AgentGuiRoot install
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
    $llmConfig = Join-Path $AgentGuiRoot 'llm-config.json'
    if (-not (Test-Path -LiteralPath $llmConfig)) {
        Write-Warning "Missing agent-gui/llm-config.json — copy from llm-config.example.json before chatting."
    }
    if (-not (Test-QkrpcServeHealth)) {
        Write-Warning "qkrpc serve not healthy at http://127.0.0.1:9477 — run pwsh ./dev.ps1 or pwsh ./build.ps1 -t first."
    }
}

function Clear-BrokenTurbopackCache {
    param([string]$AgentGuiRoot)
    $nextDir = Join-Path $AgentGuiRoot '.next'
    $documentJs = Join-Path $nextDir 'server/pages/_document.js'
    $ssrChunks = Join-Path $nextDir 'server/chunks/ssr'
    $hasBrokenTurbopack = $false
    if ((Test-Path -LiteralPath $documentJs) -and
        (Select-String -LiteralPath $documentJs -Pattern '\[turbopack\]_runtime' -Quiet -ErrorAction SilentlyContinue)) {
        $hasRuntimeChunk = (Test-Path -LiteralPath (Join-Path $nextDir 'turbopack')) -or
            ((Test-Path -LiteralPath $ssrChunks) -and
             (Get-ChildItem -LiteralPath $ssrChunks -File -ErrorAction SilentlyContinue |
              Where-Object { $_.Name -match '\[turbopack\]_runtime' } |
              Select-Object -First 1))
        if (-not $hasRuntimeChunk) { $hasBrokenTurbopack = $true }
    }
    if ($hasBrokenTurbopack) {
        Remove-Item -LiteralPath $nextDir -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "Cleared broken Turbopack .next cache." -ForegroundColor Yellow
    }
}

function Clear-TurbopackCacheForTauri {
    param([string]$AgentGuiRoot)
    $nextDir = Join-Path $AgentGuiRoot '.next'
    $documentJs = Join-Path $nextDir 'server/pages/_document.js'
    $hasTurbopackCache = (Test-Path -LiteralPath (Join-Path $nextDir 'turbopack')) -or
        ((Test-Path -LiteralPath $documentJs) -and
         (Select-String -LiteralPath $documentJs -Pattern '\[turbopack\]_runtime' -Quiet -ErrorAction SilentlyContinue))
    if ($hasTurbopackCache) {
        Remove-Item -LiteralPath $nextDir -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "Cleared Turbopack .next before webpack Tauri dev." -ForegroundColor Yellow
    }
}

function Invoke-DevTauriLauncher {
    param(
        [string]$RepoRoot,
        [switch]$SkipKill,
        [switch]$NoReuse
    )
    $agentGui = Join-Path $RepoRoot 'agent-gui'
    if (-not (Test-Path -LiteralPath (Join-Path $agentGui 'package.json'))) {
        throw "agent-gui not found under $RepoRoot"
    }

    $devPort = Get-DevAgentGuiPort
    $reuseDev = $false
    $stalePortOnly = $false
    if (-not $SkipKill) {
        $devPort = Resolve-DevAgentGuiPortAvoidingProduction -PreferredPort $devPort
    }
    if (-not $NoReuse) {
        $portListening = Test-DevAgentGuiPortListening -Port $devPort
        $frontendHealthy = Test-DevAgentGuiFrontendHealthy -Port $devPort
        $devInfoPath = Join-Path $agentGui '.local/dev-server.json'
        $hasDevInfo = Test-Path -LiteralPath $devInfoPath
        if ($frontendHealthy) {
            $reuseDev = $true
        }
        elseif ($portListening -and $hasDevInfo) {
            Write-Host "Port $devPort is up but still compiling; waiting for frontend health..." -ForegroundColor DarkGray
            foreach ($attempt in 1..30) {
                Start-Sleep -Seconds 2
                if (Test-DevAgentGuiFrontendHealthy -Port $devPort) {
                    $reuseDev = $true
                    break
                }
            }
            if (-not $reuseDev) {
                Write-Warning "Port $devPort did not become healthy — will stop stale dev and start fresh."
                $stalePortOnly = $true
            }
        }
        elseif ($portListening -and (Test-ProductionQuickerAgentUiOnPort -Port $devPort)) {
            $devPort = Resolve-DevAgentGuiPortAvoidingProduction -PreferredPort $devPort
        }
        elseif ($portListening) {
            Write-Warning "Port $devPort is in use but not a healthy agent-gui dev — stopping stale listener."
            $stalePortOnly = $true
        }
    }

    if ($reuseDev) {
        $env:AGENT_GUI_SKIP_KILL = '1'
        $env:AGENT_GUI_REUSE_DEV = '1'
        $bundler = Get-DevAgentGuiBundler -AgentGuiRoot $agentGui
        $bundlerLabel = if ($bundler) { $bundler } else { 'dev server' }
        Write-Host "Reusing agent-gui frontend on :$devPort ($bundlerLabel)." -ForegroundColor Green
    }
    elseif ((-not $SkipKill) -or $stalePortOnly) {
        Stop-DevAgentGui -AgentGuiRoot $agentGui
        Remove-Item Env:AGENT_GUI_REUSE_DEV -ErrorAction SilentlyContinue
        if (-not (Clear-DevAgentGuiPortListeners -Port $devPort)) {
            throw "Port $devPort is still in use. Close the other process or run: node agent-gui/scripts/stop-agent-gui-dev.mjs"
        }
        $env:AGENT_GUI_SKIP_KILL = '1'
    }
    else {
        $env:AGENT_GUI_SKIP_KILL = '1'
        Remove-Item Env:AGENT_GUI_REUSE_DEV -ErrorAction SilentlyContinue
    }

    Ensure-DevAgentGuiDeps -AgentGuiRoot $agentGui
    if (-not $reuseDev) { Clear-TurbopackCacheForTauri -AgentGuiRoot $agentGui }

    Write-Host ""
    Write-Host "=== QuickerAgent desktop (Tauri) ===" -ForegroundColor Cyan
    if ($reuseDev) {
        Write-Host "  Reusing http://127.0.0.1:$devPort (browser dev from pwsh ./dev.ps1)" -ForegroundColor DarkGray
        Write-Host "  WebView2 HMR is muted; refresh the desktop window after UI edits" -ForegroundColor DarkGray
    }
    else {
        Write-Host "  UI: http://127.0.0.1:$devPort inside WebView2 (webpack)" -ForegroundColor DarkGray
    }
    Write-Host ""
    Push-Location $RepoRoot
    try {
        pnpm --dir $agentGui tauri:dev
        exit $LASTEXITCODE
    }
    finally { Pop-Location }
}
