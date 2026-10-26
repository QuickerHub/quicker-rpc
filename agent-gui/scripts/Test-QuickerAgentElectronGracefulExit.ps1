# Explicit production acceptance. Default Plan never launches an app or installer.
[CmdletBinding()]
param(
    [ValidateSet('Plan', 'Run')][string]$Action = 'Plan',
    [Parameter(Mandatory)][string]$PreparedPackage,
    [ValidateRange(1, 3)][int]$EpochCount = 2,
    [ValidateRange(10, 180)][int]$UiTimeoutSec = 90
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
. (Join-Path $PSScriptRoot 'lib/ElectronSmoke.ps1')
$PreparedPackage = Assert-SmokeLocalPath $PreparedPackage
$package = Get-Content -LiteralPath $PreparedPackage -Raw | ConvertFrom-Json
if ($package.format -cne 'quicker-agent.graceful-exit-staging.v1') { throw 'Use the explicit graceful-exit acceptance staging entry.' }
$exe = Assert-SmokeLocalPath $package.executable
$output = Assert-SmokeLocalPath $package.output
if (-not $output.StartsWith((Join-Path $repo '.tmp') + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or
    $exe -cne (Join-Path $output 'win-unpacked/quicker-agent.exe') -or
    $PreparedPackage -cne (Join-Path $output 'prepared.json')) { throw 'Prepared package must belong to this checkout .tmp.' }
$plan = [ordered]@{ action = $Action; package = $PreparedPackage; executable = $exe; sourceCommit = $package.sourceCommit; epochs = $EpochCount
    trigger = 'Existing production preload windowAction(close), React app-request-exit handler, graceful_exit'
    pass = 'Before Job dispose: root/UI/browser/terminal retained handles exit 0 in cleanup order; all observed handles exited; Job PID/count empty; original listeners gone'
    fallback = 'Owned Job close only on failure; never counted as graceful PASS'
    boundaries = @('No NSIS, real user profile, Quicker, model or business actions', 'Isolated profile; smoke RPC guard; package-local fetch guard', 'Synthetic history read across restarts is not old-user-data upgrade acceptance') }
if ($Action -eq 'Plan') { $plan | ConvertTo-Json -Depth 5; exit 0 }
if (-not $IsWindows) { throw 'This explicit acceptance requires Windows Job Objects.' }
Assert-ElectronSmokeBundleSupport $exe
& node (Join-Path $PSScriptRoot 'prepare-electron-graceful-exit.mjs') ("--verify=$PreparedPackage")
if ($LASTEXITCODE -ne 0) { throw 'Sealed full package verification failed.' }
foreach ($artifact in $package.artifacts) {
    if ($artifact.name -notmatch '^resources/[a-zA-Z0-9./-]+$' -or $artifact.name.Contains('..')) { throw 'Invalid staged artifact path.' }
    $path = Assert-SmokeLocalPath (Join-Path (Split-Path -Parent $exe) $artifact.name)
    if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -cne $artifact.sha256) { throw 'Staged artifact changed after provenance was recorded.' }
}
if (-not ('QuickerAgent.Smoke.OwnedJob' -as [type])) { Add-Type -Path (Join-Path $PSScriptRoot 'lib/ElectronSmokeProcess.cs') }
$run = New-ElectronSmokeRun $repo
$environment = Get-ElectronSmokeEnvironment $run
$receipts = @()
$harnessFacts = @('Test-QuickerAgentElectronGracefulExit.ps1', 'electron-graceful-exit-driver.mjs', 'prepare-electron-graceful-exit.mjs', 'lib/ElectronSmoke.ps1', 'lib/ElectronSmokeProcess.cs') | ForEach-Object {
    $path = Join-Path $PSScriptRoot $_
    @{ path = $path; sha256 = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() }
}
function Reserve-GracefulPort {
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
    try { $listener.Start(); return $listener.LocalEndpoint.Port } finally { $listener.Stop() }
}
function Get-OriginalListeners($Listeners) {
    # Query errors must fail acceptance; a successful table with no owned row is empty.
    return @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object {
        $candidate = $_
        @($Listeners | Where-Object { $_.port -eq $candidate.LocalPort -and $_.pid -eq $candidate.OwningProcess }).Count -gt 0
    } | Select-Object LocalAddress, LocalPort, OwningProcess)
}
try {
    foreach ($epoch in 1..$EpochCount) {
        foreach ($name in @('ready.json', 'approved.json')) {
            $path = Join-Path $run.Root $name
            if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path }
        }
        $owner = $null; $driver = $null; $tracked = @(); $listeners = @(); $failure = $null
        $receipt = [ordered]@{ epoch = $epoch; status = 'STARTED'; jobDisposed = $false; forcedJobCleanup = $false; plan = $plan; harness = $harnessFacts }
        try {
            $inspect = Reserve-GracefulPort; $debug = Reserve-GracefulPort
            if ($inspect -eq $debug) { throw 'Ephemeral debugger port reservation raced; no other endpoint will be used.' }
            $arguments = '--inspect=127.0.0.1:' + $inspect + ' --remote-debugging-port=' + $debug + ' --remote-debugging-address=127.0.0.1 --user-data-dir="' + (Join-Path $run.Root 'profile') + '"'
            $owner = [QuickerAgent.Smoke.OwnedJob]::Start($exe, $arguments, $run.Root, $environment)
            $rootHandle = $owner.RetainProcess($owner.RootProcessId); $tracked += $rootHandle
            if ($rootHandle.ImagePath -ine $exe) { throw 'Root process executable identity differs from the supplied package.' }
            $info = Wait-OwnedElectronSmokeUi $run $owner $UiTimeoutSec -DeferWindowApproval
            $uiHandle = $owner.RetainProcess([int]$info.uiPid); $tracked += $uiHandle
            if ($uiHandle.ImagePath -ine (Join-Path (Split-Path -Parent $exe) 'resources/node/node.exe')) { throw 'UI service is not this package portable Node.' }
            foreach ($port in @($inspect, $debug)) {
                if (-not (Test-OwnedSmokeListener $owner $port $owner.RootProcessId)) { throw 'Debugger listener is not owned by this exact Electron root.' }
            }
            $listeners = @(@{ port = [int]$info.uiPort; pid = [int]$info.uiPid }, @{ port = [int]$info.rpcPort; pid = [int]$info.rpcPid }, @{ port = $inspect; pid = $owner.RootProcessId }, @{ port = $debug; pid = $owner.RootProcessId })
            $config = @{ epoch = $epoch; root = $run.Root; runId = $run.RunId; protocol = $run.Protocol; info = $info; inspectPort = $inspect; debugPort = $debug
                origin = "http://127.0.0.1:$($info.uiPort)"; rpcOrigin = "http://127.0.0.1:$($info.rpcPort)" }
            $configPath = Join-Path $run.Root "epoch-$epoch-config.json"
            $config | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $configPath
            $driver = Start-Process -FilePath (Get-Command node).Source -ArgumentList @(('"' + (Join-Path $PSScriptRoot 'electron-graceful-exit-driver.mjs') + '"'), ('"' + $configPath + '"')) -WindowStyle Hidden -PassThru -WorkingDirectory $repo -RedirectStandardOutput (Join-Path $run.Root "epoch-$epoch-driver.log") -RedirectStandardError (Join-Path $run.Root "epoch-$epoch-driver-error.log")
            $beforePath = Join-Path $run.Root "epoch-$epoch-before-exit.json"
            $deadline = [DateTime]::UtcNow.AddSeconds(90); $snapshot = $false; $roles = @{}
            while (-not $driver.HasExited -and [DateTime]::UtcNow -lt $deadline) {
                if (-not $snapshot -and (Test-Path -LiteralPath $beforePath)) {
                    $before = Get-Content -LiteralPath $beforePath -Raw | ConvertFrom-Json
                    $roles = @{ root = $rootHandle; ui = $uiHandle }
                    foreach ($kind in @('browser', 'terminal')) {
                        $runtime = $before.runtime.$kind
                        $handle = $owner.RetainProcess([int]$runtime.pid); $tracked += $handle; $roles[$kind] = $handle
                        if ($handle.ImagePath -ine $uiHandle.ImagePath -or $runtime.ownerPid -ne $info.uiPid -or
                            -not (Test-OwnedSmokeListener $owner $runtime.port $runtime.pid)) { throw 'Runtime process/listener no longer belongs to this exact Node owner.' }
                        $listeners += @{ port = [int]$runtime.port; pid = [int]$runtime.pid }
                    }
                    $jobSnapshot = $owner.GetProcessSnapshot()
                    foreach ($processId in $jobSnapshot.ProcessIds) {
                        if ($processId -notin @($tracked.Pid)) { $tracked += $owner.RetainProcess($processId) }
                    }
                    $receipt.before = @{ utc = [DateTime]::UtcNow.ToString('O'); activeProcessCount = $jobSnapshot.ActiveProcessCount; processIds = $jobSnapshot.ProcessIds; listeners = $listeners }
                    $snapshot = $true
                    Set-Content -LiteralPath (Join-Path $run.Root "epoch-$epoch-exit-approved") -Value 'approved' -NoNewline
                }
                Start-Sleep -Milliseconds 100
            }
            if (-not $driver.HasExited) { throw 'GUI driver exceeded its bounded run.' }
            $driver.WaitForExit()
            if ($driver.ExitCode -ne 0 -or -not $snapshot) { throw 'Production GUI acceptance failed; inspect driver evidence.' }
            $deadline = [DateTime]::UtcNow.AddSeconds(10)
            do {
                $remaining = $owner.GetProcessSnapshot()
                if ($remaining.ActiveProcessCount -eq 0 -and @($tracked | Where-Object { -not $_.HasExited }).Count -eq 0) { break }
                Start-Sleep -Milliseconds 100
            } while ([DateTime]::UtcNow -lt $deadline)
            $processes = @($tracked | ForEach-Object { @{ pid = $_.Pid; image = $_.ImagePath; createdUtc = $_.CreationTimeUtc; exited = $_.HasExited; exitCode = $_.ExitCode; exitedUtc = $_.ExitTimeUtc } })
            $roleEvidence = @{}
            foreach ($name in @('root', 'ui', 'browser', 'terminal')) {
                $handle = $roles[$name]
                $roleEvidence[$name] = @{ pid = $handle.Pid; exitCode = $handle.ExitCode; exitedUtc = $handle.ExitTimeUtc }
                if (-not $handle.HasExited -or $handle.ExitCode -ne 0) { throw 'A product root/runtime did not exit naturally with code 0.' }
            }
            if ($roles.ui.ExitTimeUtc -gt $roles.root.ExitTimeUtc -or $roles.browser.ExitTimeUtc -gt $roles.ui.ExitTimeUtc -or $roles.terminal.ExitTimeUtc -gt $roles.ui.ExitTimeUtc) { throw 'Owned services exited after their parent; normal product drain was not demonstrated.' }
            $originalListeners = Get-OriginalListeners $listeners
            $receipt.beforeJobDispose = @{ utc = [DateTime]::UtcNow.ToString('O'); activeProcessCount = $remaining.ActiveProcessCount; processIds = $remaining.ProcessIds
                allRetainedExited = @($tracked | Where-Object { -not $_.HasExited }).Count -eq 0; originalListeners = $originalListeners; processes = $processes; roles = $roleEvidence }
            if ($remaining.ActiveProcessCount -ne 0 -or $remaining.ProcessIds.Count -ne 0 -or $originalListeners.Count -ne 0 -or -not $receipt.beforeJobDispose.allRetainedExited) { throw 'Owned resources remained before Job dispose.' }
            $receipt.status = 'PASSED'
        } catch {
            $failure = $_; $receipt.status = 'FAILED'; $receipt.failure = $_.Exception.Message
        } finally {
            # This is the first Job close. Success must already be proven above.
            if ($null -ne $owner) {
                $receipt.forcedJobCleanup = $receipt.status -ne 'PASSED'
                $receipt.jobDisposeUtc = [DateTime]::UtcNow.ToString('O')
                $owner.Dispose(); $receipt.jobDisposed = $true
                $cleanupDeadline = [DateTime]::UtcNow.AddSeconds(10)
                while (@($tracked | Where-Object { -not $_.HasExited }).Count -gt 0 -and [DateTime]::UtcNow -lt $cleanupDeadline) { Start-Sleep -Milliseconds 100 }
                $receipt.afterJobDispose = @{ retainedExited = @($tracked | Where-Object { -not $_.HasExited }).Count -eq 0
                    originalListenersGone = $listeners.Count -eq 0 -or @(Get-OriginalListeners $listeners).Count -eq 0 }
            }
            if ($null -ne $driver) { if (-not $driver.HasExited) { $driver.Kill($true); $driver.WaitForExit(5000) | Out-Null }; $driver.Dispose() }
            foreach ($handle in $tracked) { $handle.Dispose() }
            $receipts += $receipt
            $receipts | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $run.Root 'graceful-exit-receipts.json')
            Write-Host "Epoch $epoch $($receipt.status); Job fallback=$($receipt.forcedJobCleanup); evidence: $($run.Root)"
        }
        if ($null -ne $failure) { throw $failure }
    }
} finally {
    @{ root = $run.Root; receipts = (Join-Path $run.Root 'graceful-exit-receipts.json'); prepared = $PreparedPackage } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $repo '.tmp/desktop-graceful-exit-latest.json')
}
