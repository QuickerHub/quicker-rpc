param([switch]$WaitForGate)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot '..'))
$token = [Guid]::NewGuid().ToString()
$fixtureRoot = Join-Path $repositoryRoot ".tmp\installer-native-$token"
$sourceRoot = Join-Path $projectRoot 'electron\build\installer-helper'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (Test-Path -LiteralPath $fixtureRoot) { throw 'Fresh owned fixture required' }
New-Item -ItemType Directory -Path (Join-Path $fixtureRoot 'target\resources'), (Join-Path $fixtureRoot 'foreign') -Force | Out-Null
& $compiler /nologo /target:winexe /optimize+ /r:System.Windows.Forms.dll /r:System.Drawing.dll "/out:$fixtureRoot\target\quicker-agent.exe" (Join-Path $sourceRoot 'OwnedWindowFixture.cs')
if ($LASTEXITCODE -ne 0) { throw 'Fixture compilation failed' }
Copy-Item -LiteralPath (Join-Path $fixtureRoot 'target\quicker-agent.exe') -Destination (Join-Path $fixtureRoot 'foreign\quicker-agent.exe')
Copy-Item -LiteralPath (Join-Path $fixtureRoot 'target\quicker-agent.exe') -Destination (Join-Path $fixtureRoot 'target\resources\node.exe')
[IO.File]::WriteAllText((Join-Path $fixtureRoot 'target\Uninstall quicker-agent.exe'), 'fixture: never executed')
& $compiler /nologo /target:exe /optimize+ /r:System.Runtime.Serialization.dll "/resource:$sourceRoot\payload-policy.json,QuickerAgent.Installer.Payload" "/out:$fixtureRoot\NativeOwnership.Tests.exe" (Join-Path $sourceRoot 'ProcessOwnershipPolicy.cs') (Join-Path $sourceRoot 'PayloadPolicy.cs') (Join-Path $sourceRoot 'NativeOwnership.cs') (Join-Path $sourceRoot 'NativeOwnership.Tests.cs')
if ($LASTEXITCODE -ne 0) { throw 'Native fixture runner compilation failed' }
$ownedChildren = @()
$nativeExit = 1
try {
    foreach ($entry in @(@('target\quicker-agent.exe', 'root.ready'), @('foreign\quicker-agent.exe', 'foreign.ready'), @('target\resources\node.exe', 'backend.ready'))) {
        $readyArgument = '"' + (Join-Path $fixtureRoot $entry[1]) + '"'
        $child = Start-Process -FilePath (Join-Path $fixtureRoot $entry[0]) -ArgumentList $readyArgument -WindowStyle Hidden -PassThru
        $null = $child.Handle
        $ownedChildren += $child
    }
    $fixturePids = @($ownedChildren | ForEach-Object { $_.Id })
    $identity = @{ fixtureRoot = $fixtureRoot; pids = $fixturePids; registry = "HKCU\Software\QuickerAgent\InstallerTests\$token" }
    [IO.File]::WriteAllText((Join-Path $fixtureRoot 'owned-fixture.json'), ($identity | ConvertTo-Json))
    Write-Output ($identity | ConvertTo-Json -Compress)
    $clock = [Diagnostics.Stopwatch]::StartNew()
    while (@('root.ready', 'foreign.ready', 'backend.ready').Where({ !(Test-Path -LiteralPath (Join-Path $fixtureRoot $_)) }).Count -gt 0) {
        if ($clock.ElapsedMilliseconds -gt 10000) { throw 'Hidden fixture did not become ready' }
        Start-Sleep -Milliseconds 50
    }
    if ($WaitForGate) {
        while (!(Test-Path -LiteralPath (Join-Path $fixtureRoot 'allow-test'))) {
            if ($clock.ElapsedMilliseconds -gt 30000) { throw 'Owned fixture gate timed out' }
            Start-Sleep -Milliseconds 100
        }
    }
    & (Join-Path $fixtureRoot 'NativeOwnership.Tests.exe') (Join-Path $fixtureRoot 'target') (Join-Path $fixtureRoot 'foreign') $token @fixturePids *> (Join-Path $fixtureRoot 'native-test.log')
    $nativeExit = $LASTEXITCODE
    Get-Content -LiteralPath (Join-Path $fixtureRoot 'native-test.log')
}
finally {
    foreach ($child in $ownedChildren) {
        try { if (!$child.HasExited) { $child.Kill(); $child.WaitForExit(2000) | Out-Null } }
        finally { $child.Dispose() }
    }
}
exit $nativeExit
