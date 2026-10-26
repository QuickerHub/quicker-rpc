#!/usr/bin/env pwsh
# Offline fixtures only: no Electron, native job creation, real listener or user profile.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib/ElectronSmoke.ps1')
function Assert-True($Value, $Message) { if (-not $Value) { throw $Message } }
function Assert-Throws([scriptblock]$Operation, [string]$Pattern) {
    try { & $Operation; throw 'Expected failure was not raised' } catch { if ($_.Exception.Message -notmatch $Pattern) { throw } }
}
$workspace = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$testRoot = Join-Path $workspace ('.tmp/electron-smoke-fixture-' + [guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $testRoot
try {
    $run = New-ElectronSmokeRun $testRoot
    $envMap = Get-ElectronSmokeEnvironment $run
    foreach ($name in @('APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'HOME', 'TEMP', 'TMP', 'AGENT_GUI_ROOT', 'AGENT_GUI_DEFAULT_CWD', 'QUICKER_AGENT_DATA_DIR')) {
        Assert-True ($envMap[$name].StartsWith($run.Root + [IO.Path]::DirectorySeparatorChar)) "Ambient path escaped: $name"
    }
    Assert-True (-not $envMap.ContainsKey('ELECTRON_RUN_AS_NODE')) 'Inherited Electron Node mode'
    Assert-True (-not $envMap.ContainsKey('OPENAI_API_KEY')) 'Inherited model credential'
    $script:disposed = 0
    $fixtureOwner = [pscustomobject]@{ RootProcessId = 501; HasExited = $false }
    $fixtureOwner | Add-Member ScriptMethod ContainsProcess { param($processId) return $processId -in @(501, 502) }
    $fixtureOwner | Add-Member ScriptMethod Dispose { $script:disposed += 1 }
    $info = @{ protocol = $run.Protocol; runId = $run.RunId; rootPid = 501; userData = (Join-Path $run.Root 'profile'); hostRpcDisabled = $true; uiPid = 502; uiPort = 45123; rpcPid = 501; rpcPort = 45124 }
    Assert-OwnedSmokeHandshake $run $fixtureOwner ([pscustomobject]$info)
    $bad = $info.Clone(); $bad.runId = 'other'
    Assert-Throws { Assert-OwnedSmokeHandshake $run $fixtureOwner ([pscustomobject]$bad) } 'different run'
    $bad = $info.Clone(); $bad.uiPid = 999
    Assert-Throws { Assert-OwnedSmokeHandshake $run $fixtureOwner ([pscustomobject]$bad) } 'not owned'
    function Get-NetTCPConnection { param($LocalPort, $State, $ErrorAction) return [pscustomobject]@{ LocalAddress = '127.0.0.1'; OwningProcess = $(if ($LocalPort -eq 45123) { 502 } else { 501 }) } }
    $script:requests = @()
    function Invoke-WebRequest { param($Uri, $TimeoutSec, $MaximumRedirection, [switch]$UseBasicParsing) $script:requests += $Uri; return @{ StatusCode = 200 } }
    $info | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $run.Root 'ready.json')
    $null = Wait-OwnedElectronSmokeUi $run $fixtureOwner 1 -DeferWindowApproval
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $run.Root 'approved.json'))) 'Renderer loaded before the explicit request guard was installed'
    $script:requests = @()
    $null = Wait-OwnedElectronSmokeUi $run $fixtureOwner 1
    Assert-True ($script:requests.Count -eq 2) 'Did not restrict HTTP probes to the owned UI'
    Assert-True (@($script:requests | Where-Object { $_ -notlike 'http://127.0.0.1:45123/*' }).Count -eq 0) 'Probed another service'
    Assert-True (Test-Path -LiteralPath (Join-Path $run.Root 'approved.json')) 'Owned UI was not approved'
    $null = Invoke-OwnedElectronSmokeRun { $fixtureOwner } { param($value) return 'ok' }
    Assert-True ($script:disposed -eq 1) 'Successful job was not disposed once'
    Assert-Throws { Invoke-OwnedElectronSmokeRun { $fixtureOwner } { throw [OperationCanceledException]::new('synthetic cancellation') } } 'synthetic cancellation'
    Assert-True ($script:disposed -eq 2) 'Cancelled job was not disposed'
    $fixtureOwner.HasExited = $true
    Assert-Throws { Invoke-OwnedElectronSmokeRun { $fixtureOwner } { param($value) Wait-OwnedElectronSmokeUi $run $value 1 } } 'exited before'
    Assert-True ($script:disposed -eq 3) 'Early-exit job was not disposed'
    Add-Type -Path (Join-Path $PSScriptRoot 'lib/ElectronSmokeProcess.cs')
    $unstarted = [QuickerAgent.Smoke.OwnedJob]::new()
    Assert-Throws { $unstarted.GetProcessSnapshot() } 'disposed'
    Assert-Throws { $unstarted.RetainProcess(501) } 'disposed'
    $nativeSource = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'lib/ElectronSmokeProcess.cs') -Raw
    Assert-True ($nativeSource.IndexOf('AssignProcessToJobObject(owner.job, child.hProcess)') -lt $nativeSource.IndexOf('ResumeThread(child.hThread)')) 'Root resumes before job ownership'
    $mainSource = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'Test-QuickerAgentElectronSmoke.ps1') -Raw
    Assert-True ($mainSource -notmatch 'taskkill|Get-Process|Stop-ElectronOrphanBackends|3000.*3020|127\.0\.0\.1:9477') 'Global process/service behavior remains'
    $tokens = $null; $errors = $null
    $null = [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'Test-QuickerAgentElectronSmoke.ps1'), [ref]$tokens, [ref]$errors)
    Assert-True ($errors.Count -eq 0) 'Smoke script parse failed'
    Write-Host 'Electron smoke isolation offline fixtures passed; native launch not executed.'
} finally {
    $absolute = Assert-SmokeLocalPath $testRoot
    Assert-True ($absolute.StartsWith([IO.Path]::GetFullPath((Join-Path $workspace '.tmp')) + [IO.Path]::DirectorySeparatorChar)) 'Fixture cleanup escaped workspace .tmp'
    Remove-Item -LiteralPath $absolute -Recurse -Force
}
