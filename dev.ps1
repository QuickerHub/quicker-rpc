#!/usr/bin/env pwsh

# QuickerRpc + QuickerAgent — single dev entry point.

#

#   pwsh ./dev.ps1                 # qkrpc serve + agent-gui @ :3000 (default)

#   pwsh ./dev.ps1 -Browser        # same + open browser

#   pwsh ./dev.ps1 -Tauri          # desktop WebView2 shell (reuses :3000 when healthy)

#   pwsh ./dev.ps1 -NoWatch        # disable auto hot-update on source changes

#   pwsh ./dev.ps1 -Full           # eager-start voice runtime

#   pwsh ./dev.ps1 -Services qkrpc # qkrpc serve only

#

# Auto hot-update: watches Plugin/CLI/publish sources → build.ps1 -t → restart qkrpc serve.

# Prerequisite: Quicker running with QuickerRpc plugin loaded.



param(

    [string]$Services = 'qkrpc,agent',

    [switch]$NoWatch,

    [switch]$Full,

    [switch]$SkipKill,

    [switch]$Tauri,

    [switch]$Browser,

    [switch]$NoReuse

)



$ErrorActionPreference = 'Stop'



if ($Tauri) {

    . (Join-Path $PSScriptRoot 'scripts/dev-launcher.ps1')

    Invoke-DevTauriLauncher -RepoRoot $PSScriptRoot -SkipKill:$SkipKill -NoReuse:$NoReuse

    exit $LASTEXITCODE

}



$nodeArgs = @(

    (Join-Path $PSScriptRoot 'scripts/dev-supervisor.mjs')

    '--services', $Services

)

if ($NoWatch) { $nodeArgs += '--no-watch' }

else { $nodeArgs += '--watch' }

if ($Full) { $nodeArgs += '--full' }

if ($SkipKill) { $nodeArgs += '--skip-kill' }

if ($Browser) { $nodeArgs += '--open-browser' }



& node @nodeArgs

exit $LASTEXITCODE

