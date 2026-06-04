# Shared helpers for qkrpc publish/install scripts.

function Get-QkrpcDefaultInstallDir {
    return Join-Path $env:LOCALAPPDATA 'Programs\qkrpc'
}

function Get-ExpectedGoogleProtobufAssemblyVersion {
    param([string]$RepoRoot)

    $propsPath = Join-Path $RepoRoot 'Directory.Packages.props'
    if (-not (Test-Path -LiteralPath $propsPath)) {
        throw "Directory.Packages.props not found: $propsPath"
    }

    $xml = [xml](Get-Content -LiteralPath $propsPath -Raw)
    $ns = New-Object System.Xml.XmlNamespaceManager($xml.NameTable)
    $ns.AddNamespace('ms', 'http://schemas.microsoft.com/developer/msbuild/2003')
    $node = $xml.Project.ItemGroup.PackageVersion | Where-Object { $_.Include -eq 'Google.Protobuf' } | Select-Object -First 1
    if (-not $node -or [string]::IsNullOrWhiteSpace($node.Version)) {
        throw 'Directory.Packages.props missing PackageVersion for Google.Protobuf.'
    }

    $semver = $node.Version.Trim()
    $parts = $semver -split '\.'
    if ($parts.Count -lt 3) {
        throw "Google.Protobuf package version must be major.minor.patch: $semver"
    }

    return [Version]::new([int]$parts[0], [int]$parts[1], [int]$parts[2], 0)
}

function Assert-QkrpcPublishGoogleProtobuf {
    param(
        [Parameter(Mandatory = $true)]
        [string]$PublishDir,

        [Parameter(Mandatory = $true)]
        [string]$RepoRoot
    )

    $dllPath = Join-Path $PublishDir 'Google.Protobuf.dll'
    if (-not (Test-Path -LiteralPath $dllPath)) {
        throw "Publish output missing Google.Protobuf.dll: $PublishDir"
    }

    $expected = Get-ExpectedGoogleProtobufAssemblyVersion -RepoRoot $RepoRoot
    $actual = [System.Reflection.AssemblyName]::GetAssemblyName($dllPath).Version
    if ($actual -ne $expected) {
        throw "Google.Protobuf.dll version mismatch in publish output: expected $expected, got $actual ($dllPath)"
    }

    Write-Host "Verified Google.Protobuf.dll ($actual) in publish output." -ForegroundColor DarkGray
}

