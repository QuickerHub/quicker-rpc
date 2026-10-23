#!/usr/bin/env pwsh
# Only generated files are installed; process stopping and PATH changes are replaced below.
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'The install overlay sharing-lock fixture requires Windows.' }
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
. (Join-Path $repoRoot 'publish/qkrpc-publish-lib.ps1')

$originalStop = ${function:Stop-QkrpcProcesses}
$script:stopCalls = 0
$script:pathCalls = 0
$script:recordInstall = $false
$script:events = [System.Collections.Generic.List[object]]::new()
function Add-InstallEvent([string]$Kind, [string]$Path) {
    if ($script:recordInstall) { $script:events.Add([pscustomobject]@{ Kind = $Kind; Path = $Path }) }
}
function Get-ChildItem {
    [CmdletBinding()]
    param([string]$LiteralPath, [switch]$File, [switch]$Recurse, [switch]$Force)
    Add-InstallEvent 'enumerate' $LiteralPath
    Microsoft.PowerShell.Management\Get-ChildItem @PSBoundParameters
}
function Get-FileHash {
    [CmdletBinding()]
    param([string]$LiteralPath, [string]$Algorithm)
    Add-InstallEvent 'hash' $LiteralPath
    Microsoft.PowerShell.Utility\Get-FileHash @PSBoundParameters
}
function Copy-Item {
    [CmdletBinding()]
    param([string]$LiteralPath, [string]$Destination, [switch]$Force)
    Add-InstallEvent 'copy' $Destination
    Microsoft.PowerShell.Management\Copy-Item @PSBoundParameters
}
function Stop-QkrpcProcesses {
    param([int]$GraceMs)
    Assert-Overlay ($GraceMs -eq 0) 'Installer added a blind delay after waiting for process exit'
    Add-InstallEvent 'stop' ''
    $script:stopCalls++
    return 0
}
function Remove-StaleQkrpcUserPaths { param([string]$InstallDir) $script:pathCalls++; return $false }
function Add-QuickerRpcUserPath { param([string]$DirectoryPath) $script:pathCalls++; return $false }

function Assert-Overlay([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw "Install overlay fixture failed: $Message" }
}

function Write-FixtureFile([string]$Path, [string]$Content) {
    New-Item -ItemType Directory -Path (Split-Path -Parent $Path) -Force | Out-Null
    [System.IO.File]::WriteAllText($Path, $Content)
}

function Assert-SourceHashes([string]$Source, [string]$Target) {
    foreach ($file in Get-ChildItem -LiteralPath $Source -File -Recurse -Force) {
        $relative = [System.IO.Path]::GetRelativePath($Source, $file.FullName)
        $sourceHash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
        $targetHash = (Get-FileHash -LiteralPath (Join-Path $Target $relative) -Algorithm SHA256).Hash
        Assert-Overlay ($sourceHash -eq $targetHash) "Hash mismatch at $relative"
    }
}

