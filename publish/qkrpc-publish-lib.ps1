# Shared helpers for qkrpc publish/install scripts.

function Get-QkrpcDefaultInstallDir {
    return Join-Path $env:LOCALAPPDATA 'Programs\qkrpc'
}

function Stop-QkrpcProcesses {
    param(
        [switch] $ServeOnly,
        [int] $GraceMs = 500
    )

    $stopped = [System.Collections.Generic.List[int]]::new()
    $procs = Get-CimInstance Win32_Process -Filter "Name = 'qkrpc.exe'" -ErrorAction SilentlyContinue
    foreach ($proc in $procs) {
        if ($ServeOnly) {
            $cmd = $proc.CommandLine
            if ([string]::IsNullOrWhiteSpace($cmd) -or $cmd -notmatch '\bserve\b') {
                continue
            }
        }

        $procId = $proc.ProcessId
        try {
            & taskkill.exe /PID $procId /T /F 2>$null | Out-Null
            if ($LASTEXITCODE -eq 0) {
                $stopped.Add($procId) | Out-Null
                continue
            }
        }
        catch {
            # fall through to Stop-Process
        }

        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        $stopped.Add($procId) | Out-Null
    }

    if ($stopped.Count -gt 0) {
        Write-Host "Stopped qkrpc (PID(s): $($stopped -join ', '))" -ForegroundColor DarkYellow
        Start-Sleep -Milliseconds $GraceMs
    }

    return $stopped.Count
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

    # Release install may overlap MCP / CLI; stop all qkrpc so DLLs unlock (serve was stopped earlier in build.ps1).
    $stopped = Stop-QkrpcProcesses -GraceMs 1500
    if ($stopped -gt 0) {
        Write-Host "Stopped $stopped qkrpc process(es) before user install." -ForegroundColor DarkYellow
    }

    if (-not (Test-Path -LiteralPath $InstallDir)) {
        New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    }

    # In-place overlay — never Remove-Item -Recurse the install dir (clrjit.dll stays locked while any qkrpc runs).
    try {
        Copy-Item -Path (Join-Path $sourcePath '*') -Destination $InstallDir -Recurse -Force -ErrorAction Stop
    }
    catch {
        Write-Warning "User install overlay failed: $($_.Exception.Message)"
        Write-Host "  CLI is still available at: $sourcePath\qkrpc.exe" -ForegroundColor DarkGray
        Write-Host "  Close Cursor MCP / other qkrpc.exe using $InstallDir, then re-run install or build." -ForegroundColor DarkGray
        return $InstallDir
    }

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

function Import-PublishSecretsFromFiles {
    param([string]$PublishDir = '')

    Import-BitifulEnvFromFiles -PublishDir $PublishDir
}

function Test-BitifulConfigured {
    return -not [string]::IsNullOrWhiteSpace($env:BITIFUL_ACCESS_KEY) -and
        -not [string]::IsNullOrWhiteSpace($env:BITIFUL_SECRET_KEY) -and
        -not [string]::IsNullOrWhiteSpace($env:BITIFUL_BUCKET_NAME)
}

function Read-QuickerAgentLatestJsonVersion {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "latest.json not found: $Path"
    }

    $json = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
    $version = [string]$json.version
    if ([string]::IsNullOrWhiteSpace($version)) {
        throw "latest.json missing version field: $Path"
    }

    return $version.Trim()
}

function Test-QuickerAgentLatestJsonFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [Parameter(Mandatory = $true)]
        [string]$ExpectedSemVer
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return $false
    }

    try {
        $version = Read-QuickerAgentLatestJsonVersion -Path $Path
        return $version -eq $ExpectedSemVer.Trim()
    }
    catch {
        return $false
    }
}

function Assert-QuickerAgentLatestJsonFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [Parameter(Mandatory = $true)]
        [string]$ExpectedSemVer
    )

    $version = Read-QuickerAgentLatestJsonVersion -Path $Path
    $expected = $ExpectedSemVer.Trim()
    if ($version -ne $expected) {
        throw "latest.json version mismatch: file has '$version', expected '$expected' ($Path)"
    }
}

function Get-QuickerAgentPinnedLatestJsonDownloadUrl {
    param([Parameter(Mandatory = $true)][string]$Tag)

    $normalizedTag = $Tag.Trim()
    if (-not $normalizedTag.StartsWith('v')) {
        $normalizedTag = "v$normalizedTag"
    }

    return "https://github.com/QuickerHub/quicker-rpc/releases/download/$normalizedTag/latest.json"
}