function Remove-StaleQkrpcUserPaths {
    param(
        [string]$InstallDir = (Get-QkrpcDefaultInstallDir)
    )

    $installTarget = $InstallDir.TrimEnd('\')
    $currentPath = [Environment]::GetEnvironmentVariable('PATH', 'User')
    if ([string]::IsNullOrWhiteSpace($currentPath)) {
        return $false
    }

    $changed = $false
    $segments = @($currentPath -split ';' | ForEach-Object {
        if (-not $_) { return $_ }

        $normalized = $_.TrimEnd('\')
        if ($normalized -eq $installTarget) {
            return $_
        }

        if ($normalized -match '[\\/]publish[\\/]cli$') {
            Write-Host "Removing stale PATH entry: $normalized" -ForegroundColor Yellow
            $changed = $true
            return $null
        }

        return $_
    } | Where-Object { $_ })

    if (-not $changed) {
        return $false
    }

    $newPath = ($segments -join ';').Trim(';')
    [Environment]::SetEnvironmentVariable('PATH', $newPath, 'User')
    return $true
}

function Install-QkrpcFromDirectory {
    param(
        [Parameter(Mandatory = $true)]
        [string]$SourceDirectory,

        [string]$InstallDir = ''
    )

    if ([string]::IsNullOrWhiteSpace($InstallDir)) {
        $InstallDir = Get-QkrpcDefaultInstallDir
    }

    $sourcePath = (Resolve-Path -LiteralPath $SourceDirectory -ErrorAction Stop).Path
    $exePath = Join-Path $sourcePath 'qkrpc.exe'
    if (-not (Test-Path -LiteralPath $exePath)) {
        throw "Source directory does not contain qkrpc.exe: $sourcePath"
    }

    Write-Host "Installing qkrpc to $InstallDir ..." -ForegroundColor Cyan

    if (Test-Path -LiteralPath $InstallDir) {
        Write-Host 'Removing previous install...' -ForegroundColor Yellow
        Remove-Item -LiteralPath $InstallDir -Recurse -Force
    }

    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    Copy-Item -Path (Join-Path $sourcePath '*') -Destination $InstallDir -Recurse -Force

    Remove-StaleQkrpcUserPaths -InstallDir $InstallDir | Out-Null
    Add-QuickerRpcUserPath -DirectoryPath $InstallDir | Out-Null

    Write-Host "Installed: $InstallDir\qkrpc.exe" -ForegroundColor Green
    return $InstallDir
}

function Get-QkrpcLatestCliZipName {
    return 'qkrpc-win-x64.zip'
}

function Get-QuickerRpcCliSetupName {
    param([string]$Version)

    $semver = Get-QuickerRpcSemVerFromVersion -Version $Version
    return "qkrpc-$semver-win-x64-setup.exe"
}

function Get-QkrpcLatestCliSetupName {
    return 'qkrpc-win-x64-setup.exe'
}

function Get-GitHubRepoSlug {
    param([string]$Root = '')

    if (-not $Root) {
        $Root = Split-Path -Parent $PSScriptRoot
    }

    $remote = git -C $Root remote get-url origin 2>$null
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($remote)) {
        return 'QuickerHub/quicker-rpc'
    }

    if ($remote -match 'github\.com[:/](?<owner>[^/]+)/(?<repo>[^/]+?)(?:\.git)?$') {
        return "$($Matches.owner)/$($Matches.repo)"
    }

    return 'QuickerHub/quicker-rpc'
}

function Import-DotEnvFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,

        [switch]$OverwriteExisting
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return
    }

    foreach ($line in Get-Content -LiteralPath $Path) {
        if ($line -match '^\s*#' -or $line -match '^\s*$') {
            continue
        }

        if ($line -notmatch '^(?<key>[^=]+)=(?<val>.*)$') {
            continue
        }

        $key = $Matches.key.Trim()
        if ([string]::IsNullOrWhiteSpace($key)) {
            continue
        }

        if (-not $OverwriteExisting -and -not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($key, 'Process'))) {
            continue
        }

        $value = $Matches.val.Trim().Trim('"').Trim("'")
        [Environment]::SetEnvironmentVariable($key, $value, 'Process')
    }
}

function Import-BitifulEnvFromFiles {
    param([string]$PublishDir = '')

    if (-not $PublishDir) {
        $PublishDir = $PSScriptRoot
    }

    Import-DotEnvFile -Path (Join-Path $PublishDir '.env')
    Import-DotEnvFile -Path (Join-Path $PublishDir '.env.bitiful')
}

function Test-BitifulConfigured {
    return -not [string]::IsNullOrWhiteSpace($env:BITIFUL_ACCESS_KEY) -and
        -not [string]::IsNullOrWhiteSpace($env:BITIFUL_SECRET_KEY) -and
        -not [string]::IsNullOrWhiteSpace($env:BITIFUL_BUCKET_NAME)
}

