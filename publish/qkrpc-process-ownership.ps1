# Exact executable and retained-process ownership for publish/install operations.

function ConvertTo-QkrpcExecutablePath {
    param([Parameter(Mandatory = $true)][string]$ExecutablePath)
    if ($ExecutablePath -notmatch '^(?:[A-Za-z]:[\\/]|\\\\[^\\]+\\[^\\]+[\\/])') { throw 'Qkrpc process scope requires an absolute executable path.' }
    $tail = $ExecutablePath.Substring([IO.Path]::GetPathRoot($ExecutablePath).Length)
    if ($tail.Contains(':') -or ($tail -split '[\\/]' | Where-Object { $_ -match '[. ]$|[*?]' })) {
        throw "Ambiguous qkrpc executable path: $ExecutablePath"
    }
    $full = [IO.Path]::GetFullPath($ExecutablePath)
    if (-not [string]::Equals([IO.Path]::GetFileName($full), 'qkrpc.exe', [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Qkrpc process scope must name the exact qkrpc.exe file.'
    }
    return $full
}

function Assert-QkrpcExecutableScope {
    param([Parameter(Mandatory = $true)][string]$ExecutablePath)
    $full = ConvertTo-QkrpcExecutablePath $ExecutablePath
    $cursor = $full
    while ($cursor) {
        if (Test-Path -LiteralPath $cursor) {
            $item = Get-Item -LiteralPath $cursor -Force -ErrorAction Stop
            # Do not resolve aliases or hydrate cloud placeholders to manufacture ownership.
            if (([int64]$item.Attributes -band (0x400 -bor 0x1000 -bor 0x40000 -bor 0x400000)) -ne 0) {
                throw "Qkrpc process scope cannot use a redirected or cloud-only path: $cursor"
            }
        }
        $parent = Split-Path -Parent $cursor
        if ($parent -eq $cursor) { break }
        $cursor = $parent
    }
    return $full
}

function Split-QkrpcWindowsCommandLine {
    param([Parameter(Mandatory = $true)][string]$CommandLine)
    $tokens = [Collections.Generic.List[string]]::new()
    $index = 0
    while ($index -lt $CommandLine.Length) {
        while ($index -lt $CommandLine.Length -and [char]::IsWhiteSpace($CommandLine[$index])) { $index++ }
        if ($index -ge $CommandLine.Length) { break }
        $token = [Text.StringBuilder]::new()
        $quoted = $false
        while ($index -lt $CommandLine.Length) {
            $character = $CommandLine[$index]
            if (-not $quoted -and [char]::IsWhiteSpace($character)) { break }
            $slashes = 0
            while ($index -lt $CommandLine.Length -and $CommandLine[$index] -eq '\') { $slashes++; $index++ }
            if ($index -lt $CommandLine.Length -and $CommandLine[$index] -eq '"') {
                [void]$token.Append(('\' * [int][Math]::Floor($slashes / 2)))
                if ($slashes % 2 -eq 1) { [void]$token.Append('"') }
                elseif ($quoted -and $index + 1 -lt $CommandLine.Length -and $CommandLine[$index + 1] -eq '"') {
                    [void]$token.Append('"'); $index++
                } else { $quoted = -not $quoted }
                $index++
            } else {
                [void]$token.Append(('\' * $slashes))
                if ($index -lt $CommandLine.Length -and -not $quoted -and [char]::IsWhiteSpace($CommandLine[$index])) { break }
                if ($index -lt $CommandLine.Length) { [void]$token.Append($CommandLine[$index]); $index++ }
            }
        }
        if ($quoted) { throw 'Cannot prove ownership from an unterminated process command line.' }
        $tokens.Add($token.ToString())
    }
    return ,$tokens.ToArray()
}

function Test-QkrpcOwnedProcessRecord {
    param([object]$Record, [string]$ExecutablePath, [switch]$ServeOnly, [string]$ServeHost, [int]$ServePort)
    if ([string]::IsNullOrWhiteSpace($Record.ExecutablePath)) { throw "Cannot prove qkrpc process ownership: PID $($Record.ProcessId) has no executable path." }
    $actual = ConvertTo-QkrpcExecutablePath $Record.ExecutablePath
    if (-not [string]::Equals($actual, $ExecutablePath, [StringComparison]::OrdinalIgnoreCase)) { return $false }
    if (-not $ServeOnly) { return $true }
    if ([string]::IsNullOrWhiteSpace($Record.CommandLine)) { throw "Cannot prove serve arguments for PID $($Record.ProcessId)." }
    $argv = Split-QkrpcWindowsCommandLine $Record.CommandLine
    if ($argv.Length -lt 2 -or -not [string]::Equals((ConvertTo-QkrpcExecutablePath $argv[0]), $ExecutablePath, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Cannot prove serve executable arguments for PID $($Record.ProcessId)."
    }
    if ($argv[1] -ne 'serve') { return $false }
    $values = @{}
    for ($index = 2; $index -lt $argv.Length; $index++) {
        $option = $argv[$index]
        if ($option -eq '--no-bootstrap') {
            if ($values.ContainsKey($option)) { throw 'Duplicate serve option.' }
            $values[$option] = $true
            continue
        }
        if ($option -notin @('--host', '--port') -or $values.ContainsKey($option) -or ++$index -ge $argv.Length) {
            throw "Cannot prove build-owned serve options for PID $($Record.ProcessId)."
        }
        $values[$option] = $argv[$index]
    }
    $port = 0
    if (-not $values.ContainsKey('--host') -or -not $values.ContainsKey('--port') -or -not $values.ContainsKey('--no-bootstrap') -or
        -not [int]::TryParse($values['--port'], [ref]$port)) { throw "Cannot prove explicit build-owned serve endpoint for PID $($Record.ProcessId)." }
    return [string]::Equals($values['--host'], $ServeHost, [StringComparison]::OrdinalIgnoreCase) -and $port -eq $ServePort
}

function Get-QkrpcOwnedProcesses {
    param([Parameter(Mandatory = $true)][string]$ExecutablePath, [switch]$ServeOnly, [string]$ServeHost = '', [int]$ServePort = 0)
    $scope = Assert-QkrpcExecutableScope $ExecutablePath
    if ($ServeOnly -and ([string]::IsNullOrWhiteSpace($ServeHost) -or $ServePort -lt 1 -or $ServePort -gt 65535)) {
        throw 'Serve ownership requires an explicit host and port.'
    }
    # Validate every candidate before any process is stopped.
    $matches = [Collections.Generic.List[object]]::new()
    foreach ($record in @(Get-CimInstance Win32_Process -Filter "Name = 'qkrpc.exe'" -ErrorAction Stop)) {
        if (Test-QkrpcOwnedProcessRecord $record $scope -ServeOnly:$ServeOnly -ServeHost $ServeHost -ServePort $ServePort) { $matches.Add($record) }
    }
    return $matches.ToArray()
}

function Stop-QkrpcProcesses {
    param(
        [string]$ExecutablePath = '',
        [switch]$ServeOnly, [string]$ServeHost = '', [int]$ServePort = 0,
        [int]$GraceMs = 500, [ValidateRange(1, 60000)][int]$ExitWaitMs = 2000
    )
    $scope = Assert-QkrpcExecutableScope $ExecutablePath
    $records = @(Get-QkrpcOwnedProcesses $scope -ServeOnly:$ServeOnly -ServeHost $ServeHost -ServePort $ServePort)
    $retained = [Collections.Generic.List[object]]::new()
    $stopped = [Collections.Generic.List[int]]::new()
    $eligible = [Collections.Generic.List[object]]::new()
    try {
        foreach ($record in $records) {
            try { $process = Get-Process -Id $record.ProcessId -ErrorAction Stop }
            catch {
                if (Get-CimInstance Win32_Process -Filter "ProcessId = $($record.ProcessId)" -ErrorAction Stop) { throw }
                continue
            }
            if ($null -eq $process) {
                if (Get-CimInstance Win32_Process -Filter "ProcessId = $($record.ProcessId)" -ErrorAction Stop) { throw "Cannot retain qkrpc process $($record.ProcessId)." }
                continue
            }
            $retained.Add($process)
            if ($process.HasExited) { continue }
            $null = $process.Handle
            $fresh = Get-CimInstance Win32_Process -Filter "ProcessId = $($record.ProcessId)" -ErrorAction Stop
            if ($process.HasExited) { continue }
            if (-not $fresh -or -not $fresh.CreationDate) { throw "Cannot revalidate retained process $($record.ProcessId)." }
            # WMI dates carry microseconds; the retained handle still names the original process instance.
            if (([decimal]::Floor([decimal]$process.StartTime.ToUniversalTime().Ticks / 10)) -ne ([decimal]::Floor([decimal]([datetime]$fresh.CreationDate).ToUniversalTime().Ticks / 10))) {
                throw "Qkrpc PID $($record.ProcessId) changed during ownership verification."
            }
            if (-not (Test-QkrpcOwnedProcessRecord $fresh $scope -ServeOnly:$ServeOnly -ServeHost $ServeHost -ServePort $ServePort)) { continue }
            if (-not [string]::Equals((ConvertTo-QkrpcExecutablePath $process.Path), $scope, [StringComparison]::OrdinalIgnoreCase)) {
                throw "Retained qkrpc process $($record.ProcessId) does not match the executable scope."
            }
            $eligible.Add($process)
        }
        foreach ($process in $eligible) {
            if ($process.HasExited) { continue }
            # Revalidate immediately before dispatch; never use taskkill /T or a PID-only fallback.
            $fresh = Get-CimInstance Win32_Process -Filter "ProcessId = $($process.Id)" -ErrorAction Stop
            if (-not $fresh) {
                if ($process.HasExited) { continue }
                throw "Cannot verify qkrpc process $($process.Id) immediately before stop."
            }
            if (-not (Test-QkrpcOwnedProcessRecord $fresh $scope -ServeOnly:$ServeOnly -ServeHost $ServeHost -ServePort $ServePort)) { continue }
            if (([decimal]::Floor([decimal]$process.StartTime.ToUniversalTime().Ticks / 10)) -ne ([decimal]::Floor([decimal]([datetime]$fresh.CreationDate).ToUniversalTime().Ticks / 10))) { throw 'Qkrpc process identity changed before stop.' }
            $process.Kill()
            if (-not $process.WaitForExit($ExitWaitMs)) { throw "Stopped qkrpc instance $($process.Id) did not exit within ${ExitWaitMs}ms." }
            $stopped.Add($process.Id)
        }
    } finally { foreach ($process in $retained) { $process.Dispose() } }
    if ($stopped.Count -gt 0) {
        Write-Host "Stopped scoped qkrpc (PID(s): $($stopped -join ', '))" -ForegroundColor DarkYellow
        if ($GraceMs -gt 0) { Start-Sleep -Milliseconds $GraceMs }
    }
    return $stopped.Count
}

function Stop-QkrpcProcessesUsingDirectory {
    param([Parameter(Mandatory = $true)][string]$Directory, [int]$GraceMs = 1500)
    Stop-QkrpcProcesses -ExecutablePath (Join-Path $Directory 'qkrpc.exe') -GraceMs $GraceMs
}