function Download-QuickerAgentLatestJsonFromRelease {
    param(
        [Parameter(Mandatory = $true)][string]$Tag,
        [Parameter(Mandatory = $true)][string]$ExpectedSemVer,
        [Parameter(Mandatory = $true)][string]$DestinationPath
    )

    $url = Get-QuickerAgentPinnedLatestJsonDownloadUrl -Tag $Tag
    $destDir = Split-Path -Parent $DestinationPath
    if (-not (Test-Path -LiteralPath $destDir)) {
        New-Item -ItemType Directory -Path $destDir -Force | Out-Null
    }

    Write-Host "Downloading latest.json from $url ..." -ForegroundColor Cyan

    if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
        & curl.exe --fail --location --retry 3 --retry-delay 2 --output $DestinationPath $url
        if ($LASTEXITCODE -ne 0) {
            throw "curl download failed ($LASTEXITCODE): $url"
        }
    }
    else {
        Invoke-WebRequest -Uri $url -OutFile $DestinationPath -UseBasicParsing
    }

    Assert-QuickerAgentLatestJsonFile -Path $DestinationPath -ExpectedSemVer $ExpectedSemVer
    return (Resolve-Path -LiteralPath $DestinationPath).Path
}

function Resolve-QuickerAgentLatestJsonForUpload {
    param(
        [Parameter(Mandatory = $true)][string]$RepoRoot,
        [Parameter(Mandatory = $true)][string]$Tag,
        [Parameter(Mandatory = $true)][string]$ExpectedSemVer,
        [Parameter(Mandatory = $true)][string]$DownloadDir,
        [switch]$UseLocal
    )

    $localPath = Join-Path $RepoRoot 'publish\latest.json'
    $expected = $ExpectedSemVer.Trim()

    if ($UseLocal -and (Test-QuickerAgentLatestJsonFile -Path $localPath -ExpectedSemVer $expected)) {
        Write-Host "Using local latest.json (-UseLocal): $localPath" -ForegroundColor Cyan
        return (Resolve-Path -LiteralPath $localPath).Path
    }

    if (Test-QuickerAgentLatestJsonFile -Path $localPath -ExpectedSemVer $expected) {
        Write-Host "Using matching local latest.json: $localPath" -ForegroundColor Cyan
        return (Resolve-Path -LiteralPath $localPath).Path
    }

    if (Test-Path -LiteralPath $localPath) {
        try {
            $stale = Read-QuickerAgentLatestJsonVersion -Path $localPath
            Write-Warning "Ignoring stale publish/latest.json ($stale != $expected)"
        }
        catch {
            Write-Warning "Ignoring invalid publish/latest.json: $localPath"
        }
    }

    if (-not (Test-Path -LiteralPath $DownloadDir)) {
        New-Item -ItemType Directory -Path $DownloadDir -Force | Out-Null
    }

    $downloaded = Join-Path $DownloadDir 'latest.json'

    try {
        return Download-QuickerAgentLatestJsonFromRelease `
            -Tag $Tag `
            -ExpectedSemVer $expected `
            -DestinationPath $downloaded
    }
    catch {
        Write-Warning "Direct latest.json download failed: $($_.Exception.Message)"
    }

    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        throw @"
Failed to resolve latest.json for $Tag ($expected).
Install GitHub CLI (gh) or run Publish-QuickerAgent.ps1 locally, then retry with -UseLocal.
"@
    }

    Write-Host 'Retrying latest.json via gh release download...' -ForegroundColor Cyan
    gh release download $Tag --repo 'QuickerHub/quicker-rpc' --pattern 'latest.json' -D $DownloadDir
    if ($LASTEXITCODE -ne 0) {
        throw "gh release download failed ($LASTEXITCODE) for latest.json on $Tag"
    }

    if (-not (Test-Path -LiteralPath $downloaded)) {
        throw "Downloaded latest.json missing: $downloaded"
    }

    Assert-QuickerAgentLatestJsonFile -Path $downloaded -ExpectedSemVer $expected
    return (Resolve-Path -LiteralPath $downloaded).Path
}

function Invoke-QuickerAgentBitifulUpload {
    param(
        [Parameter(Mandatory = $true)]
        [string]$InstallerPath,

        [Parameter(Mandatory = $true)]
        [string]$LatestYmlPath,

        [Parameter(Mandatory = $true)]
        [string]$ExpectedSemVer,

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

    if (-not (Test-Path -LiteralPath $LatestYmlPath)) {
        throw "latest.yml not found for Bitiful upload: $LatestYmlPath"
    }

    Assert-QuickerAgentLatestYmlFile -Path $LatestYmlPath -ExpectedSemVer $ExpectedSemVer

    if ($LatestYmlPath) {
        $latestResolved = (Resolve-Path -LiteralPath $LatestYmlPath -ErrorAction Stop).Path
        $uploadArgs = @(
            $latestResolved,
            '--asset',
            '--endpoint-url', $endpointUrl,
            '--object-prefix', $objectPrefix
        )
        if (Get-Command uv -ErrorAction SilentlyContinue) {
            & uv run --with boto3 python $uploadScript @uploadArgs
        }
        else {
            & python $uploadScript @uploadArgs
        }
        if ($LASTEXITCODE -ne 0) {
            throw "Bitiful latest.json upload failed with exit code $LASTEXITCODE"
        }
    }
}

function Get-QuickerAgentBitifulDownloadPrefix {
    return 'https://s3.bitiful.net/quicker-pkgs/quicker-rpc/quicker-agent'
}

function Get-VoiceAsrBitifulDownloadPrefix {
    return 'https://s3.bitiful.net/quicker-pkgs/quicker-rpc/voice-asr'
}

function Get-VoiceAsrBitifulVersionTxtUrl {
    return "$(Get-VoiceAsrBitifulDownloadPrefix)/version.txt"
}

function Get-VoiceAsrBitifulAssetUrl {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FileName
    )

    $name = $FileName.Trim().Trim('/')
    if ([string]::IsNullOrWhiteSpace($name)) {
        throw 'FileName is required.'
    }

    return "$(Get-VoiceAsrBitifulDownloadPrefix)/$name"
}

function Get-VoiceAsrModelReleaseTag {
    return 'model-sensevoice'
}

function Get-VoiceAsrRuntimeZipName {
    param([string]$Version = '0.1.0')
    return "voice-asr-runtime-$Version-win-x64.zip"
}

function Get-VoiceAsrModelZipName {
    return 'voice-asr-model-sensevoice.zip'
}

function Invoke-VoiceAsrBitifulUpload {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RuntimeZipPath,

        [Parameter(Mandatory = $true)]
        [string]$Version,

        [string]$ModelZipPath = '',

        [switch]$PublishModel,

        [string]$PublishDir = ''
    )

    if (-not $PublishDir) {
        $PublishDir = $PSScriptRoot
    }

    if (-not (Test-Path -LiteralPath $RuntimeZipPath)) {
        throw "Runtime asset not found: $RuntimeZipPath"
    }

    if ($PublishModel) {
        if ([string]::IsNullOrWhiteSpace($ModelZipPath) -or -not (Test-Path -LiteralPath $ModelZipPath)) {
            throw "Model asset not found: $ModelZipPath (required with -PublishModel)"
        }
    }

    if (-not (Test-BitifulConfigured)) {
        throw 'Bitiful credentials not configured (BITIFUL_ACCESS_KEY, BITIFUL_SECRET_KEY, BITIFUL_BUCKET_NAME).'
    }

    $uploadScript = Join-Path $PublishDir 'bitiful_upload.py'
    if (-not (Test-Path -LiteralPath $uploadScript)) {
        throw "bitiful_upload.py not found: $uploadScript"
    }

    $endpointUrl = if ([string]::IsNullOrWhiteSpace($env:BITIFUL_ENDPOINT_URL)) {
        'https://s3.bitiful.net'
    }
    else {
        $env:BITIFUL_ENDPOINT_URL.Trim()
    }

    $objectPrefix = if ([string]::IsNullOrWhiteSpace($env:BITIFUL_VOICE_ASR_OBJECT_PREFIX)) {
        'quicker-rpc/voice-asr'
    }
    else {
        $env:BITIFUL_VOICE_ASR_OBJECT_PREFIX.Trim()
    }

    function Invoke-BitifulAssetUpload {
        param([string]$AssetPath)

        $resolved = (Resolve-Path -LiteralPath $AssetPath -ErrorAction Stop).Path
        $commonArgs = @(
            $uploadScript, $resolved,
            '--asset',
            '--endpoint-url', $endpointUrl,
            '--object-prefix', $objectPrefix
        )

        if (Get-Command uv -ErrorAction SilentlyContinue) {
            & uv run --no-sync --with boto3 python @commonArgs
        }
        elseif (Get-Command python -ErrorAction SilentlyContinue) {
            & python -m pip install --disable-pip-version-check --quiet boto3
            if ($LASTEXITCODE -ne 0) {
                throw 'Failed to install boto3. Install uv or pip install boto3.'
            }
            & python @commonArgs
        }
        else {
            throw 'Neither uv nor python found. Install uv (recommended) or Python 3 with pip.'
        }

        if ($LASTEXITCODE -ne 0) {
            throw "Bitiful upload failed with exit code $LASTEXITCODE"
        }
    }

    Invoke-BitifulAssetUpload -AssetPath $RuntimeZipPath
    if ($PublishModel) {
        Invoke-BitifulAssetUpload -AssetPath $ModelZipPath
    }

    $versionArgs = @(
        $uploadScript, $RuntimeZipPath,
        '--write-version-only',
        '--endpoint-url', $endpointUrl,
        '--object-prefix', $objectPrefix,
        '--version', $Version.Trim()
    )
    if (Get-Command uv -ErrorAction SilentlyContinue) {
        & uv run --no-sync --with boto3 python @versionArgs | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Bitiful version.txt upload failed ($LASTEXITCODE)" }
    }
    else {
        & python @versionArgs | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Bitiful version.txt upload failed ($LASTEXITCODE)" }
    }
}

function Get-QuickerAgentBitifulLlmPublishConfigUrl {
    return "$(Get-QuickerAgentBitifulDownloadPrefix)/llm-publish.config.json"
}

function Resolve-LlmPublishConfigUploadPath {
    param(
        [string]$RepoRoot = '',
        [string]$ConfigPath = ''
    )

    if ($ConfigPath -and (Test-Path -LiteralPath $ConfigPath)) {
        return (Resolve-Path -LiteralPath $ConfigPath -ErrorAction Stop).Path
    }

    if (-not $RepoRoot) {
        $RepoRoot = Split-Path -Parent $PSScriptRoot
    }

    $localPath = Join-Path $RepoRoot 'agent-gui/llm-publish.config.json'
    if (Test-Path -LiteralPath $localPath) {
        return (Resolve-Path -LiteralPath $localPath -ErrorAction Stop).Path
    }

    return $null
}

function Write-BundledLlmConfigToPublishFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$OutputPath
    )

    $inline = $env:BUNDLED_LLM_CONFIG
    if ([string]::IsNullOrWhiteSpace($inline)) {
        return $false
    }

    try {
        $config = $inline.Trim() | ConvertFrom-Json
    }
    catch {
        throw "BUNDLED_LLM_CONFIG is not valid JSON: $($_.Exception.Message)"
    }

    $endpoints = @($config.endpoints)
    if ($endpoints.Count -eq 0) {
        throw 'BUNDLED_LLM_CONFIG must contain at least one endpoint.'
    }

    $valid = 0
    foreach ($entry in $endpoints) {
        $apiKey = [string]$entry.apiKey
        if (-not [string]::IsNullOrWhiteSpace($apiKey)) {
            $valid++
        }
    }

    if ($valid -eq 0) {
        throw 'BUNDLED_LLM_CONFIG has endpoints but none include a non-empty apiKey.'
    }

    $json = $config | ConvertTo-Json -Depth 32
    $dir = Split-Path -Parent $OutputPath
    if ($dir -and -not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }

    Set-Content -LiteralPath $OutputPath -Value $json -Encoding utf8NoBOM
    return $true
}

function New-EncryptedLlmPublishConfigUploadPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$PlainConfigPath,

        [string]$RepoRoot = ''
    )

    if (-not $RepoRoot) {
        $RepoRoot = Split-Path -Parent $PSScriptRoot
    }

    $encryptScript = Join-Path $RepoRoot 'agent-gui/scripts/encrypt-remote-publish-config.mjs'
    if (-not (Test-Path -LiteralPath $encryptScript)) {
        throw "encrypt-remote-publish-config.mjs not found: $encryptScript"
    }

    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        throw 'node not found (required to encrypt llm-publish.config.json for Bitiful upload).'
    }

    $tempDir = Join-Path $env:TEMP "qkrpc-llm-publish-enc-$([Guid]::NewGuid().ToString('N'))"
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
    $encryptedPath = Join-Path $tempDir 'llm-publish.config.json'

    if ([string]::IsNullOrWhiteSpace($env:LLM_REMOTE_PUBLISH_CIPHER_PEPPER)) {
        throw 'LLM_REMOTE_PUBLISH_CIPHER_PEPPER is not set. Add it to publish/.env or sync GitHub publish environment secret.'
    }

    & node $encryptScript $PlainConfigPath $encryptedPath
    if ($LASTEXITCODE -ne 0) {
        Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue
        throw "encrypt-remote-publish-config.mjs failed with exit code $LASTEXITCODE"
    }

    return @{
        Path    = $encryptedPath
        TempDir = $tempDir
    }
}

function Invoke-LlmPublishConfigBitifulUpload {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ConfigPath,

        [string]$PublishDir = '',
        [string]$RepoRoot = ''
    )

    if (-not $PublishDir) {
        $PublishDir = $PSScriptRoot
    }

    if (-not $RepoRoot) {
        $RepoRoot = Split-Path -Parent $PublishDir
    }

    if (-not (Test-Path -LiteralPath $ConfigPath)) {
        throw "llm publish config not found: $ConfigPath"
    }

    if (-not (Test-BitifulConfigured)) {
        throw 'Bitiful credentials not configured (BITIFUL_ACCESS_KEY, BITIFUL_SECRET_KEY, BITIFUL_BUCKET_NAME).'
    }

    $uploadScript = Join-Path $PublishDir 'bitiful_upload.py'
    if (-not (Test-Path -LiteralPath $uploadScript)) {
        throw "bitiful_upload.py not found: $uploadScript"
    }

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

    $resolved = (Resolve-Path -LiteralPath $ConfigPath -ErrorAction Stop).Path
    $encrypted = New-EncryptedLlmPublishConfigUploadPath -PlainConfigPath $resolved -RepoRoot $RepoRoot

    try {
        $commonArgs = @(
            $uploadScript, $encrypted.Path,
            '--asset',
            '--endpoint-url', $endpointUrl,
            '--object-prefix', $objectPrefix
        )

        if (Get-Command uv -ErrorAction SilentlyContinue) {
            & uv run --no-sync --with boto3 python @commonArgs
        }
        elseif (Get-Command python -ErrorAction SilentlyContinue) {
            & python -m pip install --disable-pip-version-check --quiet boto3
            if ($LASTEXITCODE -ne 0) {
                throw 'Failed to install boto3. Install uv (recommended) or pip install boto3.'
            }
            & python @commonArgs
        }
        else {
            throw 'Neither uv nor python found. Install uv (recommended) or Python 3 with pip.'
        }

        if ($LASTEXITCODE -ne 0) {
            throw "Bitiful llm-publish.config.json upload failed with exit code $LASTEXITCODE"
        }
    }
    finally {
        if ($encrypted.TempDir) {
            Remove-Item -LiteralPath $encrypted.TempDir -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    Write-Host "Uploaded encrypted llm-publish.config.json -> $(Get-QuickerAgentBitifulLlmPublishConfigUrl)" -ForegroundColor Green
}

function Invoke-LlmPublishConfigBitifulUploadAuto {
    param(
        [string]$RepoRoot = '',
        [string]$ConfigPath = '',
        [string]$PublishDir = '',
        [switch]$Required
    )

    if (-not $PublishDir) {
        $PublishDir = $PSScriptRoot
    }

    Import-PublishSecretsFromFiles -PublishDir $PublishDir

    if (-not (Test-BitifulConfigured)) {
        if ($Required) {
            throw 'Bitiful credentials not configured (BITIFUL_ACCESS_KEY, BITIFUL_SECRET_KEY, BITIFUL_BUCKET_NAME).'
        }

        Write-Warning 'Bitiful credentials not configured; skipped llm-publish.config.json upload.'
        return $false
    }

    if ([string]::IsNullOrWhiteSpace($env:LLM_REMOTE_PUBLISH_CIPHER_PEPPER)) {
        if ($Required) {
            throw 'LLM_REMOTE_PUBLISH_CIPHER_PEPPER is not set (publish/.env or GitHub publish environment).'
        }

        Write-Warning 'LLM_REMOTE_PUBLISH_CIPHER_PEPPER not configured; skipped encrypted llm-publish.config.json upload.'
        return $false
    }

    $resolvedPath = Resolve-LlmPublishConfigUploadPath -RepoRoot $RepoRoot -ConfigPath $ConfigPath
    $tempDir = $null

    if (-not $resolvedPath) {
        $tempDir = Join-Path $env:TEMP "qkrpc-llm-publish-$([Guid]::NewGuid().ToString('N'))"
        New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
        $resolvedPath = Join-Path $tempDir 'llm-publish.config.json'
        if (-not (Write-BundledLlmConfigToPublishFile -OutputPath $resolvedPath)) {
            if ($tempDir) {
                Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue
            }

            if ($Required) {
                throw 'llm-publish.config.json not found and BUNDLED_LLM_CONFIG is empty.'
            }

            Write-Host 'No llm-publish.config.json or BUNDLED_LLM_CONFIG; skipped Bitiful publish config upload.' -ForegroundColor DarkGray
            return $false
        }
    }

    try {
        Invoke-LlmPublishConfigBitifulUpload -ConfigPath $resolvedPath -PublishDir $PublishDir
        return $true
    }
    finally {
        if ($tempDir) {
            Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
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

function Get-QuickerAgentBitifulLatestJsonUrl {
    return "$(Get-QuickerAgentBitifulDownloadPrefix)/latest.json"
}

function Get-QuickerAgentBitifulLatestYmlUrl {
    return "$(Get-QuickerAgentBitifulDownloadPrefix)/latest.yml"
}

function Get-QuickerAgentElectronBitifulDownloadPrefix {
    return Get-QuickerAgentBitifulDownloadPrefix
}

function Get-QuickerAgentElectronBitifulObjectPrefix {
    if (-not [string]::IsNullOrWhiteSpace($env:BITIFUL_OBJECT_PREFIX)) {
        return $env:BITIFUL_OBJECT_PREFIX.Trim().Trim('/')
    }

    return 'quicker-rpc/quicker-agent'
}

function Get-QuickerAgentElectronSetupName {
    param([string]$Version)

    return Get-QuickerAgentSetupName -Version $Version
}

function Get-QuickerAgentElectronBitifulSetupUrl {
    param([string]$Version)

    $fileName = Get-QuickerAgentElectronSetupName -Version $Version
    return "$(Get-QuickerAgentElectronBitifulDownloadPrefix)/$fileName"
}

function Get-QuickerAgentElectronBitifulLatestYmlUrl {
    return Get-QuickerAgentBitifulLatestYmlUrl
}

function Get-QuickerAgentElectronBitifulVersionTxtUrl {
    return "$(Get-QuickerAgentElectronBitifulDownloadPrefix)/version.txt"
}

function Assert-QuickerAgentLatestYmlFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,

        [Parameter(Mandatory = $true)]
        [string]$ExpectedSemVer
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "latest.yml not found: $Path"
    }

    $content = Get-Content -LiteralPath $Path -Raw
    if ($content -notmatch "(?m)^version:\s*$([regex]::Escape($ExpectedSemVer))\s*$") {
        throw "latest.yml version mismatch (expected $ExpectedSemVer): $Path"
    }

    if ($content -notmatch 'path:\s*quicker-agent-[\d.]+\-x64-setup\.exe') {
        throw "latest.yml missing path: quicker-agent-*-x64-setup.exe ($Path)"
    }

    if ($content -notmatch 'sha512:\s*\S+') {
        throw "latest.yml missing sha512 ($Path)"
    }
}

function Assert-QuickerAgentElectronLatestYmlFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,

        [Parameter(Mandatory = $true)]
        [string]$ExpectedSemVer
    )

    Assert-QuickerAgentLatestYmlFile -Path $Path -ExpectedSemVer $ExpectedSemVer
}

function Invoke-QuickerAgentElectronBitifulUpload {
    param(
        [Parameter(Mandatory = $true)]
        [string]$InstallerPath,

        [Parameter(Mandatory = $true)]
        [string]$LatestYmlPath,

        [Parameter(Mandatory = $true)]
        [string]$ExpectedSemVer,

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

    Assert-QuickerAgentLatestYmlFile -Path $LatestYmlPath -ExpectedSemVer $ExpectedSemVer

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

    $objectPrefix = Get-QuickerAgentElectronBitifulObjectPrefix

    $installerArgs = @(
        $uploadScript, $resolvedInstaller,
        '--endpoint-url', $endpointUrl,
        '--object-prefix', $objectPrefix
    )

    if (Get-Command uv -ErrorAction SilentlyContinue) {
        & uv run --with boto3 python @installerArgs
    }
    elseif (Get-Command python -ErrorAction SilentlyContinue) {
        & python -m pip install --disable-pip-version-check --quiet boto3
        if ($LASTEXITCODE -ne 0) {
            throw 'Failed to install boto3. Install uv or pip install boto3.'
        }

        & python @installerArgs
    }
    else {
        throw 'Neither uv nor python found. Install uv (recommended) or Python 3 with pip.'
    }

    if ($LASTEXITCODE -ne 0) {
        throw "Bitiful Electron installer upload failed with exit code $LASTEXITCODE"
    }

    $latestResolved = (Resolve-Path -LiteralPath $LatestYmlPath -ErrorAction Stop).Path
    $latestArgs = @(
        $latestResolved,
        '--asset',
        '--endpoint-url', $endpointUrl,
        '--object-prefix', $objectPrefix
    )

    if (Get-Command uv -ErrorAction SilentlyContinue) {
        & uv run --with boto3 python $uploadScript @latestArgs
    }
    else {
        & python $uploadScript @latestArgs
    }

    if ($LASTEXITCODE -ne 0) {
        throw "Bitiful latest.yml upload failed with exit code $LASTEXITCODE"
    }
}

function Import-TauriSigningPrivateKey {
    param([string]$PublishDir = '')

    if (-not [string]::IsNullOrWhiteSpace($env:TAURI_SIGNING_PRIVATE_KEY)) {
        return
    }

    if (-not $PublishDir) {
        $PublishDir = $PSScriptRoot
    }

    $keyPath = if (-not [string]::IsNullOrWhiteSpace($env:TAURI_SIGNING_PRIVATE_KEY_PATH)) {
        $env:TAURI_SIGNING_PRIVATE_KEY_PATH.Trim()
    }
    else {
        Join-Path $PublishDir '.tauri\quicker-agent.key'
    }

    if (-not (Test-Path -LiteralPath $keyPath)) {
        throw @"
Tauri updater signing key not found: $keyPath
Run: pnpm exec tauri signer generate -w publish/.tauri/quicker-agent.key -f --ci
Or set TAURI_SIGNING_PRIVATE_KEY / TAURI_SIGNING_PRIVATE_KEY_PATH in publish/.env
"@
    }

    $resolvedKeyPath = (Resolve-Path -LiteralPath $keyPath).Path
    $keyContent = (Get-Content -LiteralPath $resolvedKeyPath -Raw).Trim()
    if ([string]::IsNullOrWhiteSpace($keyContent)) {
        throw "Tauri updater signing key file is empty: $resolvedKeyPath"
    }

    $env:TAURI_SIGNING_PRIVATE_KEY = $keyContent
    $env:TAURI_SIGNING_PRIVATE_KEY_PATH = $resolvedKeyPath
    if ($null -eq $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD) {
        $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ''
    }
}

function Resolve-QuickerAgentUpdaterSigFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$SetupExePath
    )

    $sigPath = "$SetupExePath.sig"
    if (-not (Test-Path -LiteralPath $sigPath)) {
        throw "Updater signature not found: $sigPath (ensure createUpdaterArtifacts=true and TAURI_SIGNING_PRIVATE_KEY is set during tauri build)"
    }

    return (Resolve-Path -LiteralPath $sigPath).Path
}

function New-QuickerAgentUpdaterLatestJson {
    param(
        [Parameter(Mandatory = $true)]
        [string]$SemVer,
        [Parameter(Mandatory = $true)]
        [string]$SigFilePath,
        [Parameter(Mandatory = $true)]
        [string]$SetupUrl,
        [string]$Notes = ''
    )

    $signature = (Get-Content -LiteralPath $SigFilePath -Raw).Trim()
    if ([string]::IsNullOrWhiteSpace($signature)) {
        throw "Updater signature file is empty: $SigFilePath"
    }

    $releaseNotes = if ([string]::IsNullOrWhiteSpace($Notes)) {
        "QuickerAgent $SemVer"
    }
    else {
        $Notes.Trim()
    }

    $payload = [ordered]@{
        version  = $SemVer
        notes    = $releaseNotes
        pub_date = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss'Z'")
        platforms = [ordered]@{
            'windows-x86_64' = [ordered]@{
                signature = $signature
                url       = $SetupUrl
            }
        }
    }

    return ($payload | ConvertTo-Json -Depth 5)
}

function Write-QuickerAgentUpdaterLatestJson {
    param(
        [Parameter(Mandatory = $true)]
        [string]$SetupExePath,
        [Parameter(Mandatory = $true)]
        [string]$SemVer,
        [Parameter(Mandatory = $true)]
        [string]$DestinationPath,
        [string]$Notes = ''
    )

    $sigFile = Resolve-QuickerAgentUpdaterSigFile -SetupExePath $SetupExePath
    $setupUrl = Get-QuickerAgentBitifulSetupUrl -Version $SemVer
    $json = New-QuickerAgentUpdaterLatestJson -SemVer $SemVer -SigFilePath $sigFile -SetupUrl $setupUrl -Notes $Notes
    Set-Content -LiteralPath $DestinationPath -Value ($json + "`n") -Encoding utf8NoBOM
    return $DestinationPath
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

function ConvertTo-QuickerRpcFourPartVersion {
    param([string]$Version)

    if ([string]::IsNullOrWhiteSpace($Version)) {
        throw 'Version is required.'
    }

    $text = $Version.Trim().TrimStart('v')
    $parts = $text -split '\.'
    if ($parts.Count -lt 3) {
        throw "Version must have at least three segments (major.minor.patch): $Version"
    }

    while ($parts.Count -lt 4) {
        $parts += '0'
    }

    return [Version]::new(
        [int]$parts[0],
        [int]$parts[1],
        [int]$parts[2],
        [int]$parts[3]
    )
}

function Get-QuickerRpcVersionFromJsonFile {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        return $null
    }

    $data = Get-Content -Raw -Path $Path | ConvertFrom-Json
    $raw = [string]$data.QuickerRpc
    if ([string]::IsNullOrWhiteSpace($raw)) {
        return $null
    }

    return ConvertTo-QuickerRpcFourPartVersion -Version $raw
}

function Get-QuickerRpcVersionBaseline {
    param([Parameter(Mandatory = $true)][string]$RepoRoot)

    $baselines = [System.Collections.Generic.List[Version]]::new()
    Push-Location $RepoRoot
    try {
        $tags = @(git tag -l 'v*.*.*' 2>$null)
        foreach ($tag in $tags) {
            if ($tag -match '^v(\d+\.\d+\.\d+(?:\.\d+)?)$') {
                try {
                    $baselines.Add((ConvertTo-QuickerRpcFourPartVersion -Version $Matches[1])) | Out-Null
                }
                catch {
                    # ignore malformed tags
                }
            }
        }

        foreach ($ref in @('HEAD:version.json', 'HEAD~1:version.json', 'origin/main:version.json', 'origin/master:version.json')) {
            $raw = git show "${ref}" 2>$null
            if ([string]::IsNullOrWhiteSpace($raw)) {
                continue
            }

            try {
                $parsed = ([string](ConvertFrom-Json $raw).QuickerRpc)
                if (-not [string]::IsNullOrWhiteSpace($parsed)) {
                    $baselines.Add((ConvertTo-QuickerRpcFourPartVersion -Version $parsed)) | Out-Null
                }
            }
            catch {
                # ignore missing refs / invalid json
            }
        }
    }
    finally {
        Pop-Location
    }

    if ($baselines.Count -eq 0) {
        return $null
    }

    return ($baselines | Sort-Object -Descending | Select-Object -First 1)
}

function Assert-QuickerRpcVersionMonotonic {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot,

        [Parameter(Mandatory = $true)]
        [string]$CandidateVersion,

        [string]$Context = 'version.json QuickerRpc',

        # Same-version re-upload (build.ps1 -Publish -NoVersion) or -ForceRetag retry.
        [switch]$AllowEqual
    )

    $candidate = ConvertTo-QuickerRpcFourPartVersion -Version $CandidateVersion
    $baseline = Get-QuickerRpcVersionBaseline -RepoRoot $RepoRoot

    if ($null -eq $baseline) {
        Write-Host "Version baseline: (none) — first release or empty git history." -ForegroundColor DarkGray
        return
    }

    if ($candidate -lt $baseline) {
        throw @"
$Context must not decrease.
  Candidate: $candidate
  Baseline:  $baseline (max of git tags v*.*.* and version.json on HEAD / origin/main)
version.json may only move forward. See .cursor/skills/quicker-qkbuild-version-publish/SKILL.md
"@
    }

    if ($candidate -eq $baseline) {
        if ($AllowEqual) {
            Write-Host "Version check OK (equal allowed): $candidate == baseline $baseline" -ForegroundColor DarkGray
            return
        }

        throw @"
$Context must be strictly greater than the last released/committed version for a new publish.
  Candidate: $candidate
  Baseline:  $baseline
Bump version.json forward (official publish: third field +1, revision→0). Use -Publish -NoVersion only to re-upload the same version.
"@
    }

    Write-Host "Version check OK: $candidate > baseline $baseline" -ForegroundColor DarkGray
}