function Invoke-QuickerAgentBitifulUpload {
    param(
        [Parameter(Mandatory = $true)]
        [string]$InstallerPath,

        [string]$PublishDir = ''
    )

    if (-not $PublishDir) {
        $PublishDir = $PSScriptRoot
    }

    if (-not (Test-Path -LiteralPath $InstallerPath)) {
        throw "Installer not found: $InstallerPath"
    }

    if (-not (Test-BitifulConfigured)) {
        throw 'Bitiful credentials not configured (BITIFUL_ACCESS_KEY, BITIFUL_SECRET_KEY, BITIFUL_BUCKET_NAME).'
    }

    $uploadScript = Join-Path $PublishDir 'bitiful_upload.py'
    if (-not (Test-Path -LiteralPath $uploadScript)) {
        throw "bitiful_upload.py not found: $uploadScript"
    }

    $resolvedInstaller = (Resolve-Path -LiteralPath $InstallerPath -ErrorAction Stop).Path
    $endpointUrl = if ([string]::IsNullOrWhiteSpace($env:BITIFUL_ENDPOINT_URL)) {
        'https://s3.bitiful.net'
    }
    else {
        $env:BITIFUL_ENDPOINT_URL.Trim()
    }

    $objectPrefix = if ([string]::IsNullOrWhiteSpace($env:BITIFUL_OBJECT_PREFIX)) {
        'quicker-rpc/quicker-agent'
    }
    else {
        $env:BITIFUL_OBJECT_PREFIX.Trim()
    }

    if (Get-Command uv -ErrorAction SilentlyContinue) {
        & uv run --with boto3 python $uploadScript $resolvedInstaller `
            --endpoint-url $endpointUrl `
            --object-prefix $objectPrefix
    }
    elseif (Get-Command python -ErrorAction SilentlyContinue) {
        & python -m pip install --disable-pip-version-check --quiet boto3
        if ($LASTEXITCODE -ne 0) {
            throw 'Failed to install boto3. Install uv or pip install boto3.'
        }

        & python $uploadScript $resolvedInstaller `
            --endpoint-url $endpointUrl `
            --object-prefix $objectPrefix
    }
    else {
        throw 'Neither uv nor python found. Install uv (recommended) or Python 3 with pip.'
    }

    if ($LASTEXITCODE -ne 0) {
        throw "Bitiful upload failed with exit code $LASTEXITCODE"
    }
}

function Get-QuickerAgentBitifulDownloadPrefix {
    return 'https://s3.bitiful.net/quicker-pkgs/quicker-rpc/quicker-agent'
}

function Get-QuickerAgentBitifulVersionTxtUrl {
    return "$(Get-QuickerAgentBitifulDownloadPrefix)/version.txt"
}

function Get-QuickerAgentBitifulPublishedSemVer {
    $url = Get-QuickerAgentBitifulVersionTxtUrl
    try {
        $text = (Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 15).Content.Trim()
    }
    catch {
        throw "Failed to read Bitiful version.txt ($url): $($_.Exception.Message)"
    }

    if ([string]::IsNullOrWhiteSpace($text)) {
        throw "Bitiful version.txt is empty: $url"
    }

    return $text
}

function Get-QuickerAgentBitifulSetupUrl {
    param([string]$Version)

    $semver = Get-QuickerRpcSemVerFromVersion -Version $Version
    $fileName = Get-QuickerAgentSetupName -Version $semver
    return "$(Get-QuickerAgentBitifulDownloadPrefix)/$fileName"
}

function Get-QuickerAgentActionDocSharedId {
    return 'aa5917ad-1256-4c73-7022-08debe3efcbe'
}

function Resolve-QuickerAgentRepoRoot {
    param([string]$QuickerRpcRepoRoot = '')

    if ($env:QUICKER_AGENT_REPO) {
        $candidate = $env:QUICKER_AGENT_REPO.Trim()
        if (Test-Path -LiteralPath (Join-Path $candidate 'actions\README.md')) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }

    if ($QuickerRpcRepoRoot) {
        $sibling = Join-Path (Split-Path -Parent $QuickerRpcRepoRoot) 'quicker-agent'
        if (Test-Path -LiteralPath (Join-Path $sibling 'actions\README.md')) {
            return (Resolve-Path -LiteralPath $sibling).Path
        }
    }

    throw @'
quicker-agent repo not found. Set QUICKER_AGENT_REPO to the repo root (contains actions/README.md),
or clone quicker-agent as a sibling of quicker-rpc (../quicker-agent).
'@
}

