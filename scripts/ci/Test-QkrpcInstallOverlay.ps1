#!/usr/bin/env pwsh
# Only generated files are installed; process stopping and PATH changes are replaced below.
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'The install overlay sharing-lock fixture requires Windows.' }
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
. (Join-Path $repoRoot 'publish/qkrpc-publish-lib.ps1')

$script:stopCalls = 0
$script:pathCalls = 0
function Stop-QkrpcProcesses { param([int]$GraceMs) $script:stopCalls++; return 0 }
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
        $installed = Install-QkrpcFromDirectory -SourceDirectory $source -InstallDir $target
        Assert-Overlay ($installed -eq $target) 'Same-hash locked file prevented a successful install'
        Assert-SourceHashes $source $target
        Assert-Overlay ([System.IO.File]::ReadAllText((Join-Path $target 'user-extra.json')) -eq 'fixture extra retained') 'Extra file was changed'
        Assert-Overlay ([System.IO.File]::ReadAllText((Join-Path $target 'nested/user-extra.txt')) -eq 'fixture nested extra retained') 'Nested extra file was changed'
        Assert-Overlay ($script:pathCalls -eq 2) 'Successful install did not reach both mocked PATH helpers'
    }
    finally { $lock.Dispose() }
    Write-Host 'PASS: same-hash shared DLL is skipped; nested hashes and user extras are preserved.'

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
    try { Install-QkrpcFromDirectory -SourceDirectory $sourceLocked -InstallDir $blocked | Out-Null }
    catch { $failure = $_ }
    Assert-Overlay ($null -ne $failure) 'A destination directory must not masquerade as an installed file'
    Write-Host 'PASS: directory/file conflicts are rejected.'
    Assert-Overlay ($script:stopCalls -eq 3) 'Fixture did not use the mocked process-stop helper'
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