function Get-QuickerRpcVersionFromQkbuildArgs {
    param([string[]]$Tokens)

    if (-not $Tokens -or $Tokens.Count -eq 0) {
        return $null
    }

    for ($i = 0; $i -lt $Tokens.Count; $i++) {
        $token = [string]$Tokens[$i]
        if ($token -eq '--version' -and ($i + 1) -lt $Tokens.Count) {
            return [string]$Tokens[$i + 1]
        }
        if ($token -like '--version=*') {
            return $token.Substring('--version='.Length)
        }
    }

    return $null
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

# Fast release gate (<10s): launcher contracts + version notes. No compile.
function Invoke-QuickerAgentReleaseGateFast {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot,

        [string]$PublishDir = ''
    )

    if (-not $PublishDir) {
        $PublishDir = Join-Path $RepoRoot 'publish'
    }

    $fastScript = Join-Path $PublishDir 'Preflight-QuickerAgentFast.ps1'
    if (-not (Test-Path -LiteralPath $fastScript)) {
        throw "Preflight-QuickerAgentFast.ps1 not found: $fastScript"
    }

    & pwsh -NoProfile -File $fastScript -RepoRoot $RepoRoot
    if ($LASTEXITCODE -ne 0) {
        throw "Invoke-QuickerAgentReleaseGateFast failed ($LASTEXITCODE)"
    }
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
    $realProfile = [Environment]::GetFolderPath('UserProfile')
    if (-not [string]::IsNullOrWhiteSpace($env:RUNNER_TEMP)) {
        $env:USERPROFILE = $env:RUNNER_TEMP
        $env:HOME = $env:RUNNER_TEMP
    }
    elseif ($IsWindows -and -not [string]::IsNullOrWhiteSpace($env:TEMP)) {
        $env:USERPROFILE = $env:TEMP
        $env:HOME = $env:TEMP
    }
    else {
        return
    }

    # Rust/cargo must not use the isolated temp profile (corrupt registry under %TEMP%\.cargo).
    if (-not [string]::IsNullOrWhiteSpace($realProfile)) {
        $env:CARGO_HOME = Join-Path $realProfile '.cargo'
        $env:RUSTUP_HOME = Join-Path $realProfile '.rustup'
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