function Get-QuickerAgentSetupName {
    param([string]$Version)

    $semver = Get-QuickerRpcSemVerFromVersion -Version $Version
    return "quicker-agent-$semver-x64-setup.exe"
}

function Get-QuickerAgentMinInstallerBytes {
    return 50MB
}

function Test-QuickerAgentInstallerFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return $false
    }

    return (Get-Item -LiteralPath $Path).Length -ge (Get-QuickerAgentMinInstallerBytes)
}

function Assert-QuickerAgentInstallerFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Installer not found: $Path"
    }

    $item = Get-Item -LiteralPath $Path
    $minBytes = Get-QuickerAgentMinInstallerBytes
    if ($item.Length -lt $minBytes) {
        $sizeMb = [math]::Round($item.Length / 1MB, 2)
        $minMb = [math]::Round($minBytes / 1MB, 0)
        throw "Installer too small ($sizeMb MB < $minMb MB): $Path"
    }
}

function Get-QkrpcLatestAgentSetupName {
    return 'quicker-agent-win-x64-setup.exe'
}

function Get-QkrpcLatestAgentSetupDownloadUrl {
    return 'https://github.com/QuickerHub/quicker-rpc/releases/latest/download/quicker-agent-win-x64-setup.exe'
}

function Get-QkrpcPinnedAgentSetupDownloadUrl {
    param([Parameter(Mandatory = $true)][string]$Tag)

    $normalizedTag = $Tag.Trim()
    if (-not $normalizedTag.StartsWith('v')) {
        $normalizedTag = "v$normalizedTag"
    }

    return "https://github.com/QuickerHub/quicker-rpc/releases/download/$normalizedTag/quicker-agent-win-x64-setup.exe"
}

function Get-QuickerAgentPinnedSetupDownloadUrl {
    param(
        [Parameter(Mandatory = $true)][string]$Tag,
        [Parameter(Mandatory = $true)][string]$Version
    )

    $normalizedTag = $Tag.Trim()
    if (-not $normalizedTag.StartsWith('v')) {
        $normalizedTag = "v$normalizedTag"
    }

    $setupName = Get-QuickerAgentSetupName -Version $Version
    return "https://github.com/QuickerHub/quicker-rpc/releases/download/$normalizedTag/$setupName"
}

function Download-QuickerAgentInstallerFromRelease {
    param(
        [Parameter(Mandatory = $true)][string]$Tag,
        [Parameter(Mandatory = $true)][string]$Version,
        [Parameter(Mandatory = $true)][string]$DestinationPath
    )

    $url = Get-QuickerAgentPinnedSetupDownloadUrl -Tag $Tag -Version $Version
    $destDir = Split-Path -Parent $DestinationPath
    if (-not (Test-Path -LiteralPath $destDir)) {
        New-Item -ItemType Directory -Path $destDir -Force | Out-Null
    }

    Write-Host "Downloading from $url ..." -ForegroundColor Cyan

    if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
        & curl.exe --fail --location --retry 3 --retry-delay 2 --output $DestinationPath $url
        if ($LASTEXITCODE -ne 0) {
            throw "curl download failed ($LASTEXITCODE): $url"
        }
    }
    else {
        Invoke-WebRequest -Uri $url -OutFile $DestinationPath -UseBasicParsing
    }

    Assert-QuickerAgentInstallerFile -Path $DestinationPath
    return (Resolve-Path -LiteralPath $DestinationPath).Path
}

function Get-QkrpcLatestSetupDownloadUrl {
    return 'https://github.com/QuickerHub/quicker-rpc/releases/latest/download/qkrpc-win-x64-setup.exe'
}

function Get-QkrpcPinnedSetupDownloadUrl {
    param([Parameter(Mandatory = $true)][string]$Tag)

    $normalizedTag = $Tag.Trim()
    if (-not $normalizedTag.StartsWith('v')) {
        $normalizedTag = "v$normalizedTag"
    }

    return "https://github.com/QuickerHub/quicker-rpc/releases/download/$normalizedTag/qkrpc-win-x64-setup.exe"
}

