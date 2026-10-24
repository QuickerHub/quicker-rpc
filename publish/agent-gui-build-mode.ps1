# Shared production entry routing; callers run from agent-gui.
function Invoke-QuickerAgentSourceBuild {
    param(
        [ValidateSet('static', 'legacy-next')]
        [string]$RuntimeMode = 'static'
    )

    $RuntimeMode = $RuntimeMode.ToLowerInvariant()
    $buildCommand = if ($RuntimeMode -eq 'legacy-next') { 'build:legacy-next' } else { 'build' }
    Write-Host "pnpm $buildCommand ($RuntimeMode production)..." -ForegroundColor Cyan
    & pnpm $buildCommand
    if ($LASTEXITCODE -ne 0) { throw "pnpm $buildCommand failed ($LASTEXITCODE)" }
}

function Invoke-QuickerAgentElectronPrepare {
    param(
        [ValidateSet('static', 'legacy-next')]
        [string]$RuntimeMode = 'static',
        [switch]$SkipAppBuild
    )

    $RuntimeMode = $RuntimeMode.ToLowerInvariant()
    # Static prepare owns docs generation, type checking and the fresh app build.
    # Legacy prepare consumes the explicitly built Next standalone instead.
    if ($RuntimeMode -eq 'legacy-next' -and -not $SkipAppBuild) {
        Invoke-QuickerAgentSourceBuild -RuntimeMode $RuntimeMode
    }

    $prepareArguments = @('electron:prepare', "--runtime=$RuntimeMode")
    if ($SkipAppBuild) { $prepareArguments += '--reuse-app' }
    Write-Host "electron:prepare ($RuntimeMode; reuse app: $($SkipAppBuild.IsPresent))..." -ForegroundColor Cyan
    & pnpm @prepareArguments
    if ($LASTEXITCODE -ne 0) { throw "electron:prepare failed ($LASTEXITCODE; runtime=$RuntimeMode)" }
}
