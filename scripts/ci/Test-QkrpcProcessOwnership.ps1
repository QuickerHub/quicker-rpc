#!/usr/bin/env pwsh
# Isolated process ownership matrices and generated Windows executables. No product binary is executed.
[CmdletBinding()]
param([switch]$SkipNative)
$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'The process ownership fixture requires Windows.' }
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
. (Join-Path $repoRoot 'publish/qkrpc-publish-lib.ps1')
. (Join-Path $repoRoot 'publish/qkrpc-serve-build.ps1')
function Assert-Ownership([bool]$Condition, [string]$Message) { if (-not $Condition) { throw "Process ownership fixture failed: $Message" } }
function Assert-Rejected([scriptblock]$Run, [string]$Message) {
    $failure = $null
    try { & $Run | Out-Null } catch { $failure = $_ }
    Assert-Ownership ($null -ne $failure) $Message
}
$tempParent = Join-Path $repoRoot '.tmp'
New-Item -ItemType Directory -Path $tempParent -Force | Out-Null
Assert-Ownership (-not ((Get-Item -LiteralPath $tempParent).Attributes -band [IO.FileAttributes]::ReparsePoint)) 'Fixture parent is redirected'
$fixture = Join-Path $tempParent ('process-ownership-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixture | Out-Null
$scope = Join-Path $fixture 'install/qkrpc.exe'
New-Item -ItemType Directory -Path (Split-Path -Parent $scope) -Force | Out-Null
[IO.File]::WriteAllText($scope, 'inert fixture before native compilation')
$created = [datetime]'2026-10-23T00:00:00Z'
function New-Record([int]$Id, [string]$Executable, [string]$Arguments = 'mcp') {
    [pscustomobject]@{ ProcessId = $Id; ExecutablePath = $Executable; CommandLine = ('"' + $Executable + '" ' + $Arguments); CreationDate = $created }
}
try {
    $serve = 'serve --host 127.0.0.1 --port 19477 --no-bootstrap'
    Assert-Ownership (Test-QkrpcOwnedProcessRecord (New-Record 1 $scope) $scope) 'Exact executable was not selected'
    Assert-Ownership (Test-QkrpcOwnedProcessRecord (New-Record 1 $scope.ToUpperInvariant()) $scope) 'Windows path case changed scope'
    foreach ($outside in @((Join-Path $fixture 'install-other/qkrpc.exe'), (Join-Path $fixture 'install/nested/qkrpc.exe'), (Join-Path $fixture 'other/qkrpc.exe'))) {
        Assert-Ownership (-not (Test-QkrpcOwnedProcessRecord (New-Record 1 $outside) $scope)) 'Sibling/prefix/nested executable escaped the exact scope'
    }
    Assert-Ownership (Test-QkrpcOwnedProcessRecord (New-Record 1 $scope $serve) $scope -ServeOnly -ServeHost '127.0.0.1' -ServePort 19477) 'Exact serve was rejected'
    foreach ($arguments in @('mcp --note serve', $serve.Replace('19477', '19478'), $serve.Replace('127.0.0.1', 'localhost'))) {
        Assert-Ownership (-not (Test-QkrpcOwnedProcessRecord (New-Record 1 $scope $arguments) $scope -ServeOnly -ServeHost '127.0.0.1' -ServePort 19477)) 'Foreign operation or endpoint was selected'
    }
    foreach ($arguments in @('serve', "$serve --port 19477", "$serve --pipe other", 'serve --host 127.0.0.1 --port 19477')) {
        Assert-Rejected { Test-QkrpcOwnedProcessRecord (New-Record 1 $scope $arguments) $scope -ServeOnly -ServeHost '127.0.0.1' -ServePort 19477 } 'Ambiguous serve ownership did not fail closed'
    }
    foreach ($badPath in @('qkrpc.exe', 'C:relative\qkrpc.exe', "$scope`:stream", (Join-Path $fixture 'install./qkrpc.exe'))) {
        Assert-Rejected { Assert-QkrpcExecutableScope $badPath } 'Ambiguous scope was accepted'
    }
    $argv = Split-QkrpcWindowsCommandLine '"C:\folder with spaces\qkrpc.exe" serve --host "127.0.0.1" --port 19477 --no-bootstrap'
    Assert-Ownership ($argv.Count -eq 7 -and $argv[0] -eq 'C:\folder with spaces\qkrpc.exe') 'Windows quoting was not parsed as arguments'
    Assert-Rejected { Split-QkrpcWindowsCommandLine '"C:\unterminated\qkrpc.exe' } 'Unterminated command was accepted'
    $junction = Join-Path $fixture 'redirected-install'
    New-Item -ItemType Junction -Path $junction -Target (Split-Path -Parent $scope) | Out-Null
    Assert-Rejected { Assert-QkrpcExecutableScope (Join-Path $junction 'qkrpc.exe') } 'Redirected executable directory was accepted'
    $setupPolicy = Get-Content -LiteralPath (Join-Path $repoRoot 'publish/qkrpc-setup.iss') -Raw
    Assert-Ownership ($setupPolicy -notmatch '(?i)taskkill|KillQkrpcProcesses|InitializeSetup') 'Setup still has a global process termination path'
    Assert-Ownership ($setupPolicy -match '(?m)^CloseApplications=no\s*$' -and $setupPolicy -match '(?m)^RestartApplications=no\s*$') 'Setup may automatically close/restart unknown processes'
    Write-Host 'PASS: exact case-insensitive executable scope, sibling/nested boundaries and explicit serve argv/host/port.'

    & {
        $script:healthPayload = '{"ok":false}'
        function Invoke-WebRequest {
            param([string]$Uri, [switch]$UseBasicParsing, [int]$TimeoutSec, [switch]$SkipHttpErrorCheck)
            Assert-Ownership ($SkipHttpErrorCheck) 'HTTP 503 listener responses would throw before protocol validation'
            [pscustomobject]@{ StatusCode = 503; Content = $script:healthPayload }
        }
        Assert-Ownership (Test-QkrpcServeListening 'http://fixture.invalid:19477') 'Plugin-unavailable HTTP 503 was not recognized as a listening serve'
        $script:healthPayload = '{"unrelated":true}'
        Assert-Ownership (-not (Test-QkrpcServeListening 'http://fixture.invalid:19477')) 'Unrelated HTTP payload was recognized as serve'
        $script:healthPayload = 'not-json'
        Assert-Ownership (-not (Test-QkrpcServeListening 'http://fixture.invalid:19477')) 'Malformed HTTP payload was recognized as serve'
    }

    & {
        $script:ownershipRecords = @(); $script:freshRecords = @{}; $script:trace = [Collections.Generic.List[string]]::new()
        $script:fakeProcesses = @{}; $script:waitResult = $true; $script:killFails = $false
        function Get-CimInstance {
            [CmdletBinding()] param([string]$ClassName, [string]$Filter)
            Assert-Ownership ($ClassName -eq 'Win32_Process') 'Unexpected CIM class'
            $script:trace.Add("cim:$Filter")
            if ($Filter -eq "Name = 'qkrpc.exe'") { return $script:ownershipRecords }
            if ($Filter -match '^ProcessId = (\d+)$') { return $script:freshRecords[[int]$Matches[1]] }
            throw 'Unscoped process query'
        }
        function Get-Process {
            [CmdletBinding()] param([int]$Id)
            $script:trace.Add("lookup:$Id")
            return $script:fakeProcesses[$Id]
        }
        function New-FakeProcess([int]$Id, [string]$Executable) {
            $process = [pscustomobject]@{ Id = $Id; Path = $Executable; StartTime = $created; HasExited = $false; Disposed = $false; Trace = $script:trace }
            $process | Add-Member ScriptProperty Handle { $this.Trace.Add("handle:$($this.Id)"); return 1 }
            $process | Add-Member ScriptMethod Kill { $this.Trace.Add("kill:$($this.Id)"); if ($script:killFails) { throw 'fixture access denied' } }
            $process | Add-Member ScriptMethod WaitForExit { param([int]$Timeout) $this.Trace.Add("wait:$Timeout"); if ($script:waitResult) { $this.HasExited = $true }; return $script:waitResult }
            $process | Add-Member ScriptMethod Dispose { $this.Disposed = $true; $this.Trace.Add("dispose:$($this.Id)") }
            return $process
        }
        function Reset-Fakes {
            $script:trace.Clear(); $script:ownershipRecords = @(New-Record 12345 $scope $serve)
            $script:freshRecords = @{ 12345 = $script:ownershipRecords[0] }; $script:fakeProcesses = @{ 12345 = (New-FakeProcess 12345 $scope) }
            $script:waitResult = $true; $script:killFails = $false
        }
        Reset-Fakes
        Assert-Rejected { Stop-QkrpcProcesses -GraceMs 0 } 'Missing scope was accepted'
        Assert-Ownership ($script:trace.Count -eq 0) 'Missing scope queried real processes'
        Assert-Ownership ((Stop-QkrpcProcesses -ExecutablePath $scope -ServeOnly -ServeHost '127.0.0.1' -ServePort 19477 -GraceMs 0 -ExitWaitMs 50) -eq 1) 'Owned process was not stopped'
        Assert-Ownership ($script:fakeProcesses[12345].Disposed -and 'wait:50' -in $script:trace -and 'kill:12345' -in $script:trace) 'Retained process was not awaited/disposed'
        Reset-Fakes; $script:freshRecords[12345] = New-Record 12345 (Join-Path $fixture 'outside/qkrpc.exe') $serve
        Assert-Ownership ((Stop-QkrpcProcesses -ExecutablePath $scope -GraceMs 0) -eq 0 -and 'kill:12345' -notin $script:trace) 'Reused foreign PID was stopped'
        Reset-Fakes; $script:freshRecords[12345].CreationDate = $created.AddSeconds(1)
        Assert-Rejected { Stop-QkrpcProcesses -ExecutablePath $scope -GraceMs 0 } 'Changed process creation time was accepted'
        Assert-Ownership ('kill:12345' -notin $script:trace) 'Changed instance was killed'
        Reset-Fakes; $script:fakeProcesses[12345].Path = Join-Path $fixture 'outside/qkrpc.exe'
        Assert-Rejected { Stop-QkrpcProcesses -ExecutablePath $scope -GraceMs 0 } 'Retained handle path mismatch was accepted'
        Reset-Fakes; $script:ownershipRecords += [pscustomobject]@{ ProcessId = 999; ExecutablePath = $null }
        Assert-Rejected { Stop-QkrpcProcesses -ExecutablePath $scope -GraceMs 0 } 'Unknown executable path was ignored'
        Assert-Ownership ('kill:12345' -notin $script:trace) 'Preflight killed a process before proving every candidate'
        Reset-Fakes; $script:killFails = $true
        Assert-Rejected { Stop-QkrpcProcesses -ExecutablePath $scope -GraceMs 0 } 'Kill failure was reported successful'
        Assert-Ownership ($script:fakeProcesses[12345].Disposed) 'Kill failure leaked the process handle'
        Reset-Fakes; $script:waitResult = $false
        Assert-Rejected { Stop-QkrpcProcesses -ExecutablePath $scope -GraceMs 0 -ExitWaitMs 50 } 'Exit timeout was reported successful'
        Assert-Ownership ($script:fakeProcesses[12345].Disposed) 'Exit timeout leaked the process handle'
        Reset-Fakes; $script:fakeProcesses[12345].HasExited = $true
        Assert-Ownership ((Stop-QkrpcProcesses -ExecutablePath $scope -GraceMs 0) -eq 0 -and 'kill:12345' -notin $script:trace) 'Already exited process was killed'
        Reset-Fakes; $script:fakeProcesses.Remove(12345)
        Assert-Rejected { Stop-QkrpcProcesses -ExecutablePath $scope -GraceMs 0 } 'A still-live process without a retained handle was silently skipped'

        $serveRepo = Join-Path $fixture 'build'; $serveExe = Join-Path $serveRepo 'publish/cli/qkrpc.exe'
        New-Item -ItemType Directory -Path (Split-Path -Parent $serveExe) -Force | Out-Null
        [IO.File]::WriteAllText($serveExe, 'inert build fixture')
        $script:listenerIds = @(); $script:startCalls = 0; $script:healthCalls = 0; $script:replaceAtHealth = $false; $script:vanishAtHealth = $false
        function Get-NetTCPConnection { [CmdletBinding()] param([string]$State)
            Assert-Ownership ($State -eq 'Listen') 'Socket query widened'
            foreach ($listenerId in $script:listenerIds) { [pscustomobject]@{ LocalPort = 19477; LocalAddress = '127.0.0.1'; OwningProcess = $listenerId } }
        }
        function Test-QkrpcServeListening { param([string]$BaseUrl, [int]$TimeoutSec)
            $script:healthCalls++; if ($script:replaceAtHealth) { $script:listenerIds = @(999) }; if ($script:vanishAtHealth) { $script:listenerIds = @() }; return $true
        }
        function Start-Process { [CmdletBinding()] param([string]$FilePath, [string[]]$ArgumentList, [string]$WorkingDirectory, [string]$WindowStyle, [switch]$PassThru)
            Assert-Ownership ($FilePath -eq $serveExe -and $WindowStyle -eq 'Hidden' -and $PassThru) 'Build did not retain its exact hidden child'
            Assert-Ownership (($ArgumentList -join ' ') -eq $serve) 'Build serve argv changed'
            $script:startCalls++; $script:ownershipRecords = @(New-Record 12345 $FilePath $serve)
            $script:listenerIds = @(12345); $script:spawned = New-FakeProcess 12345 $FilePath; return $script:spawned
        }
        $oldPort = $env:QKRPC_PORT
        try {
            $env:QKRPC_PORT = '19477'; $script:ownershipRecords = @(); $script:listenerIds = @(999)
            Assert-Rejected { Start-QkrpcServe -RepoRoot $serveRepo } 'Foreign listener was adopted from health alone'
            Assert-Ownership ($script:startCalls -eq 0 -and $script:healthCalls -eq 0) 'Foreign listener was queried/adopted or replaced'
            Assert-Rejected { Stop-QkrpcServe -RepoRoot $serveRepo } 'Build stopped an unknown port owner'
            $script:listenerIds = @(); Start-QkrpcServe -RepoRoot $serveRepo
            Assert-Ownership ($script:startCalls -eq 1 -and $script:spawned.Disposed -and -not $script:spawned.HasExited) 'Successful owned serve did not survive readiness'
            $script:vanishAtHealth = $true
            Assert-Rejected { Start-QkrpcServe -RepoRoot $serveRepo } 'An existing listener disappearing during health was reported ready'
            Assert-Ownership ($script:startCalls -eq 1) 'A disappearing existing listener triggered an implicit replacement spawn'
            $script:vanishAtHealth = $false
            $script:listenerIds = @(); $script:replaceAtHealth = $true; $script:trace.Clear()
            Assert-Rejected { Start-QkrpcServe -RepoRoot $serveRepo } 'Late foreign health response was accepted'
            Assert-Ownership ($script:spawned.HasExited -and $script:spawned.Disposed -and 'kill:12345' -in $script:trace -and 'kill:999' -notin $script:trace) 'Failed start did not clean only its own child'
        } finally { $env:QKRPC_PORT = $oldPort }
    }
    Write-Host 'PASS: preflight, retained handle/path/creation time, no PID/tree fallback; foreign and late serve listeners fail closed.'

    if (-not $SkipNative) { & (Join-Path $PSScriptRoot 'Test-QkrpcOwnedDummyProcesses.ps1') -FixtureDirectory $fixture }
}
finally {
    $actual = (Resolve-Path -LiteralPath $fixture).Path
    $relative = [IO.Path]::GetRelativePath($tempParent, $actual)
    if ([IO.Path]::IsPathRooted($relative) -or $relative -eq '..' -or $relative.StartsWith('..' + [IO.Path]::DirectorySeparatorChar)) { throw 'Refusing fixture cleanup outside its generated directory.' }
    Remove-Item -LiteralPath $actual -Recurse -Force
}
