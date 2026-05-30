# Shared helpers for qkrpc publish/install scripts.

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