function Get-QuickerRpcSemVerFromVersion {
    param([string]$Version)

    if ([string]::IsNullOrWhiteSpace($Version)) {
        throw 'Version is required.'
    }

    $parts = $Version.Trim().TrimStart('v') -split '\.'
    if ($parts.Count -lt 3) {
        throw "Version must have at least three segments (major.minor.patch): $Version"
    }

    return ($parts[0..2] -join '.')
}

function Get-QuickerRpcCliZipName {
    param([string]$Version)

    $semver = Get-QuickerRpcSemVerFromVersion -Version $Version
    return "qkrpc-$semver-win-x64.zip"
}

function Add-QuickerRpcUserPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$DirectoryPath
    )

    $resolved = (Resolve-Path -LiteralPath $DirectoryPath -ErrorAction Stop).Path
    $currentPath = [Environment]::GetEnvironmentVariable('PATH', 'User')

    if ($currentPath -split ';' | Where-Object { $_ -eq $resolved }) {
        Write-Host "Already on user PATH: $resolved" -ForegroundColor Green
        return $false
    }

    $newPath = if ($currentPath) { "$currentPath;$resolved" } else { $resolved }
    [Environment]::SetEnvironmentVariable('PATH', $newPath, 'User')
    Write-Host "Added to user PATH: $resolved" -ForegroundColor Green
    Write-Host 'Open a new terminal (or restart the shell) before running qkrpc.' -ForegroundColor Yellow
    return $true
}

function Get-QkrpcChangelogFilePath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot,

        [Parameter(Mandatory = $true)]
        [string]$Tag
    )

    $normalizedTag = $Tag.Trim()
    if (-not $normalizedTag.StartsWith('v')) {
        $normalizedTag = "v$normalizedTag"
    }

    return Join-Path $RepoRoot "publish\changelogs\$normalizedTag.md"
}

function Resolve-QkrpcChangelogContent {
    param(
        [string]$Changelog = '',
        [string]$ChangelogFile = '',
        [string]$RepoRoot = '',
        [string]$Tag = ''
    )

    if (-not [string]::IsNullOrWhiteSpace($ChangelogFile)) {
        if (-not (Test-Path -LiteralPath $ChangelogFile)) {
            throw "Changelog file not found: $ChangelogFile"
        }

        return (Get-Content -Raw -LiteralPath $ChangelogFile).Trim()
    }

    if (-not [string]::IsNullOrWhiteSpace($Changelog)) {
        return $Changelog.Trim()
    }

    if (-not [string]::IsNullOrWhiteSpace($RepoRoot) -and -not [string]::IsNullOrWhiteSpace($Tag)) {
        $defaultPath = Get-QkrpcChangelogFilePath -RepoRoot $RepoRoot -Tag $Tag
        if (Test-Path -LiteralPath $defaultPath) {
            return (Get-Content -Raw -LiteralPath $defaultPath).Trim()
        }
    }

    return ''
}

