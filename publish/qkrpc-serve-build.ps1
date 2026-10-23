# Build-scoped serve lifecycle. Merely answering /health does not establish process ownership.

function Get-QkrpcServePort {
    $raw = if ($env:QKRPC_PORT) { $env:QKRPC_PORT } else { $env:AGENT_GUI_QKRPC_PORT }
    if ([string]::IsNullOrWhiteSpace($raw)) { return 9477 }
    $port = 0
    if (-not [int]::TryParse($raw.Trim(), [ref]$port) -or $port -lt 1 -or $port -gt 65535) { throw 'Invalid explicit qkrpc serve port.' }
    return $port
}

function Get-QkrpcServeBaseUrl {
    param([string]$HostName = '127.0.0.1', [int]$Port = (Get-QkrpcServePort))
    if ($HostName -eq '::1') { return "http://[::1]:$Port" }
    return "http://${HostName}:$Port"
}

function Get-QkrpcServeListenerIds {
    param([string]$HostName, [int]$Port)
    if ($HostName -notin @('127.0.0.1', 'localhost', '::1')) { throw 'Build-managed serve requires an explicit loopback host.' }
    return @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object {
        $_.LocalPort -eq $Port -and $_.LocalAddress -in @('0.0.0.0', '::', '127.0.0.1', '::1')
    } | Select-Object -ExpandProperty OwningProcess -Unique)
}

function Assert-QkrpcServeEndpointOwner {
    param([string]$ExecutablePath, [string]$HostName, [int]$Port, [int]$ExpectedProcessId = 0)
    $listeners = @(Get-QkrpcServeListenerIds $HostName $Port)
    if ($listeners.Count -eq 0) { return $false }
    $owned = @(Get-QkrpcOwnedProcesses $ExecutablePath -ServeOnly -ServeHost $HostName -ServePort $Port)
    foreach ($listener in $listeners) {
        if (($ExpectedProcessId -gt 0 -and $listener -ne $ExpectedProcessId) -or $listener -notin @($owned.ProcessId)) {
            throw "Port $Port is occupied by PID $listener without the exact build-owned serve identity. No process was adopted or stopped."
        }
    }
    return $true
}

function Test-QkrpcServeListening {
    param([string]$BaseUrl, [int]$TimeoutSec = 3)
    try {
        $resp = Invoke-WebRequest -Uri "$BaseUrl/health" -UseBasicParsing -TimeoutSec $TimeoutSec -SkipHttpErrorCheck
        if ($resp.StatusCode -ne 200 -and $resp.StatusCode -ne 503) { return $false }
        return $null -ne ($resp.Content | ConvertFrom-Json).PSObject.Properties['ok']
    } catch { return $false }
}

function Test-QkrpcServeHealth {
    param([string]$BaseUrl, [int]$TimeoutSec = 3)
    try {
        $resp = Invoke-WebRequest -Uri "$BaseUrl/health" -UseBasicParsing -TimeoutSec $TimeoutSec
        return $resp.StatusCode -eq 200 -and ($resp.Content | ConvertFrom-Json).ok -eq $true
    } catch { return $false }
}

function Stop-QkrpcServe {
    param([Parameter(Mandatory = $true)][string]$RepoRoot, [string]$HostName = '127.0.0.1')
    $exe = Join-Path $RepoRoot 'publish/cli/qkrpc.exe'
    $port = Get-QkrpcServePort
    # Reject a foreign listener before a build makes any host or publish changes.
    Assert-QkrpcServeEndpointOwner $exe $HostName $port | Out-Null
    $count = Stop-QkrpcProcesses -ExecutablePath $exe -ServeOnly -ServeHost $HostName -ServePort $port -GraceMs 0
    Write-Host "Stopped $count exact build-scoped qkrpc serve process(es)." -ForegroundColor DarkGray
}

function Start-QkrpcServe {
    param([Parameter(Mandatory = $true)][string]$RepoRoot, [string]$HostName = '127.0.0.1', [ValidateRange(1, 60000)][int]$StartupWaitMs = 45000)
    $port = Get-QkrpcServePort
    $base = Get-QkrpcServeBaseUrl $HostName $port
    $exe = Assert-QkrpcExecutableScope (Join-Path $RepoRoot 'publish/cli/qkrpc.exe')
    if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) { throw "Build-owned qkrpc.exe is missing: $exe" }
    if (Assert-QkrpcServeEndpointOwner $exe $HostName $port) {
        if (-not (Test-QkrpcServeListening $base -TimeoutSec 2)) { throw "Owned serve listener at $base did not answer the health protocol." }
        if (-not (Assert-QkrpcServeEndpointOwner $exe $HostName $port)) { throw 'Existing build-owned serve listener disappeared during readiness.' }
        Write-Host "Exact build-owned qkrpc serve is already listening at $base." -ForegroundColor Green
        return
    }
    $child = Start-Process -FilePath $exe -ArgumentList @('serve', '--host', $HostName, '--port', "$port", '--no-bootstrap') -WorkingDirectory (Split-Path -Parent $exe) -WindowStyle Hidden -PassThru
    $ready = $false
    try {
        $null = $child.Handle
        $deadline = [DateTime]::UtcNow.AddMilliseconds($StartupWaitMs)
        while ([DateTime]::UtcNow -lt $deadline) {
            if ($child.HasExited) { throw "Build-owned serve PID $($child.Id) exited before readiness." }
            if (Assert-QkrpcServeEndpointOwner $exe $HostName $port -ExpectedProcessId $child.Id) {
                if (Test-QkrpcServeListening $base -TimeoutSec 2) {
                    if ($child.HasExited) { throw 'Build-owned serve exited during readiness.' }
                    if (-not [string]::Equals((ConvertTo-QkrpcExecutablePath $child.Path), $exe, [StringComparison]::OrdinalIgnoreCase)) { throw 'Spawned serve does not match its exact executable scope.' }
                    if (-not (Assert-QkrpcServeEndpointOwner $exe $HostName $port -ExpectedProcessId $child.Id)) { throw 'Build-owned serve listener disappeared during readiness.' }
                    $ready = $true
                    Write-Host "Build-owned qkrpc serve ready at $base (PID $($child.Id))." -ForegroundColor Green
                    return
                }
            }
            Start-Sleep -Milliseconds 100
        }
        throw "Build-owned qkrpc serve did not become ready at $base within ${StartupWaitMs}ms."
    } finally {
        try {
            if (-not $ready -and -not $child.HasExited) {
                # This handle came from our own spawn; never stop a replacement listener by PID.
                $child.Kill()
                if (-not $child.WaitForExit(2000)) { throw 'Failed startup: the owned serve child did not exit.' }
            }
        } finally { $child.Dispose() }
    }
}
