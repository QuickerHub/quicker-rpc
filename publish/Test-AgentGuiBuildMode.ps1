#!/usr/bin/env pwsh
# Offline command-routing fixtures only. Every build/tool command is fail-closed mocked.
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$taskRepo = Split-Path -Parent $PSScriptRoot
$taskTemporary = Join-Path $taskRepo '.tmp'
$null = New-Item -ItemType Directory -Path $taskTemporary -Force
$taskRoot = Join-Path $taskTemporary ('production-publish-routing-' + [guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $taskRoot
foreach ($taskDirectory in @('agent-gui/node_modules', 'agent-gui/.next', 'QuickerRpc', 'temp', 'roaming', 'local', 'home')) {
    $null = New-Item -ItemType Directory -Path (Join-Path $taskRoot $taskDirectory) -Force
}
'{"release":"0.0.0","build":1}' | Set-Content -LiteralPath (Join-Path $taskRoot 'QuickerRpc/version.json')
'active HMR sentinel' | Set-Content -LiteralPath (Join-Path $taskRoot 'agent-gui/.next/hmr-sentinel')

$global:QuickerAgentBuildModeTestCalls = [Collections.Generic.List[object]]::new()
$global:QuickerAgentBuildModeTestCases = [Collections.Generic.List[string]]::new()
$global:QuickerAgentBuildModeTestFailPnpm = ''
$taskOriginalCommands = @{}
foreach ($taskCommand in @('pnpm', 'node', 'pwsh')) {
    $taskFunction = Get-Command -Name $taskCommand -CommandType Function -ErrorAction SilentlyContinue
    $taskOriginalCommands[$taskCommand] = if ($taskFunction) { $taskFunction.ScriptBlock } else { $null }
}

function Record-ToolCall {
    param([string]$Name, [object[]]$Arguments)
    $normalized = @($Arguments | ForEach-Object { [string]$_ })
    $global:QuickerAgentBuildModeTestCalls.Add(@{ tool = $Name; arguments = $normalized })
    Set-Variable -Name LASTEXITCODE -Scope Global -Value 0
}

function global:pnpm {
    Record-ToolCall 'pnpm' $args
    $status = if ($global:QuickerAgentBuildModeTestFailPnpm -and $args[0] -eq $global:QuickerAgentBuildModeTestFailPnpm) { 37 } else { 0 }
    Set-Variable -Name LASTEXITCODE -Scope 1 -Value $status
    Set-Variable -Name LASTEXITCODE -Scope Global -Value $status
}

function global:node {
    if ($args[0] -notin @('scripts/preflight-release-gate.mjs', 'scripts/build-electron-installer.mjs', 'scripts/verify-electron-asar.mjs', 'scripts/verify-desktop-bundle.mjs')) {
        throw "Unexpected Node command in offline fixture: $($args -join ' ')"
    }
    Record-ToolCall 'node' $args
    Set-Variable -Name LASTEXITCODE -Scope 1 -Value 0
}

function global:pwsh {
    if (@($args | Where-Object { [string]$_ -match '(Preflight-QuickerAgent(Fast|Build)|Publish-QuickerAgent)\.ps1$' }).Count -ne 1) {
        throw "Unexpected PowerShell command in offline fixture: $($args -join ' ')"
    }
    Record-ToolCall 'pwsh' $args
    Set-Variable -Name LASTEXITCODE -Scope 1 -Value 0
}

function Assert-Equal {
    param($Actual, $Expected, [string]$Message)
    if (($Actual | ConvertTo-Json -Depth 8 -Compress) -ne ($Expected | ConvertTo-Json -Depth 8 -Compress)) {
        throw "$Message`nactual: $($Actual | ConvertTo-Json -Depth 8 -Compress)`nexpected: $($Expected | ConvertTo-Json -Depth 8 -Compress)"
    }
}

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
}

function Pnpm-Arguments {
    return @($global:QuickerAgentBuildModeTestCalls | Where-Object tool -eq 'pnpm' | ForEach-Object { $_.arguments -join ' ' })
}

function Case {
    param([string]$Name, [scriptblock]$Run)
    $global:QuickerAgentBuildModeTestCalls.Clear()
    $global:QuickerAgentBuildModeTestFailPnpm = ''
    $global:LASTEXITCODE = 0
    & $Run
    $global:QuickerAgentBuildModeTestCases.Add($Name)
    Write-Host "PASS $Name"
}

$taskEnvironment = @{}
foreach ($taskName in @('TEMP', 'TMP', 'RUNNER_TEMP', 'USERPROFILE', 'HOME', 'APPDATA', 'LOCALAPPDATA', 'CARGO_HOME', 'RUSTUP_HOME', 'AGENT_GUI_DEFAULT_CWD', 'ELECTRON_BUILDER_OUTPUT_DIR')) {
    $taskEnvironment[$taskName] = [Environment]::GetEnvironmentVariable($taskName, 'Process')
}
try {
    $env:TEMP = Join-Path $taskRoot 'temp'
    $env:TMP = $env:TEMP
    $env:RUNNER_TEMP = $env:TEMP
    $env:APPDATA = Join-Path $taskRoot 'roaming'
    $env:LOCALAPPDATA = Join-Path $taskRoot 'local'
    $env:USERPROFILE = Join-Path $taskRoot 'home'
    $env:HOME = $env:USERPROFILE
    . (Join-Path $PSScriptRoot 'agent-gui-build-mode.ps1')

    Case 'default static prepare builds once in the authoritative JS entry' {
        Invoke-QuickerAgentElectronPrepare
        Assert-Equal (Pnpm-Arguments) @('electron:prepare --runtime=static') 'Static prepare must not run a second source build'
    }
    Case 'static reuse is explicit and forwarded to the validator' {
        Invoke-QuickerAgentElectronPrepare -SkipAppBuild
        Assert-Equal (Pnpm-Arguments) @('electron:prepare --runtime=static --reuse-app') 'Reuse flag lost'
    }
    Case 'legacy source build precedes explicit legacy prepare' {
        Invoke-QuickerAgentElectronPrepare -RuntimeMode legacy-next
        Assert-Equal (Pnpm-Arguments) @('build:legacy-next', 'electron:prepare --runtime=legacy-next') 'Legacy order changed'
    }
    Case 'legacy reuse never rebuilds' {
        Invoke-QuickerAgentElectronPrepare -RuntimeMode legacy-next -SkipAppBuild
        Assert-Equal (Pnpm-Arguments) @('electron:prepare --runtime=legacy-next --reuse-app') 'Legacy reuse rebuilt source'
    }
    Case 'PowerShell case-insensitive mode binding forwards canonical CLI spelling' {
        Invoke-QuickerAgentElectronPrepare -RuntimeMode LEGACY-NEXT
        Assert-Equal (Pnpm-Arguments) @('build:legacy-next', 'electron:prepare --runtime=legacy-next') 'Case-insensitive mode did not normalize for the CLI'
    }
    Case 'legacy build failure never starts staging' {
        $global:QuickerAgentBuildModeTestFailPnpm = 'build:legacy-next'
        $caught = $false
        try { Invoke-QuickerAgentElectronPrepare -RuntimeMode legacy-next } catch { $caught = $_.Exception.Message -match 'build:legacy-next failed \(37\)' }
        Assert-True $caught 'Source build failure was swallowed'
        Assert-Equal (Pnpm-Arguments) @('build:legacy-next') 'Staging ran after failed source build'
    }
    Case 'static prepare failure is surfaced with its selected mode' {
        $global:QuickerAgentBuildModeTestFailPnpm = 'electron:prepare'
        $caught = $false
        try { Invoke-QuickerAgentElectronPrepare } catch { $caught = $_.Exception.Message -match 'runtime=static' }
        Assert-True $caught 'Prepare failure was swallowed'
    }
    Case 'unknown modes reject before a command is dispatched' {
        $caught = $false
        try { Invoke-QuickerAgentElectronPrepare -RuntimeMode auto } catch { $caught = $true }
        Assert-True $caught 'Unknown runtime was accepted'
        Assert-Equal $global:QuickerAgentBuildModeTestCalls.Count 0 'Unknown runtime dispatched a command'
    }
    Case 'local default build preserves the active Next HMR cache' {
        & (Join-Path $PSScriptRoot 'Build-AgentGuiLocal.ps1') -RepoRoot $taskRoot -SkipInstall
        Assert-Equal (Pnpm-Arguments) @('build') 'Local build did not use static package entry'
        Assert-Equal (Get-Content -LiteralPath (Join-Path $taskRoot 'agent-gui/.next/hmr-sentinel') -Raw).Trim() 'active HMR sentinel' 'Static build touched .next'
    }
    Case 'local legacy build remains explicitly available' {
        & (Join-Path $PSScriptRoot 'Build-AgentGuiLocal.ps1') -RepoRoot $taskRoot -SkipInstall -RuntimeMode legacy-next
        Assert-Equal (Pnpm-Arguments) @('build:legacy-next') 'Local legacy mode lost'
    }
    Case 'default publishing stages static and preserves the installer chain' {
        & (Join-Path $PSScriptRoot 'Publish-QuickerAgent.ps1') -RepoRoot $taskRoot -SkipQkrpcBuild -PreflightOnly
        Assert-Equal (Pnpm-Arguments) @('electron:prepare --runtime=static') 'Default publish still builds Next'
        Assert-Equal @($global:QuickerAgentBuildModeTestCalls | Where-Object tool -eq 'node' | ForEach-Object { $_.arguments[0] }) @('scripts/preflight-release-gate.mjs', 'scripts/build-electron-installer.mjs', 'scripts/verify-electron-asar.mjs') 'Installer chain changed'
    }
    Case 'publishing builds Next only in selected legacy mode' {
        & (Join-Path $PSScriptRoot 'Publish-QuickerAgent.ps1') -RepoRoot $taskRoot -SkipQkrpcBuild -PreflightOnly -RuntimeMode legacy-next
        Assert-Equal (Pnpm-Arguments) @('build:legacy-next', 'electron:prepare --runtime=legacy-next') 'Legacy publish order lost'
    }
    Case 'old publish SkipNextBuild spelling aliases static staged reuse' {
        & (Join-Path $PSScriptRoot 'Publish-QuickerAgent.ps1') -RepoRoot $taskRoot -SkipQkrpcBuild -PreflightOnly -SkipNextBuild
        Assert-Equal (Pnpm-Arguments) @('electron:prepare --runtime=static --reuse-app') 'Old alias did not bind SkipAppBuild'
        Assert-True (@($global:QuickerAgentBuildModeTestCalls | Where-Object { $_.tool -eq 'node' -and $_.arguments[0] -eq 'scripts/preflight-release-gate.mjs' }).Count -eq 0) 'Reuse unexpectedly rebuilt the app'
    }
    Case 'staging failure stops publishing before the installer' {
        $global:QuickerAgentBuildModeTestFailPnpm = 'electron:prepare'
        $caught = $false
        try { & (Join-Path $PSScriptRoot 'Publish-QuickerAgent.ps1') -RepoRoot $taskRoot -SkipQkrpcBuild -PreflightOnly } catch { $caught = $_.Exception.Message -match 'runtime=static' }
        Assert-True $caught 'Publish continued after staging failed'
        Assert-True (@($global:QuickerAgentBuildModeTestCalls | Where-Object { $_.tool -eq 'node' -and $_.arguments[0] -eq 'scripts/build-electron-installer.mjs' }).Count -eq 0) 'Installer ran after staging failure'
    }
    Case 'medium preflight uses static prepare plus the existing verifier' {
        & (Join-Path $PSScriptRoot 'Preflight-QuickerAgentBuild.ps1') -RepoRoot $taskRoot -SkipQkrpcBuild
        Assert-Equal (Pnpm-Arguments) @('electron:prepare --runtime=static') 'Preflight still builds Next'
        Assert-Equal @($global:QuickerAgentBuildModeTestCalls | Where-Object tool -eq 'node' | ForEach-Object { $_.arguments[0] }) @('scripts/verify-desktop-bundle.mjs') 'Staged verifier was bypassed'
    }
    Case 'medium preflight old reuse alias forwards explicit legacy mode' {
        & (Join-Path $PSScriptRoot 'Preflight-QuickerAgentBuild.ps1') -RepoRoot $taskRoot -SkipQkrpcBuild -SkipNextBuild -RuntimeMode legacy-next
        Assert-Equal (Pnpm-Arguments) @('electron:prepare --runtime=legacy-next --reuse-app') 'Preflight alias or legacy mode lost'
    }
    Case 'release build wrapper forwards selected mode and old reuse alias' {
        & (Join-Path $PSScriptRoot 'Test-QuickerAgentReleaseBuild.ps1') -RepoRoot $taskRoot -BuildOnly -RuntimeMode legacy-next -SkipNextBuild -SkipQkrpcBuild
        $arguments = $global:QuickerAgentBuildModeTestCalls[0].arguments -join ' '
        Assert-True ($arguments -match 'Preflight-QuickerAgentBuild\.ps1') 'Build tier target changed'
        Assert-True ($arguments -match '-RuntimeMode legacy-next') 'Wrapper did not forward mode'
        Assert-True ($arguments -match '-SkipAppBuild:? True') 'Wrapper did not forward reuse'
    }
    Case 'full release test defaults to static with no reuse' {
        & (Join-Path $PSScriptRoot 'Test-QuickerAgentReleaseBuild.ps1') -RepoRoot $taskRoot
        $arguments = $global:QuickerAgentBuildModeTestCalls[0].arguments -join ' '
        Assert-True ($arguments -match 'Publish-QuickerAgent\.ps1') 'Full tier target changed'
        Assert-True ($arguments -match '-RuntimeMode static') 'Wrapper did not forward default mode'
        Assert-True ($arguments -match '-SkipAppBuild:? False') 'Wrapper unexpectedly enabled reuse'
    }
    Case 'public scripts reject an unrecognized mode before running commands' {
        foreach ($name in @('Build-AgentGuiLocal.ps1', 'Publish-QuickerAgent.ps1', 'Preflight-QuickerAgentBuild.ps1', 'Test-QuickerAgentReleaseBuild.ps1')) {
            $caught = $false
            try { & (Join-Path $PSScriptRoot $name) -RepoRoot $taskRoot -RuntimeMode auto } catch { $caught = $true }
            Assert-True $caught "$name accepted unknown mode"
        }
        Assert-Equal $global:QuickerAgentBuildModeTestCalls.Count 0 'Invalid public mode dispatched a command'
    }

    @{ ok = $true; cases = $global:QuickerAgentBuildModeTestCases; fixture = $taskRoot; actualBuilds = 0; actualInstallers = 0; actualReleases = 0 } |
        ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $taskRoot 'result.json')
    Write-Host "Production publish routing: $($global:QuickerAgentBuildModeTestCases.Count) offline cases passed; no native build/install/release executed."
}
finally {
    foreach ($taskName in $taskEnvironment.Keys) { [Environment]::SetEnvironmentVariable($taskName, $taskEnvironment[$taskName], 'Process') }
    foreach ($taskCommand in $taskOriginalCommands.Keys) {
        if ($taskOriginalCommands[$taskCommand]) { Set-Item -LiteralPath "Function:\global:$taskCommand" -Value $taskOriginalCommands[$taskCommand] }
        else { Remove-Item -LiteralPath "Function:$taskCommand" -ErrorAction SilentlyContinue }
    }
    foreach ($taskVariable in @('QuickerAgentBuildModeTestCalls', 'QuickerAgentBuildModeTestCases', 'QuickerAgentBuildModeTestFailPnpm')) { Remove-Variable -Name $taskVariable -Scope Global -ErrorAction SilentlyContinue }
}
