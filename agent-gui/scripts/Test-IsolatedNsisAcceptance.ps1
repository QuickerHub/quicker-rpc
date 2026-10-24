[CmdletBinding()]
param([ValidateSet('Plan','Fresh','Upgrade','Launch','Verify')][string]$Action = 'Plan')
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib/ElectronSmoke.ps1')
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$fixtureRoot = Assert-SmokeLocalPath (Join-Path $repo '.tmp/nsis-fixture-4ad81d73')
$manifest = Get-Content -LiteralPath (Join-Path $fixtureRoot 'fixture.json') -Raw | ConvertFrom-Json
$guid = '4ad81d73-08a4-4f34-bdc9-c74adb8bfd63'
$install = Assert-SmokeLocalPath (Join-Path $fixtureRoot 'installed')
if ($manifest.format -ne 'quicker-agent-nsis-fixture-v1' -or $manifest.guid -ne $guid -or $manifest.appId -ne 'ai.quicker.agent.nsisfixture.4ad81d73' -or
    $manifest.productName -ne 'QuickerAgent NSIS Fixture 4ad81d73' -or $manifest.runRoot -cne $fixtureRoot -or $manifest.directory -cne $install) { throw 'Unknown fixture identity' }
$installKey = "Software\$guid"
$uninstallKey = "Software\Microsoft\Windows\CurrentVersion\Uninstall\$guid"
function Assert-FixtureOwnedPath([string]$Path) {
    $absolute = Assert-SmokeLocalPath $Path
    if (-not $absolute.StartsWith($fixtureRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::Ordinal)) { throw 'Path escaped exact owned fixture root' }
    return $absolute
}
function Read-FixtureRegistration {
    foreach ($hive in @([Microsoft.Win32.RegistryHive]::CurrentUser, [Microsoft.Win32.RegistryHive]::LocalMachine)) {
        foreach ($view in @([Microsoft.Win32.RegistryView]::Registry64, [Microsoft.Win32.RegistryView]::Registry32)) {
            $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey($hive, $view)
            try {
                foreach ($name in @($installKey, $uninstallKey)) {
                    $key = $base.OpenSubKey($name, $false)
                    if ($null -eq $key) { continue }
                    try { [pscustomobject]@{ Hive = $hive; View = $view; Key = $name; Location = $key.GetValue('InstallLocation'); Version = $key.GetValue('DisplayVersion'); Name = $key.GetValue('DisplayName'); Uninstall = $key.GetValue('UninstallString') } }
                    finally { $key.Dispose() }
                }
            } finally { $base.Dispose() }
        }
    }
}
function Get-FixtureArtifact([string]$Version) {
    $directory = Assert-FixtureOwnedPath (Join-Path $fixtureRoot "output/$Version")
    $receipt = Get-Content -LiteralPath (Join-Path $directory 'artifact-receipt.json') -Raw | ConvertFrom-Json
    $setup = Assert-FixtureOwnedPath (Join-Path $directory "nsis-fixture-4ad81d73-$Version-setup.exe")
    if ($receipt.guid -ne $guid -or $receipt.version -ne $Version -or $receipt.setup -cne $setup -or $receipt.setupSha256 -ne (Get-FileHash -LiteralPath $setup -Algorithm SHA256).Hash.ToLowerInvariant()) { throw 'Fixture artifact differs from its build receipt' }
    return $setup
}
function Assert-FixtureInstalled([string]$Version) {
    $records = @(Read-FixtureRegistration)
    if (@($records | Where-Object Hive -eq ([Microsoft.Win32.RegistryHive]::LocalMachine)).Count -gt 0) { throw 'Fixture unexpectedly registered machine-wide' }
    $identity = @($records | Where-Object { $_.Hive -eq [Microsoft.Win32.RegistryHive]::CurrentUser -and $_.Key -eq $installKey })
    $uninstall = @($records | Where-Object { $_.Hive -eq [Microsoft.Win32.RegistryHive]::CurrentUser -and $_.Key -eq $uninstallKey })
    if ($identity.Count -eq 0 -or $uninstall.Count -eq 0) { throw 'Fixture registration is incomplete' }
    foreach ($record in $identity) { if ($record.Location -cne $install) { throw 'Final /D target mismatch' } }
    foreach ($record in $uninstall) {
        if ($record.Version -ne $Version -or $record.Name -ne $manifest.productName -or $record.Uninstall -cne ('"' + (Join-Path $install 'Uninstall quicker-agent.exe') + '" /currentuser')) { throw 'Fixture registration identity differs' }
    }
    $exe = Assert-FixtureOwnedPath (Join-Path $install 'quicker-agent.exe')
    $versionInfo = [Diagnostics.FileVersionInfo]::GetVersionInfo($exe)
    if ($versionInfo.ProductName -ne $manifest.productName -or -not $versionInfo.ProductVersion.StartsWith($Version)) { throw 'Installed fixture executable identity differs' }
}
function Assert-SyntheticData {
    foreach ($property in $manifest.syntheticDataHashes.PSObject.Properties) {
        $path = Assert-FixtureOwnedPath (Join-Path $install $property.Name)
        if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $property.Value) { throw "Synthetic existing data changed: $($property.Name)" }
    }
}
function Invoke-OwnedFixtureSetup([string]$Version) {
    $setup = Get-FixtureArtifact $Version
    $run = New-ElectronSmokeRun $repo
    $environment = Get-ElectronSmokeEnvironment $run
    # The legacy extractor must keep its own plugin/7z-out paths below MAX_PATH.
    # Only this setup job uses the shorter owned temp; Electron's smoke profile
    # and its strict environment/host RPC guard retain their original mapping.
    $setupTemp = Assert-FixtureOwnedPath (Join-Path $fixtureRoot 't')
    $null = New-Item -ItemType Directory -Path $setupTemp -Force
    $environment['TEMP'] = $setupTemp
    $environment['TMP'] = $setupTemp
    if (-not ('QuickerAgent.Smoke.OwnedJob' -as [type])) { Add-Type -Path (Join-Path $PSScriptRoot 'lib/ElectronSmokeProcess.cs') }
    # /D is the last unquoted argument, as required by NSIS. The compile-time
    # final-target gate rejects any path different from this unique directory.
    $arguments = '/S /currentuser /D=' + $install
    $owner = $null
    try {
        $owner = [QuickerAgent.Smoke.OwnedJob]::Start($setup, $arguments, $run.Root, $environment)
        Write-Host "Owned setup pid=$($owner.RootProcessId), identity=$guid; evidence=$($run.Root); setupTemp=$setupTemp"
        $deadline = [DateTime]::UtcNow.AddSeconds(600)
        $nextProgress = [DateTime]::UtcNow.AddSeconds(30)
        while (-not $owner.HasExited -and [DateTime]::UtcNow -lt $deadline) {
            if ([DateTime]::UtcNow -ge $nextProgress) {
                # Diagnostic metadata only; completeness is verified separately
                # after setup, since an in-flight copy is not a stable snapshot.
                $files = @(Get-ChildItem -LiteralPath $install -File -Recurse -ErrorAction SilentlyContinue)
                $latest = $files | Sort-Object CreationTimeUtc -Descending | Select-Object -First 1
                $birth = if ($null -ne $latest) { $latest.CreationTimeUtc.ToString('o') } else { 'none' }
                Write-Host "Owned setup pid=$($owner.RootProcessId) progress: installedFiles=$($files.Count); latestBirthUtc=$birth"
                $nextProgress = [DateTime]::UtcNow.AddSeconds(30)
            }
            Start-Sleep -Milliseconds 200
        }
        if (-not $owner.HasExited) { throw 'Owned setup timed out; retain partial output for review (no rollback claim)' }
    } finally { if ($null -ne $owner) { $owner.Dispose() } }
    Assert-FixtureInstalled $Version
}
if ($Action -eq 'Plan') {
    [pscustomobject]@{ Identity = $guid; InstallDirectory = $install; SetupTempDirectory = (Join-Path $fixtureRoot 't'); RegistryKeys = @($installKey, $uninstallKey); SetupArguments = "/S /currentuser /D=$install";
        Order = @('Fresh: 0.0.1 then seed generated DB/sentinels', 'Upgrade: same directory 0.0.2 then hash data', 'Launch: existing owned Job/profile/RPC guard', 'Verify: registration + synthetic data');
        FinalSetupExecuted = $false; TrueUninstallerExecuted = $false; Shortcuts = 'compiled out'; AutoStart = 'compiled out' } | ConvertTo-Json -Depth 5
    exit 0
}
if ($Action -eq 'Fresh') {
    if (@(Read-FixtureRegistration).Count -ne 0 -or @(Get-ChildItem -LiteralPath $install -Force).Count -ne 0) { throw 'Fresh requires an empty unregistered fixture target' }
    Invoke-OwnedFixtureSetup '0.0.1'
    foreach ($property in $manifest.syntheticDataHashes.PSObject.Properties) {
        $source = Assert-FixtureOwnedPath (Join-Path $fixtureRoot "userdata-source/$($property.Name)")
        $target = Assert-FixtureOwnedPath (Join-Path $install $property.Name)
        $null = New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force
        Copy-Item -LiteralPath $source -Destination $target
    }
    Assert-SyntheticData
} elseif ($Action -eq 'Upgrade') {
    Assert-FixtureInstalled '0.0.1'; Assert-SyntheticData
    Invoke-OwnedFixtureSetup '0.0.2'; Assert-SyntheticData
} elseif ($Action -eq 'Verify') {
    Assert-FixtureInstalled '0.0.2'; Assert-SyntheticData
} elseif ($Action -eq 'Launch') {
    Assert-FixtureInstalled '0.0.2'; Assert-SyntheticData
    $exe = Assert-FixtureOwnedPath (Join-Path $install 'quicker-agent.exe')
    Assert-ElectronSmokeBundleSupport $exe
    $run = New-ElectronSmokeRun $repo
    $environment = Get-ElectronSmokeEnvironment $run
    $syntheticProfile = Join-Path $run.Root 'roaming/QuickerAgent'
    $null = New-Item -ItemType Directory -Path $syntheticProfile
    Copy-Item -LiteralPath (Join-Path $fixtureRoot 'userdata-source/local/agent.db') -Destination (Join-Path $syntheticProfile 'agent.db')
    if (-not ('QuickerAgent.Smoke.OwnedJob' -as [type])) { Add-Type -Path (Join-Path $PSScriptRoot 'lib/ElectronSmokeProcess.cs') }
    $info = Invoke-OwnedElectronSmokeRun -Start {
        [QuickerAgent.Smoke.OwnedJob]::Start($exe, ('--user-data-dir="' + (Join-Path $run.Root 'profile') + '"'), $run.Root, $environment)
    } -Wait {
        param($owner)
        $ready = Wait-OwnedElectronSmokeUi $run $owner 90
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:$($ready.rpcPort)/invoke" -Method Post -Body '{"method":"health"}' -ContentType 'application/json' -SkipHttpErrorCheck -TimeoutSec 3
        if ($response.StatusCode -ne 503 -or ($response.Content | ConvertFrom-Json).error -ne 'SMOKE_HOST_RPC_DISABLED') { throw 'Owned RPC guard did not reject dispatch' }
        return $ready
    }
    $info | ConvertTo-Json -Depth 5
}
Write-Output "fixture-$Action-PASS"
