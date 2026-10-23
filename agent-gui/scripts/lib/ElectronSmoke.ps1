Set-StrictMode -Version Latest

function Assert-SmokeLocalPath {
    param([string]$Path)
    $absolute = [IO.Path]::GetFullPath($Path)
    if ($absolute -match '(?i)(^|[\\/])(OneDrive[^\\/]*|Dropbox|iCloud[^\\/]*)([\\/]|$)') { throw 'Smoke path cannot use cloud sync directories' }
    for ($cursor = $absolute; $cursor; $cursor = [IO.Path]::GetDirectoryName($cursor)) {
        if (Test-Path -LiteralPath $cursor) {
            $attributes = (Get-Item -LiteralPath $cursor -Force).Attributes
            if (([long]$attributes -band (0x400 -bor 0x1000 -bor 0x40000 -bor 0x400000)) -ne 0) { throw "Smoke path is redirected or a cloud placeholder: $cursor" }
        }
    }
    return $absolute
}

function New-ElectronSmokeRun {
    param([string]$WorkspaceRoot)
    $anchor = Assert-SmokeLocalPath $WorkspaceRoot
    $base = Assert-SmokeLocalPath (Join-Path $anchor '.tmp/electron-smoke')
    $null = New-Item -ItemType Directory -Path $base -Force
    $runId = [guid]::NewGuid().ToString('N')
    $root = Join-Path $base "run-$runId"
    $null = New-Item -ItemType Directory -Path $root
    $root = Assert-SmokeLocalPath $root
    foreach ($suffix in @('roaming', 'local', 'home/Documents', 'temp', 'app-state', 'workspace', 'profile', 'sessions', 'logs')) {
        $null = New-Item -ItemType Directory -Path (Join-Path $root $suffix) -Force
    }
    return @{ Root = $root; RunId = $runId; Protocol = 'QUICKER_AGENT_SMOKE_PROTOCOL_V1' }
}

function Get-ElectronSmokeEnvironment {
    param($Run)
    $environment = [Collections.Generic.Dictionary[string,string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($name in @('SystemRoot', 'SystemDrive', 'ComSpec', 'PATH', 'PATHEXT', 'PROCESSOR_ARCHITECTURE', 'NUMBER_OF_PROCESSORS')) {
        $value = [Environment]::GetEnvironmentVariable($name, 'Process')
        if ($value) { $environment[$name] = $value }
    }
    $paths = @{ APPDATA = 'roaming'; LOCALAPPDATA = 'local'; USERPROFILE = 'home'; HOME = 'home'; TEMP = 'temp'; TMP = 'temp'; AGENT_GUI_ROOT = 'app-state'; AGENT_GUI_DEFAULT_CWD = 'workspace' }
    foreach ($entry in $paths.GetEnumerator()) { $environment[$entry.Key] = Join-Path $Run.Root $entry.Value }
    $environment['QUICKER_AGENT_SMOKE_ROOT'] = $Run.Root
    $environment['QUICKER_AGENT_SMOKE_RUN_ID'] = $Run.RunId
    return ,$environment
}

function Assert-ElectronSmokeBundleSupport {
    param([string]$ExePath)
    $ExePath = Assert-SmokeLocalPath $ExePath
    $archive = Join-Path (Split-Path -Parent $ExePath) 'resources/app.asar'
    if (-not (Test-Path -LiteralPath $archive -PathType Leaf)) { throw 'Isolated smoke requires app.asar from a matching Electron build; rebuild before launch.' }
    $archive = Assert-SmokeLocalPath $archive
    $text = [Text.Encoding]::UTF8.GetString([IO.File]::ReadAllBytes($archive))
    foreach ($marker in @('QUICKER_AGENT_SMOKE_PROTOCOL_V1', 'QUICKER_AGENT_SMOKE_BOOTSTRAP_V1', 'QUICKER_AGENT_SMOKE_MAIN_V1')) {
        if (-not $text.Contains($marker)) { throw 'This Electron package lacks the isolated smoke handshake; rebuild before launch.' }
    }
}

function Assert-OwnedSmokeHandshake {
    param($Run, $Owner, $Info)
    if ($Info.protocol -ne $Run.Protocol -or $Info.runId -ne $Run.RunId -or $Info.rootPid -ne $Owner.RootProcessId -or $Info.hostRpcDisabled -ne $true -or
        [IO.Path]::GetFullPath($Info.userData) -ne (Join-Path $Run.Root 'profile')) { throw 'Smoke handshake belongs to a different run/profile' }
    foreach ($role in @('ui', 'rpc')) {
        $processId = [int]$Info."${role}Pid"
        $port = [int]$Info."${role}Port"
        if ($port -lt 1 -or $port -gt 65535 -or -not $Owner.ContainsProcess($processId)) { throw "Smoke $role service is not owned by this job" }
    }
    if ($Info.uiPort -eq $Info.rpcPort -or $Info.rpcPid -ne $Owner.RootProcessId) { throw 'Invalid isolated smoke services' }
}

function Test-OwnedSmokeListener {
    param($Owner, [int]$Port, [int]$ProcessId)
    if (-not $Owner.ContainsProcess($ProcessId)) { return $false }
    $listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
    return @($listeners | Where-Object { $_.LocalAddress -eq '127.0.0.1' -and $_.OwningProcess -eq $ProcessId }).Count -gt 0
}

function Wait-OwnedElectronSmokeUi {
    param($Run, $Owner, [int]$TimeoutSec = 90)
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    $readyPath = Join-Path $Run.Root 'ready.json'
    while ((Get-Date) -lt $deadline) {
        if ($Owner.HasExited) { throw 'Smoke Electron exited before its owned UI became ready' }
        if (Test-Path -LiteralPath $readyPath -PathType Leaf) {
            $info = Get-Content -LiteralPath $readyPath -Raw | ConvertFrom-Json
            Assert-OwnedSmokeHandshake $Run $Owner $info
            if ((Test-OwnedSmokeListener $Owner $info.uiPort $info.uiPid) -and (Test-OwnedSmokeListener $Owner $info.rpcPort $info.rpcPid)) {
                try {
                    foreach ($path in @('/', '/api/ping')) {
                        $response = Invoke-WebRequest -Uri "http://127.0.0.1:$($info.uiPort)$path" -TimeoutSec 2 -MaximumRedirection 0 -UseBasicParsing
                        if ($response.StatusCode -ne 200) { throw 'Owned UI is not ready' }
                    }
                    if (-not (Test-OwnedSmokeListener $Owner $info.uiPort $info.uiPid)) { throw 'Smoke UI listener changed ownership' }
                    @{ protocol = $Run.Protocol; runId = $Run.RunId } | ConvertTo-Json -Compress | Set-Content -LiteralPath (Join-Path $Run.Root 'approved.json')
                    return $info
                } catch { if ($Owner.HasExited) { throw }; }
            }
        }
        Start-Sleep -Milliseconds 200
    }
    throw "Isolated Electron UI not ready within ${TimeoutSec}s; no unrelated ports were probed."
}

function Invoke-OwnedElectronSmokeRun {
    param([scriptblock]$Start, [scriptblock]$Wait)
    $owner = $null
    try {
        $owner = & $Start
        return & $Wait $owner
    } finally {
        if ($null -ne $owner) { $owner.Dispose() }
    }
}
