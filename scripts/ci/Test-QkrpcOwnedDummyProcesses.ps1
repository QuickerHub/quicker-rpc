#!/usr/bin/env pwsh
# Only this script's generated sleeping executables enter the process enumerator.
[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$FixtureDirectory)
$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'The native owned-process fixture requires Windows.' }
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
. (Join-Path $repoRoot 'publish/qkrpc-process-ownership.ps1')
function Assert-Dummy([bool]$Condition, [string]$Message) { if (-not $Condition) { throw "Owned dummy fixture failed: $Message" } }
$fixtureRoot = [IO.Path]::GetFullPath($FixtureDirectory)
$relative = [IO.Path]::GetRelativePath((Join-Path $repoRoot '.tmp'), $fixtureRoot)
Assert-Dummy (-not [IO.Path]::IsPathRooted($relative) -and $relative -ne '..' -and -not $relative.StartsWith('..' + [IO.Path]::DirectorySeparatorChar)) 'Fixture must be inside this checkout .tmp'
$nativeRoot = Join-Path $fixtureRoot 'native'
Assert-Dummy (-not (Test-Path -LiteralPath $nativeRoot)) 'Native fixture directory must be newly generated'
$scope = Assert-QkrpcExecutableScope (Join-Path $nativeRoot 'scoped/qkrpc.exe')
$sibling = Join-Path $nativeRoot 'scoped-other/qkrpc.exe'
$nested = Join-Path $nativeRoot 'scoped/nested/qkrpc.exe'
foreach ($exe in @($scope, $sibling, $nested)) { New-Item -ItemType Directory -Path (Split-Path -Parent $exe) -Force | Out-Null }
$source = Join-Path $nativeRoot 'OwnedDummy.cs'
[IO.File]::WriteAllText($source, 'internal static class OwnedDummy { private static void Main() { System.Threading.Thread.Sleep(60000); } }')
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if (-not (Test-Path -LiteralPath $compiler -PathType Leaf)) { throw 'Windows .NET Framework C# compiler is required for the generated process fixture.' }
& $compiler /nologo /target:winexe "/out:$scope" $source
if ($LASTEXITCODE -ne 0) { throw 'Failed to compile the generated sleeping executable.' }
Copy-Item -LiteralPath $scope -Destination $sibling
Copy-Item -LiteralPath $scope -Destination $nested
$script:ownedDummies = [Collections.Generic.List[Diagnostics.Process]]::new()
function Start-Dummy([string]$Executable, [string]$Arguments) {
    $child = Microsoft.PowerShell.Management\Start-Process -FilePath $Executable -ArgumentList $Arguments -WindowStyle Hidden -PassThru
    $script:ownedDummies.Add($child)
    $null = $child.Handle
    $deadline = [DateTime]::UtcNow.AddSeconds(2)
    while (-not $child.HasExited -and -not $child.Path -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 10; $child.Refresh() }
    Assert-Dummy ([string]::Equals($child.Path, $Executable, [StringComparison]::OrdinalIgnoreCase)) "Spawned executable differs: expected $Executable, got $($child.Path)"
    return $child
}
function Get-CimInstance {
    [CmdletBinding()] param([string]$ClassName, [string]$Filter)
    Assert-Dummy ($ClassName -eq 'Win32_Process') 'Unexpected CIM class'
    if ($Filter -eq "Name = 'qkrpc.exe'") {
        foreach ($child in $script:ownedDummies) {
            $child.Refresh()
            if (-not $child.HasExited) { CimCmdlets\Get-CimInstance Win32_Process -Filter "ProcessId = $($child.Id)" -ErrorAction Stop }
        }
        return
    }
    Assert-Dummy ($Filter -match '^ProcessId = (\d+)$') 'Unscoped native query'
    $requestedId = [int]$Matches[1]
    Assert-Dummy ($requestedId -in @($script:ownedDummies.Id)) 'Native query reached a process not created by this fixture'
    CimCmdlets\Get-CimInstance Win32_Process -Filter $Filter -ErrorAction Stop
}
function Get-Process {
    [CmdletBinding()] param([int]$Id)
    Assert-Dummy ($Id -in @($script:ownedDummies.Id)) 'Native handle lookup reached an unowned process'
    Microsoft.PowerShell.Management\Get-Process -Id $Id -ErrorAction SilentlyContinue
}
try {
    $first = Start-Dummy $scope 'mcp'
    $other = Start-Dummy $sibling 'serve --host 127.0.0.1 --port 19477 --no-bootstrap'
    $inner = Start-Dummy $nested 'mcp'
    Assert-Dummy ((Stop-QkrpcProcessesUsingDirectory -Directory (Split-Path -Parent $scope) -GraceMs 0) -eq 1) 'Directory stop did not select exactly its root executable'
    $first.Refresh(); $other.Refresh(); $inner.Refresh()
    Assert-Dummy ($first.HasExited -and -not $other.HasExited -and -not $inner.HasExited) 'Exact stop killed a sibling or nested executable'
    $matching = Start-Dummy $scope 'serve --host 127.0.0.1 --port 19477 --no-bootstrap'
    $otherPort = Start-Dummy $scope 'serve --host 127.0.0.1 --port 19478 --no-bootstrap'
    $sameExeMcp = Start-Dummy $scope 'mcp --note serve'
    Assert-Dummy ((Stop-QkrpcProcesses -ExecutablePath $scope -ServeOnly -ServeHost '127.0.0.1' -ServePort 19477 -GraceMs 0) -eq 1) 'Serve stop did not select exactly its endpoint'
    $matching.Refresh(); $otherPort.Refresh(); $sameExeMcp.Refresh()
    Assert-Dummy ($matching.HasExited -and -not $otherPort.HasExited -and -not $sameExeMcp.HasExited) 'Serve stop killed another endpoint or MCP operation'
    Write-Host 'PASS: real generated executables verify exact directory and argv/port scope; no product process was enumerated or stopped.'
} catch {
    Write-Host "Native dummy failure: $($_.Exception.Message)" -ForegroundColor Red
    throw
} finally {
    $cleanupFailures = [Collections.Generic.List[string]]::new()
    foreach ($child in $script:ownedDummies) {
        try {
            if (-not $child.HasExited) { $child.Kill(); if (-not $child.WaitForExit(2000)) { throw 'Owned dummy did not exit during cleanup.' } }
        } catch { $cleanupFailures.Add($_.Exception.Message) }
        finally { $child.Dispose() }
    }
    if ($cleanupFailures.Count -gt 0) { throw "Owned dummy cleanup failed: $($cleanupFailures -join '; ')" }
}