function New-QkrpcReleaseNotesBody {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Tag,

        [Parameter(Mandatory = $true)]
        [string]$VersionFull,

        [string]$Changelog = ''
    )

    $setupLatest = Get-QkrpcLatestSetupDownloadUrl
    $setupPinned = Get-QkrpcPinnedSetupDownloadUrl -Tag $Tag
    $setupAsset = Get-QkrpcLatestCliSetupName
    $agentLatest = Get-QkrpcLatestAgentSetupDownloadUrl
    $agentPinned = Get-QkrpcPinnedAgentSetupDownloadUrl -Tag $Tag
    $agentAsset = Get-QkrpcLatestAgentSetupName

    $sections = @()
    if (-not [string]::IsNullOrWhiteSpace($Changelog)) {
        $sections += $Changelog.Trim()
    }
    else {
        $sections += @(
            "## qkrpc $Tag",
            '',
            "CLI client for [quicker-rpc](https://github.com/QuickerHub/quicker-rpc) (version.json: ``$VersionFull``)."
        )
    }

    $sections += @(
        '',
        '---',
        '',
        '### Install qkrpc CLI',
        '',
        "1. Download [**$setupAsset**]($setupLatest) from GitHub Releases (or pinned: $setupPinned).",
        '2. Run the installer (adds `%LOCALAPPDATA%\Programs\qkrpc` to user PATH).',
        '3. Open a **new** terminal.',
        '',
        'Silent install (optional):',
        '',
        '```powershell',
        "Invoke-WebRequest -Uri '$setupLatest' -OutFile `"`$env:TEMP\qkrpc-setup.exe`" -UseBasicParsing",
        'Start-Process -FilePath "$env:TEMP\qkrpc-setup.exe" -ArgumentList "/VERYSILENT" -Wait',
        '```',
        '',
        '### Install QuickerAgent (desktop UI)',
        '',
        "Download [**$agentAsset**]($agentLatest) (or pinned: $agentPinned). Bundles Next.js UI, portable Node, and qkrpc; still requires Quicker + plugin and `llm-config.json`.",
        '',
        '### Verify',
        '',
        '```powershell',
        'qkrpc ping --json',
        '```',
        '',
        'Quicker plugin package is published separately via Quicker dependency **quicker.rpc**.'
    )

    return ($sections -join [Environment]::NewLine)
}

function Get-GitTagIdentityArgs {
    param([string]$RepoRoot)

    $name = (git -C $RepoRoot log -1 --format='%an' 2>$null).Trim()
    $email = (git -C $RepoRoot log -1 --format='%ae' 2>$null).Trim()
    if ([string]::IsNullOrWhiteSpace($name) -or [string]::IsNullOrWhiteSpace($email)) {
        return @()
    }
    return @('-c', "user.name=$name", '-c', "user.email=$email")
}

function Invoke-GitTag {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$GitArgs
    )

    git @GitArgs
    if ($LASTEXITCODE -ne 0) {
        throw "git $($GitArgs -join ' ') failed with exit code $LASTEXITCODE"
    }
}

function Get-QuickerAgentPreflightScriptPath {
    param([string]$PublishDir)
    $path = Join-Path $PublishDir 'Publish-QuickerAgent.ps1'
    if (-not (Test-Path -LiteralPath $path)) {
        throw "Publish-QuickerAgent.ps1 not found: $path"
    }
    return $path
}

function Get-QuickerAgentPreflightLogPath {
    param([string]$TagName)
    $safe = ($TagName -replace '[^\w\.\-]', '_')
    return Join-Path $env:TEMP "qkrpc-preflight-$safe.log"
}

# Start local Tauri preflight in parallel with tag push / GitHub Actions (non-blocking).
function Start-QuickerAgentPreflightBackground {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot,

        [Parameter(Mandatory = $true)]
        [string]$PublishDir,

        [Parameter(Mandatory = $true)]
        [string]$TagName
    )

    $scriptPath = Get-QuickerAgentPreflightScriptPath -PublishDir $PublishDir
    $logFile = Get-QuickerAgentPreflightLogPath -TagName $TagName
    $errFile = "$logFile.err"

    foreach ($f in @($logFile, $errFile)) {
        if (Test-Path -LiteralPath $f) {
            Remove-Item -LiteralPath $f -Force
        }
    }

    $pwsh = (Get-Command pwsh -ErrorAction Stop).Source
    $args = @(
        '-NoProfile',
        '-File', $scriptPath,
        '-RepoRoot', $RepoRoot,
        '-SkipQkrpcBuild',
        '-PreflightOnly'
    )

    $proc = Start-Process -FilePath $pwsh `
        -ArgumentList $args `
        -WorkingDirectory $RepoRoot `
        -PassThru `
        -NoNewWindow `
        -RedirectStandardOutput $logFile `
        -RedirectStandardError $errFile

    return [PSCustomObject]@{
        Process = $proc
        LogFile = $logFile
        ErrFile = $errFile
        TagName = $TagName
    }
}

