# Shared helpers for qkrpc publish/install scripts.

function Get-QkrpcDefaultInstallDir {
    return Join-Path $env:LOCALAPPDATA 'Programs\qkrpc'
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

function Get-QuickerAgentSetupName {
    param([string]$Version)

    $semver = Get-QuickerRpcSemVerFromVersion -Version $Version
    return "QuickerAgent_${semver}_x64-setup.exe"
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