$tempParent = Join-Path $repoRoot '.tmp'
New-Item -ItemType Directory -Path $tempParent -Force | Out-Null
Assert-Overlay (-not ((Get-Item -LiteralPath $tempParent).Attributes -band [System.IO.FileAttributes]::ReparsePoint)) 'Fixture parent must not be redirected'
$fixture = Join-Path $tempParent ('install-overlay-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixture | Out-Null
try {
    # qkrpc.exe is inert fixture text; nothing from this directory is executed.
    $source = Join-Path $fixture 'publish'
    $target = Join-Path $fixture 'install'
    Write-FixtureFile (Join-Path $source 'qkrpc.exe') 'fixture CLI next'
    Write-FixtureFile (Join-Path $source 'Microsoft.Extensions.Configuration.dll') 'fixture shared runtime'
    Write-FixtureFile (Join-Path $source 'nested/with[brackets].json') 'fixture nested resource'
    Write-FixtureFile (Join-Path $target 'qkrpc.exe') 'fixture CLI old'
    $sameDll = Join-Path $target 'Microsoft.Extensions.Configuration.dll'
    Write-FixtureFile $sameDll 'fixture shared runtime'
    Write-FixtureFile (Join-Path $target 'user-extra.json') 'fixture extra retained'
    Write-FixtureFile (Join-Path $target 'nested/user-extra.txt') 'fixture nested extra retained'
    $lock = [System.IO.File]::Open($sameDll, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
    try {
        $script:recordInstall = $true
        try { $installed = Install-QkrpcFromDirectory -SourceDirectory $source -InstallDir $target }
        finally { $script:recordInstall = $false }
        Assert-Overlay ($installed -eq $target) 'Same-hash locked file prevented a successful install'
        $stopIndex = $script:events.FindIndex([Predicate[object]]{ param($event) $event.Kind -eq 'stop' })
        Assert-Overlay ($stopIndex -gt 0) 'No pre-stop copy plan was observed'
        $beforeStop = @($script:events | Select-Object -First $stopIndex)
        $afterStop = @($script:events | Select-Object -Skip ($stopIndex + 1))
        Assert-Overlay (@($beforeStop | Where-Object Kind -eq 'enumerate').Count -eq 1) 'Source enumeration did not finish before Stop'
        Assert-Overlay (@($beforeStop | Where-Object Kind -eq 'hash').Count -eq 5) 'Source and existing target hashes were not all computed before Stop'
        Assert-Overlay (@($afterStop | Where-Object Kind -eq 'enumerate').Count -eq 0) 'Source was enumerated after Stop'
        Assert-Overlay (@($afterStop | Where-Object { $_.Kind -eq 'hash' -and $_.Path.StartsWith($source) }).Count -eq 0) 'Source hashing delayed the copy burst'
        $copies = @($afterStop | Where-Object Kind -eq 'copy')
        Assert-Overlay ($copies.Count -eq 2) 'Installer did not copy exactly the changed files'
        Assert-Overlay (@($copies | Where-Object Path -eq $sameDll).Count -eq 0) 'Same-hash locked DLL was copied'
        Assert-Overlay (($afterStop.Kind -join ',') -eq 'copy,copy,hash,hash') 'Post-copy verification interrupted the changed-file copy burst'
        Assert-SourceHashes $source $target
        Assert-Overlay ([System.IO.File]::ReadAllText((Join-Path $target 'user-extra.json')) -eq 'fixture extra retained') 'Extra file was changed'
        Assert-Overlay ([System.IO.File]::ReadAllText((Join-Path $target 'nested/user-extra.txt')) -eq 'fixture nested extra retained') 'Nested extra file was changed'
        Assert-Overlay ($script:pathCalls -eq 2) 'Successful install did not reach both mocked PATH helpers'
    }
    finally { $lock.Dispose() }
    Write-Host 'PASS: plan/hash before Stop; changed-file copy burst precedes verification; identical locked DLL and extras are preserved.'

    $sourceLocked = Join-Path $fixture 'locked-publish'
    $targetLocked = Join-Path $fixture 'locked-install'
    Write-FixtureFile (Join-Path $sourceLocked 'qkrpc.exe') 'fixture CLI'
    Write-FixtureFile (Join-Path $targetLocked 'qkrpc.exe') 'fixture CLI'
    Write-FixtureFile (Join-Path $sourceLocked 'runtime.dll') 'fixture newer runtime'
    $lockedDll = Join-Path $targetLocked 'runtime.dll'
    Write-FixtureFile $lockedDll 'fixture older runtime'
    $pathCallsBefore = $script:pathCalls
    $script:callerCompleted = $false
    $failure = $null
    $lock = [System.IO.File]::Open($lockedDll, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
    try {
        try {
            & {
                Install-QkrpcFromDirectory -SourceDirectory $sourceLocked -InstallDir $targetLocked | Out-Null
                $script:callerCompleted = $true
            }
        }
        catch { $failure = $_ }
        Assert-Overlay ($null -ne $failure) 'A differing locked DLL must throw to the caller'
        Assert-Overlay (-not $script:callerCompleted) 'The caller continued on the installation success path'
        Assert-Overlay ($script:pathCalls -eq $pathCallsBefore) 'Failed install updated PATH'
        Assert-Overlay ([System.IO.File]::ReadAllText($lockedDll) -eq 'fixture older runtime') 'Locked destination was changed'
    }
    finally { $lock.Dispose() }
    Write-Host 'PASS: differing locked DLL fails the caller and does not update PATH.'

    # A directory named like a source file is not an alternate successful copy destination.
    $blocked = Join-Path $fixture 'directory-target'
    New-Item -ItemType Directory -Path (Join-Path $blocked 'runtime.dll') -Force | Out-Null
    $failure = $null
    $stopCallsBefore = $script:stopCalls
    try { Install-QkrpcFromDirectory -SourceDirectory $sourceLocked -InstallDir $blocked | Out-Null }
    catch { $failure = $_ }
    Assert-Overlay ($null -ne $failure) 'A destination directory must not masquerade as an installed file'
    Assert-Overlay ($script:stopCalls -eq $stopCallsBefore) 'Invalid copy plan stopped processes before failing'
    Write-Host 'PASS: directory/file conflicts fail before stopping processes.'
    Assert-Overlay ($script:stopCalls -eq 2) 'Fixture did not use the mocked process-stop helper'

    # Invoke the actual stop implementation only under fully mocked process APIs.
    & {
        $script:processTrace = [System.Collections.Generic.List[string]]::new()
        $script:fakeTaskkillCode = 0
        $script:fakeWaitResult = $true
        $script:fakeProcess = $null
        $oldExitCode = $global:LASTEXITCODE
        function Get-CimInstance {
            [CmdletBinding()]
            param([string]$ClassName, [string]$Filter)
            Assert-Overlay ($ClassName -eq 'Win32_Process' -and $Filter -eq "Name = 'qkrpc.exe'") 'Process selection was widened'
            [pscustomobject]@{ ProcessId = 12345; CommandLine = 'qkrpc serve' }
        }
        function Get-Process {
            [CmdletBinding()]
            param([int]$Id)
            Assert-Overlay ($Id -eq 12345) 'Unexpected process lookup'
            $script:processTrace.Add('lookup')
            $process = [pscustomobject]@{ HasExited = $false; ProcessName = 'qkrpc'; WaitMs = 0; Disposed = $false; Trace = $script:processTrace }
            $process | Add-Member ScriptProperty Handle { $this.Trace.Add('handle'); return 1 }
            $process | Add-Member ScriptMethod WaitForExit { param([int]$Timeout) $this.Trace.Add('wait'); $this.WaitMs = $Timeout; return $script:fakeWaitResult }
            $process | Add-Member ScriptMethod Dispose { $this.Trace.Add('dispose'); $this.Disposed = $true }
            $script:fakeProcess = $process
            return $process
        }
        function taskkill.exe {
            param([Parameter(ValueFromRemainingArguments)][object[]]$Arguments)
            Assert-Overlay (($Arguments -join ' ') -eq '/PID 12345 /T /F') 'Taskkill selection was widened'
            $script:processTrace.Add('taskkill')
            $global:LASTEXITCODE = $script:fakeTaskkillCode
        }
        function Stop-Process {
            [CmdletBinding()]
            param([object]$InputObject, [switch]$Force)
            Assert-Overlay ([object]::ReferenceEquals($InputObject, $script:fakeProcess) -and $Force) 'Fallback did not use the retained instance'
            $script:processTrace.Add('fallback')
        }
        function Start-Sleep { throw 'GraceMs=0 must not sleep' }
        try {
            $count = & $originalStop -GraceMs 0 -ExitWaitMs 50
            Assert-Overlay ($count -eq 1) 'Confirmed exit was not counted'
            Assert-Overlay (($script:processTrace -join ',') -eq 'lookup,handle,taskkill,wait,dispose') 'Exit was not awaited on the retained instance'
            Assert-Overlay ($script:fakeProcess.WaitMs -eq 50 -and $script:fakeProcess.Disposed) 'Bounded wait or handle disposal was lost'
            $script:processTrace.Clear()
            $script:fakeTaskkillCode = 1
            $count = & $originalStop -ServeOnly -GraceMs 0 -ExitWaitMs 50
            Assert-Overlay ($count -eq 1 -and ($script:processTrace -join ',') -eq 'lookup,handle,taskkill,fallback,wait,dispose') 'Fallback did not wait on the same instance'
            $script:processTrace.Clear()
            $script:fakeWaitResult = $false
            $failure = $null
            try { & $originalStop -GraceMs 0 -ExitWaitMs 50 | Out-Null }
            catch { $failure = $_ }
            Assert-Overlay ($null -ne $failure -and $failure.Exception.Message -match 'did not exit within 50ms') 'Exit timeout did not fail closed'
            Assert-Overlay ($script:fakeProcess.Disposed -and ($script:processTrace -join ',') -eq 'lookup,handle,taskkill,fallback,wait,dispose') 'Timed-out process handle was leaked'
        }
        finally { $global:LASTEXITCODE = $oldExitCode }
    }
    Write-Host 'PASS: stop confirms bounded exit on the retained instance, including fallback and timeout cleanup.'
}
finally {
    # Delete only this generated directory after checking its resolved absolute boundary.
    $actual = (Resolve-Path -LiteralPath $fixture -ErrorAction Stop).Path
    $relative = [System.IO.Path]::GetRelativePath($tempParent, $actual)
    if ([System.IO.Path]::IsPathRooted($relative) -or $relative -eq '..' -or $relative.StartsWith('..' + [System.IO.Path]::DirectorySeparatorChar)) {
        throw "Refusing fixture cleanup outside $tempParent"
    }
    Remove-Item -LiteralPath $actual -Recurse -Force
}