function Invoke-QuickerAgentPreflightBlocking {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot,

        [Parameter(Mandatory = $true)]
        [string]$PublishDir
    )

    $scriptPath = Get-QuickerAgentPreflightScriptPath -PublishDir $PublishDir
    & pwsh -NoProfile -File $scriptPath -RepoRoot $RepoRoot -SkipQkrpcBuild -PreflightOnly
    if ($LASTEXITCODE -ne 0) {
        throw @"
QuickerAgent preflight failed. Fix the build locally, then re-run publish.
  pwsh ./publish/Test-QuickerAgentReleaseBuild.ps1
"@
    }
}

# Report local preflight status after tag/CI. Does not fail CI-only workflows.
function Complete-QuickerAgentPreflightBackground {
    param(
        $Preflight,
        [switch]$Wait,
        [string]$TagName = ''
    )

    if (-not $Preflight) {
        return $true
    }

    $tag = if ($TagName) { $TagName } else { $Preflight.TagName }
    $retagTip = "pwsh ./publish/Publish-GitHubRelease.ps1 -ForceRetag -WaitForCi"

    if ($Wait -and -not $Preflight.Process.HasExited) {
        Write-Host ''
        Write-Host "Waiting for local preflight (PID $($Preflight.Process.Id))..." -ForegroundColor Cyan
        $Preflight.Process.WaitForExit()
    }

    if (-not $Preflight.Process.HasExited) {
        Write-Host ''
        Write-Host "Local preflight still running (PID $($Preflight.Process.Id))." -ForegroundColor Cyan
        Write-Host "  stdout: $($Preflight.LogFile)" -ForegroundColor DarkGray
        Write-Host "  stderr: $($Preflight.ErrFile)" -ForegroundColor DarkGray
        Write-Host "Prefer fixing from the local log; CI failures are often redundant." -ForegroundColor DarkGray
        Write-Host "When fixed: $retagTip" -ForegroundColor DarkGray
        return $null
    }

    $exitCode = $Preflight.Process.ExitCode
    Write-Host ''
    if ($exitCode -eq 0) {
        Write-Host 'Local preflight passed (Tauri build).' -ForegroundColor Green
        return $true
    }

    Write-Host "Local preflight failed (exit $exitCode)." -ForegroundColor Yellow
    Write-Host "  stdout: $($Preflight.LogFile)" -ForegroundColor DarkGray
    Write-Host "  stderr: $($Preflight.ErrFile)" -ForegroundColor DarkGray
    Write-Host "Fix locally, then re-release: $retagTip" -ForegroundColor Yellow
    return $false
}

# Next/Tauri webpack must not scan the real user profile (EPERM on Windows special folders).
function Set-QuickerAgentIsolatedUserProfile {
    if (-not [string]::IsNullOrWhiteSpace($env:RUNNER_TEMP)) {
        $env:USERPROFILE = $env:RUNNER_TEMP
        $env:HOME = $env:RUNNER_TEMP
        return
    }
    if ($IsWindows -and -not [string]::IsNullOrWhiteSpace($env:TEMP)) {
        $env:USERPROFILE = $env:TEMP
        $env:HOME = $env:TEMP
    }
}

function Remove-QuickerRpcUserPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$DirectoryPath
    )

    $target = $DirectoryPath.TrimEnd('\')
    $currentPath = [Environment]::GetEnvironmentVariable('PATH', 'User')
    if ([string]::IsNullOrWhiteSpace($currentPath)) {
        return $false
    }

    $segments = @($currentPath -split ';' | Where-Object { $_ -and $_.TrimEnd('\') -ne $target })
    $newPath = ($segments -join ';').Trim(';')
    [Environment]::SetEnvironmentVariable('PATH', $newPath, 'User')
    Write-Host "Removed from user PATH: $target" -ForegroundColor Green
    return $true
}
