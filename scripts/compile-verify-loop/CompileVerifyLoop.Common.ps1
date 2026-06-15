#Requires -Version 7.0
# Shared helpers for compile-verify-loop scripts (dot-source).

$script:CompileVerifyLoopRepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..' '..')).Path

function Get-CompileVerifyLoopRoot {
    if ($env:COMPILE_VERIFY_LOOP_ROOT) {
        return (Resolve-Path -LiteralPath $env:COMPILE_VERIFY_LOOP_ROOT).Path
    }

    return (Join-Path $script:CompileVerifyLoopRepoRoot '.local' 'compile-verify-loop')
}

function Resolve-CompileVerifyQkrpcExe {
    if ($env:QKRPC_EXE -and (Test-Path -LiteralPath $env:QKRPC_EXE)) {
        return (Resolve-Path -LiteralPath $env:QKRPC_EXE).Path
    }

    $candidates = @(
        (Join-Path $script:CompileVerifyLoopRepoRoot 'publish' 'cli-dev' 'qkrpc.exe'),
        (Join-Path $script:CompileVerifyLoopRepoRoot 'publish' 'cli' 'qkrpc.exe'),
        (Join-Path $script:CompileVerifyLoopRepoRoot 'QuickerRpc.Console' 'bin' 'Release' 'net10.0-windows10.0.19041.0' 'qkrpc.exe')
    )
    foreach ($path in $candidates) {
        if (Test-Path -LiteralPath $path) {
            return (Resolve-Path -LiteralPath $path).Path
        }
    }

    return 'qkrpc'
}

function Invoke-CompileVerifyQkrpcJson {
    param(
        [Parameter(Mandatory)]
        [string[]] $Args,

        [int] $TimeoutSeconds = 120
    )

    $exe = Resolve-CompileVerifyQkrpcExe
    $utf8 = [System.Text.UTF8Encoding]::new($false)

    try {
        Push-Location $script:CompileVerifyLoopRepoRoot
        $tempOut = [System.IO.Path]::GetTempFileName()
        $tempErr = [System.IO.Path]::GetTempFileName()
        try {
            # Capture raw UTF-8 bytes from the child process. Piping through PowerShell
            # re-encodes stdout and corrupts Chinese property names in large JSON payloads.
            $proc = Start-Process `
                -FilePath $exe `
                -ArgumentList $Args `
                -WorkingDirectory $script:CompileVerifyLoopRepoRoot `
                -RedirectStandardOutput $tempOut `
                -RedirectStandardError $tempErr `
                -NoNewWindow `
                -Wait `
                -PassThru

            $stdout = [System.IO.File]::ReadAllText($tempOut, $utf8)
            $stderr = [System.IO.File]::ReadAllText($tempErr, $utf8)
            if ($stdout -notmatch '\{' -and $stderr -match '\{') {
                $stdout = $stderr
            }
        }
        finally {
            foreach ($path in @($tempOut, $tempErr)) {
                if (Test-Path -LiteralPath $path) {
                    Remove-Item -LiteralPath $path -Force
                }
            }
        }

        return [PSCustomObject]@{
            ExitCode = $proc.ExitCode
            Stdout   = $stdout
            Stderr   = $stderr
        }
    }
    finally {
        Pop-Location
    }
}

function ConvertFrom-CompileVerifyJson {
    param([string] $Raw)

    if ([string]::IsNullOrWhiteSpace($Raw)) {
        return $null
    }

    $text = $Raw.Trim()
    if ($text.Length -gt 0 -and [int][char]$text[0] -eq 0xFEFF) {
        $text = $text.Substring(1).Trim()
    }

    try {
        return ($text | ConvertFrom-Json)
    }
    catch {
        $start = $text.IndexOf('{')
        $end = $text.LastIndexOf('}')
        if ($start -ge 0 -and $end -gt $start) {
            try {
                return ($text.Substring($start, $end - $start + 1) | ConvertFrom-Json)
            }
            catch {
                return $null
            }
        }

        return $null
    }
}

function Get-CompileVerifyCaseId {
    param(
        [string] $Title,
        [string] $ActionId
    )

    $id = ($ActionId ?? '').Trim().ToLowerInvariant()
    if ($id.Length -gt 0) {
        return $id
    }

    $slug = ($Title ?? '').Trim()
    if ($slug.Length -eq 0) {
        return 'untitled'
    }

    $slug = [regex]::Replace($slug, '[^\p{L}\p{N}]+', '-').Trim('-').ToLowerInvariant()
    if ($slug.Length -gt 48) {
        $slug = $slug.Substring(0, 48)
    }

    return $slug
}

function Get-CompileVerifyCasePath {
    param([string] $CaseId)
    Join-Path (Get-CompileVerifyLoopRoot) 'cases' $CaseId
}

function Read-CompileVerifyCase {
    param([string] $CaseId)

    $path = Join-Path (Get-CompileVerifyCasePath -CaseId $CaseId) 'case.json'
    if (-not (Test-Path -LiteralPath $path)) {
        return $null
    }

    $raw = [System.IO.File]::ReadAllText($path, [System.Text.UTF8Encoding]::new($false))
    return (ConvertFrom-CompileVerifyJson -Raw $raw)
}

function Write-CompileVerifyUtf8File {
    param(
        [Parameter(Mandatory)][string] $Path,
        [Parameter(Mandatory)][string] $Content
    )

    $dir = Split-Path -Parent $Path
    if ($dir -and -not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }

    $utf8 = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText($Path, $Content, $utf8)
}

function Read-CompileVerifyJsonFile {
    param([Parameter(Mandatory)][string] $Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        return $null
    }

    $raw = [System.IO.File]::ReadAllText($Path, [System.Text.UTF8Encoding]::new($false))
    return (ConvertFrom-CompileVerifyJson -Raw $raw)
}

function Get-CompileVerifyRegexField {
    param(
        [string] $Raw,
        [Parameter(Mandatory)][string] $Name
    )

    $pattern = "`"$Name`"\s*:\s*`"([^`"]*)`""
    if ($Raw -match $pattern) {
        return $Matches[1]
    }

    return ''
}

function Get-CompileVerifyRegexBool {
    param(
        [string] $Raw,
        [Parameter(Mandatory)][string] $Name
    )

    if ($Raw -match "`"$Name`"\s*:\s*(true|false)") {
        return $Matches[1] -eq 'true'
    }

    return $false
}

function Get-CompileVerifyRegexInt {
    param(
        [string] $Raw,
        [Parameter(Mandatory)][string] $Name
    )

    if ($Raw -match "`"$Name`"\s*:\s*(-?\d+)") {
        return [int]$Matches[1]
    }

    return 0
}

function Get-CompileVerifyRegexStringArray {
    param(
        [string] $Raw,
        [Parameter(Mandatory)][string] $Name
    )

    if ($Raw -match "`"$Name`"\s*:\s*\[(.*?)\]") {
        $inner = $Matches[1]
        $values = [regex]::Matches($inner, '"([^"]*)"') | ForEach-Object { $_.Groups[1].Value }
        return @($values)
    }

    return @()
}

function Get-CompileVerifyEscapedJsonField {
    param(
        [string] $Raw,
        [Parameter(Mandatory)][string] $Name
    )

    if ([string]::IsNullOrWhiteSpace($Raw)) {
        return ''
    }

    $marker = "`"$Name`":`""
    $start = $Raw.IndexOf($marker, [StringComparison]::Ordinal)
    if ($start -lt 0) {
        return ''
    }

    $i = $start + $marker.Length
    $sb = [System.Text.StringBuilder]::new()
    while ($i -lt $Raw.Length) {
        $ch = $Raw[$i]
        if ($ch -eq '\') {
            if ($i + 1 -ge $Raw.Length) {
                break
            }

            $next = $Raw[$i + 1]
            switch ($next) {
                'n' { [void]$sb.Append([char]10); $i += 2; continue }
                'r' { [void]$sb.Append([char]13); $i += 2; continue }
                't' { [void]$sb.Append([char]9); $i += 2; continue }
                '"' { [void]$sb.Append('"'); $i += 2; continue }
                '\' { [void]$sb.Append('\'); $i += 2; continue }
                'u' {
                    if ($i + 5 -lt $Raw.Length) {
                        $hex = $Raw.Substring($i + 2, 4)
                        if ($hex -match '^[0-9a-fA-F]{4}$') {
                            [void]$sb.Append([char][int]::Parse($hex, [System.Globalization.NumberStyles]::HexNumber))
                            $i += 6
                            continue
                        }
                    }
                }
            }

            [void]$sb.Append($next)
            $i += 2
            continue
        }

        if ($ch -eq '"') {
            break
        }

        [void]$sb.Append($ch)
        $i++
    }

    return $sb.ToString()
}

function Build-CompileVerifyRuntimeReportFromRaw {
    param([Parameter(Mandatory)][string] $Raw)

    return [PSCustomObject]@{
        ok                   = Get-CompileVerifyReportBool -Object $null -Name 'ok' -Raw $Raw
        actionTitle          = Get-CompileVerifyRegexField -Raw $Raw -Name 'actionTitle'
        isFullySupported     = Get-CompileVerifyReportBool -Object $null -Name 'isFullySupported' -Raw $Raw
        totalStepCount       = Get-CompileVerifyRegexInt -Raw $Raw -Name 'totalStepCount'
        sourceProgramJson    = Get-CompileVerifyEscapedJsonField -Raw $Raw -Name 'sourceProgramJson'
        compiledProgramJson  = Get-CompileVerifyEscapedJsonField -Raw $Raw -Name 'compiledProgramJson'
        supportedStepKeys    = Get-CompileVerifyRegexStringArray -Raw $Raw -Name 'supportedStepKeys'
        unsupportedStepKeys  = Get-CompileVerifyRegexStringArray -Raw $Raw -Name 'unsupportedStepKeys'
    }
}

function Read-CompileVerifyRuntimeCheckReport {
    param([Parameter(Mandatory)][string] $Stdout)

    $parsed = ConvertFrom-CompileVerifyJson -Raw $Stdout
    if ($null -ne $parsed) {
        return $parsed
    }

    return (Build-CompileVerifyRuntimeReportFromRaw -Raw $Stdout)
}

function Test-CompileVerifyRuntimeCheckSucceeded {
    param(
        $Report,
        [string] $Raw = ''
    )

    return (Get-CompileVerifyReportBool -Object $Report -Name 'ok' -Raw $Raw)
}

function Test-CompileVerifyRuntimeCheckBuilt {
    param(
        $Report,
        [string] $Raw = ''
    )

    $programJson = Get-CompileVerifyReportString -Object $Report -Name 'compiledProgramJson' -Raw $Raw
    return -not [string]::IsNullOrWhiteSpace($programJson)
}

function Test-CompileVerifyCompressedPackageBuildFailed {
    param([string] $Raw)

    if ([string]::IsNullOrWhiteSpace($Raw)) {
        return $false
    }

    return $Raw -match 'RUNTIME_PACKAGE_BUILD_FAILED|Invalid character after parsing property name'
}

function Get-CompileVerifyReportBool {
    param(
        $Object,
        [Parameter(Mandatory)][string] $Name,
        [string] $Raw = ''
    )

    if ($null -ne $Object) {
        $prop = $Object.PSObject.Properties[$Name]
        if ($null -ne $prop -and $null -ne $prop.Value) {
            return [bool]$prop.Value
        }
    }

    if (-not [string]::IsNullOrWhiteSpace($Raw)) {
        return Get-CompileVerifyRegexBool -Raw $Raw -Name $Name
    }

    return $false
}

function Get-CompileVerifyReportString {
    param(
        $Object,
        [Parameter(Mandatory)][string] $Name,
        [string] $Raw = ''
    )

    if ($null -ne $Object) {
        $prop = $Object.PSObject.Properties[$Name]
        if ($null -ne $prop -and $null -ne $prop.Value) {
            return [string]$prop.Value
        }
    }

    if (-not [string]::IsNullOrWhiteSpace($Raw)) {
        $escaped = Get-CompileVerifyEscapedJsonField -Raw $Raw -Name $Name
        if (-not [string]::IsNullOrWhiteSpace($escaped)) {
            return $escaped
        }

        return Get-CompileVerifyRegexField -Raw $Raw -Name $Name
    }

    return ''
}

function Get-CompileVerifyActionListItemsFromRaw {
    param([Parameter(Mandatory)][string] $Raw)

    $items = [System.Collections.Generic.List[object]]::new()
    $pattern = '\{\s*"actionId"\s*:\s*"([0-9a-fA-F-]{36})"[^}]*"lastEditTimeUtc"\s*:\s*"([^"]*)"'
    foreach ($match in [regex]::Matches($Raw, $pattern)) {
        $items.Add([ordered]@{
            actionId        = $match.Groups[1].Value.ToLowerInvariant()
            source          = 'local'
            lastEditTimeUtc = $match.Groups[2].Value
            profileName     = ''
        })
    }

    return $items
}

function Read-CompileVerifyActionList {
    param(
        [Parameter(Mandatory)]
        $ListResult
    )

    $doc = ConvertFrom-CompileVerifyJson -Raw $ListResult.Stdout
    if ($null -ne $doc -and $doc.ok -eq $true -and $null -ne $doc.payload -and $null -ne $doc.payload.items) {
        return @($doc.payload.items)
    }

    $fallback = Get-CompileVerifyActionListItemsFromRaw -Raw $ListResult.Stdout
    if ($fallback.Count -gt 0) {
        return @($fallback)
    }

    $head = if ($ListResult.Stdout.Length -gt 300) { $ListResult.Stdout.Substring(0, 300) } else { $ListResult.Stdout }
    throw "action list failed (exit $($ListResult.ExitCode) len=$($ListResult.Stdout.Length)): $head"
}

function Get-CompileVerifyActionEditMs {
    param([Parameter(Mandatory)][string] $ActionId)

    $result = Invoke-CompileVerifyQkrpcJson -Args @(
        'action', 'get', '--id', $ActionId, '--return-mode', 'metadata', '--json'
    )
    if ($result.Stdout -match '"editVersion"\s*:\s*(\d+)') {
        return [long]$Matches[1]
    }

    return 0
}

function Get-CompileVerifyBenchmarkMockMap {
    $mapPath = Join-Path $PSScriptRoot 'templates' 'mock-action-profiles.json'
    if (-not (Test-Path -LiteralPath $mapPath)) {
        return @{}
    }

    $doc = Read-CompileVerifyJsonFile -Path $mapPath
    $profiles = @{}
    if ($null -ne $doc.profiles) {
        foreach ($prop in $doc.profiles.PSObject.Properties) {
            $profiles[$prop.Name.ToLowerInvariant()] = [string]$prop.Value
        }
    }

    return $profiles
}

function Get-CompileVerifyMockProfilesDir {
    Join-Path $script:CompileVerifyLoopRepoRoot 'agent-gui' 'benchmarks' 'mock-profiles'
}

function Find-CompileVerifyCaseByActionId {
    param([Parameter(Mandatory)][string] $ActionId)

    $target = $ActionId.Trim().ToLowerInvariant()
    $casesDir = Join-Path (Get-CompileVerifyLoopRoot) 'cases'
    if (-not (Test-Path -LiteralPath $casesDir)) {
        return $null
    }

    $direct = Join-Path $casesDir $target
    if (Test-Path -LiteralPath (Join-Path $direct 'case.json')) {
        return Read-CompileVerifyCase -CaseId $target
    }

    foreach ($dir in Get-ChildItem -LiteralPath $casesDir -Directory) {
        $casePath = Join-Path $dir.FullName 'case.json'
        if (-not (Test-Path -LiteralPath $casePath)) {
            continue
        }

        $case = Read-CompileVerifyCase -CaseId $dir.Name
        if ($null -eq $case) {
            continue
        }

        $caseActionId = [string]($case.source.actionId ?? '')
        $sharedActionId = [string]($case.source.sharedActionId ?? '')
        if ($caseActionId.ToLowerInvariant() -eq $target -or $sharedActionId.ToLowerInvariant() -eq $target) {
            return $case
        }

        $compilePath = Join-Path $dir.FullName 'last-compile.json'
        if (Test-Path -LiteralPath $compilePath) {
            $raw = [System.IO.File]::ReadAllText($compilePath, [System.Text.UTF8Encoding]::new($false))
            if ($raw -match '"actionId"\s*:\s*"([^"]+)"' -and $Matches[1].ToLowerInvariant() -eq $target) {
                return Read-CompileVerifyCase -CaseId $dir.Name
            }
        }
    }

    return $null
}

function Set-CompileVerifyCasePhase {
    param(
        $Case,
        [Parameter(Mandatory)][string] $PhaseName,
        $PhaseData
    )

    $phases = [ordered]@{}
    if ($null -ne $Case.phases) {
        foreach ($prop in $Case.phases.PSObject.Properties) {
            $phases[$prop.Name] = $prop.Value
        }
    }

    $phases[$PhaseName] = $PhaseData
    $Case.phases = $phases
}

function Write-CompileVerifyCase {
    param(
        [Parameter(Mandatory)]
        $Case
    )

    $dir = Get-CompileVerifyCasePath -CaseId $Case.id
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    if ($Case.source.title) {
        $Case.source.title = [string]$Case.source.title
    }

    $json = $Case | ConvertTo-Json -Depth 12
    Write-CompileVerifyUtf8File -Path (Join-Path $dir 'case.json') -Content $json
}

function Add-CompileVerifyMockRejectedProfile {
    param(
        $Case,
        [Parameter(Mandatory)][string] $ProfileId
    )

    if ($null -eq $Case -or [string]::IsNullOrWhiteSpace($ProfileId)) {
        return
    }

    $profileKey = $ProfileId.Trim().ToLowerInvariant()
    $rejected = @()
    if ($null -ne $Case.mockRejectedProfiles) {
        $rejected = @($Case.mockRejectedProfiles | ForEach-Object { [string]$_ })
    }

    if ($rejected -notcontains $profileKey) {
        $rejected += $profileKey
    }

    if ($Case -is [System.Collections.IDictionary]) {
        $Case['mockRejectedProfiles'] = $rejected
        return
    }

    $Case | Add-Member -NotePropertyName mockRejectedProfiles -NotePropertyValue $rejected -Force
}

function Test-CompileVerifyMockProfileRejected {
    param(
        $Case,
        [Parameter(Mandatory)][string] $ProfileId
    )

    if ($null -eq $Case -or $null -eq $Case.mockRejectedProfiles) {
        return $false
    }

    $profileKey = $ProfileId.Trim().ToLowerInvariant()
    foreach ($item in @($Case.mockRejectedProfiles)) {
        if ([string]$item -eq $profileKey) {
            return $true
        }
    }

    return $false
}

function Write-CompileVerifyProgramFile {
    param(
        [Parameter(Mandatory)]
        [string] $Path,

        [Parameter(Mandatory)]
        $ProgramJson
    )

    $dir = Split-Path -Parent $Path
    if ($dir -and -not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }

    if ($ProgramJson -is [string]) {
        Write-CompileVerifyUtf8File -Path $Path -Content $ProgramJson
        return
    }

    Write-CompileVerifyUtf8File -Path $Path -Content ($ProgramJson | ConvertTo-Json -Depth 30)
}

function Write-CompileVerifyJsonFile {
    param(
        [Parameter(Mandatory)]
        [string] $Path,

        [Parameter(Mandatory)]
        $Object
    )

    $dir = Split-Path -Parent $Path
    if ($dir -and -not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }

    if ($Object -is [string]) {
        Write-CompileVerifyUtf8File -Path $Path -Content $Object
        return
    }

    Write-CompileVerifyUtf8File -Path $Path -Content ($Object | ConvertTo-Json -Depth 20)
}

function Test-CompileVerifyMockAssertPassed {
    param(
        [string] $Stdout,
        [int] $ExitCode
    )

    if ($ExitCode -ne 0) {
        return $false
    }

    if ($Stdout -match '"assertions"\s*:\s*\{[^}]*"passed"\s*:\s*true') {
        return $true
    }

    if ($Stdout -match '"ok"\s*:\s*true' -and $Stdout -match '"action"\s*:\s*"mock-run"') {
        return $true
    }

    return $false
}

function Test-CompileVerifySkipStatus {
    param([string] $Status)

    $Status -in @('mock_pass', 'compile_ok', 'skipped', 'blocked')
}

# Keep in sync with Quicker.ActionRuntime.Integration.StepMigrationCatalog.DeliberatelyExcluded
function Get-CompileVerifyDeliberatelyExcludedStepKeys {
    return @(
        'sys:quickeroperations',
        'sys:runaction',
        'sys:getquickerinfo',
        'sys:customwindow',
        'sys:custompanel',
        'sys:webview2',
        'sys:excelobjects',
        'sys:officehelper',
        'sys:record',
        'sys:playrecords',
        'sys:pythonscript',
        'sys:everythingsearch'
    )
}

function Split-CompileVerifyUnsupportedStepKeys {
    param([string[]] $UnsupportedStepKeys)

    $excluded = [System.Collections.Generic.HashSet[string]]::new(
        [StringComparer]::OrdinalIgnoreCase)
    foreach ($key in (Get-CompileVerifyDeliberatelyExcludedStepKeys)) {
        [void]$excluded.Add($key)
    }

    $deliberate = [System.Collections.Generic.List[string]]::new()
    $fixable = [System.Collections.Generic.List[string]]::new()
    foreach ($key in @($UnsupportedStepKeys)) {
        if ([string]::IsNullOrWhiteSpace($key)) {
            continue
        }

        $normalized = $key.Trim().ToLowerInvariant()
        if ($excluded.Contains($normalized)) {
            $deliberate.Add($normalized)
        }
        else {
            $fixable.Add($normalized)
        }
    }

    return [PSCustomObject]@{
        Deliberate = @($deliberate | Sort-Object -Unique)
        Fixable    = @($fixable | Sort-Object -Unique)
    }
}

function Test-CompileVerifyDeliberateExclusionOnly {
    param([string[]] $UnsupportedStepKeys)

    $split = Split-CompileVerifyUnsupportedStepKeys -UnsupportedStepKeys $UnsupportedStepKeys
    return ($split.Fixable.Count -eq 0 -and $split.Deliberate.Count -gt 0)
}

# Full-tier keys from StepImplementationTierCatalog (no MockOnly / Partial / host automation).
function Get-CompileVerifyFullTierStepKeys {
    return @(
        'sys:comment', 'sys:delay', 'sys:stop', 'sys:break', 'sys:continue', 'sys:if', 'sys:simpleif',
        'sys:repeat', 'sys:assign', 'sys:compute', 'sys:evalexpression', 'sys:splitstring', 'sys:strreplace',
        'sys:joinlist', 'sys:formatstring', 'sys:regexextract', 'sys:jsonextract', 'sys:stringprocess',
        'sys:readfile', 'sys:writetextfile', 'sys:checkpathexists', 'sys:gentempfilepath', 'sys:newguid',
        'sys:randomnum', 'sys:openurl', 'sys:pathextraction', 'sys:textcounter', 'sys:charinfo', 'sys:strcompare',
        'sys:numcompare', 'sys:zip', 'sys:dependencycheck', 'sys:color', 'sys:enc', 'sys:dictoperations',
        'sys:listoperations', 'sys:getcurrenttime', 'sys:computetime', 'sys:numberprocess', 'sys:getclipboardtext',
        'sys:writeclipboard', 'sys:getclipboardimage', 'sys:getclipboardfiles', 'sys:filetoclipboard',
        'sys:getfolderpath', 'sys:createqrcode', 'sys:imageinfo', 'sys:imgtobase64', 'sys:writeimagefile',
        'sys:tableoperation', 'sys:htmlextract', 'sys:subprogram'
    )
}

function Test-CompileVerifyFullTierStepKeys {
    param([string[]] $StepKeys)

    $fullSet = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($key in (Get-CompileVerifyFullTierStepKeys)) {
        [void]$fullSet.Add($key)
    }

    foreach ($key in @($StepKeys)) {
        if ([string]::IsNullOrWhiteSpace($key)) {
            continue
        }

        if (-not $fullSet.Contains($key.Trim().ToLowerInvariant())) {
            return $false
        }
    }

    return $StepKeys.Count -gt 0
}

function Test-CompileVerifyRunnableStatus {
    param([string] $Status)

    $Status -in @('pending', 'compile_fail', 'mock_fail')
}

function Update-CompileVerifyManifest {
    $root = Get-CompileVerifyLoopRoot
    $casesDir = Join-Path $root 'cases'
    $stats = @{
        total        = 0
        pending      = 0
        compile_fail = 0
        compile_ok   = 0
        mock_fail    = 0
        mock_pass    = 0
        blocked      = 0
        skipped      = 0
    }

    $batches = @()
    $batchesDir = Join-Path $root 'batches'
    if (Test-Path -LiteralPath $batchesDir) {
        $batches = @(Get-ChildItem -LiteralPath $batchesDir -Directory | ForEach-Object { $_.Name })
    }

    if (Test-Path -LiteralPath $casesDir) {
        foreach ($caseFile in Get-ChildItem -LiteralPath $casesDir -Recurse -Filter 'case.json') {
            try {
                $raw = [System.IO.File]::ReadAllText($caseFile.FullName, [System.Text.UTF8Encoding]::new($false))
                $case = $raw | ConvertFrom-Json
            }
            catch {
                continue
            }
            $stats.total++
            $key = [string]$case.status
            if ($stats.ContainsKey($key)) {
                $stats[$key]++
            }
            else {
                $stats.pending++
            }
        }
    }

    New-Item -ItemType Directory -Path $root -Force | Out-Null
    $manifestPath = Join-Path $root 'manifest.json'
    $existing = $null
    if (Test-Path -LiteralPath $manifestPath) {
        $existing = Get-Content -LiteralPath $manifestPath -Raw -Encoding utf8 | ConvertFrom-Json
    }

    $manifest = [ordered]@{
        version   = 1
        root      = $root
        stats     = $stats
        batches   = $batches
        updatedAt = (Get-Date).ToUniversalTime().ToString('o')
        lastRunAt = $existing?.lastRunAt
    }

    Set-Content -LiteralPath $manifestPath -Value ($manifest | ConvertTo-Json -Depth 8) -Encoding utf8NoBOM
    return $manifest
}

function Get-CompileVerifyActionMetadata {
    param([Parameter(Mandatory)][string] $ActionId)

    $result = Invoke-CompileVerifyQkrpcJson -Args @(
        'action', 'get', '--id', $ActionId, '--return-mode', 'metadata', '--json'
    )
    $doc = ConvertFrom-CompileVerifyJson -Raw $result.Stdout
    if (-not $doc?.ok) {
        return $null
    }

    return $doc.payload.compressed
}

function Test-CompileVerifyPostFilter {
    param(
        $Metadata,
        $PostFilter
    )

    if ($null -eq $Metadata) {
        return $false
    }

    $title = [string]$Metadata.title
    $stepCount = [int]($Metadata.stepCount ?? 0)
    $minSteps = [int]($PostFilter.minStepCount ?? 1)

    if ($PostFilter.excludeEmptyTitle -and [string]::IsNullOrWhiteSpace($title)) {
        return $false
    }

    if ($stepCount -lt $minSteps) {
        return $false
    }

    if ($PostFilter.excludeUsesOnlyWrappers) {
        $outline = @($Metadata.stepOutline)
        if ($outline.Count -gt 0) {
            $allSub = $true
            foreach ($step in $outline) {
                if ([string]$step.stepRunnerKey -ne 'sys:subprogram') {
                    $allSub = $false
                    break
                }
            }
            if ($allSub) {
                return $false
            }
        }
    }

    return $true
}

function Test-CompileVerifySubprogramOnlyProgram {
    param([string] $ProgramJson)

    if ([string]::IsNullOrWhiteSpace($ProgramJson)) {
        return $false
    }

    try {
        $program = $ProgramJson | ConvertFrom-Json
    }
    catch {
        return $false
    }

    $steps = @($program.steps)
    if ($steps.Count -eq 0) {
        return $false
    }

    $enabled = @($steps | Where-Object { -not $_.disabled })
    if ($enabled.Count -eq 0) {
        return $false
    }

    foreach ($step in $enabled) {
        if ([string]$step.stepRunnerKey -ne 'sys:subprogram') {
            return $false
        }
    }

    return $true
}

function Test-CompileVerifySubprogramOnlyReport {
    param(
        $Report,
        [string] $Raw = ''
    )

    $sourceJson = Get-CompileVerifyReportString -Object $Report -Name 'sourceProgramJson' -Raw $Raw
    if (Test-CompileVerifySubprogramOnlyProgram -ProgramJson $sourceJson) {
        return $true
    }

    $compiledJson = Get-CompileVerifyReportString -Object $Report -Name 'compiledProgramJson' -Raw $Raw
    if (Test-CompileVerifySubprogramOnlyProgram -ProgramJson $compiledJson) {
        return $true
    }

    $supported = @()
    if ($null -ne $Report) {
        $prop = $Report.PSObject.Properties['supportedStepKeys']
        if ($null -ne $prop -and $null -ne $prop.Value) {
            $supported = @($prop.Value)
        }
    }

    return ($supported.Count -eq 1 -and $supported[0] -eq 'sys:subprogram')
}

function Get-CompileVerifySubprogramOnlySkipNote {
    return 'Subprogram-only wrapper (no inline steps to compile-verify)'
}

function Invoke-CompileVerifyRuntimeCheck {
    param([Parameter(Mandatory)][string] $ActionId)

    return Invoke-CompileVerifyQkrpcJson -Args @(
        'action', 'runtime-check', '--id', $ActionId, '--json'
    )
}

function Get-CompileVerifyHostOnlyStepKeys {
    return @(
        'sys:runaction',
        'sys:quickeroperations',
        'sys:getactioninfo',
        'sys:getquickerinfo',
        'sys:webview2',
        'sys:everythingsearch'
    )
}

function Get-CompileVerifyUnsupportedStepKeys {
    param(
        $Report,
        [string] $Raw = ''
    )

    if ($null -ne $Report) {
        $prop = $Report.PSObject.Properties['unsupportedStepKeys']
        if ($null -ne $prop -and $null -ne $prop.Value) {
            return @($prop.Value)
        }
    }

    if ([string]::IsNullOrWhiteSpace($Raw)) {
        return @()
    }

    $keys = [System.Collections.Generic.List[string]]::new()
    if ($Raw -match '"unsupportedStepKeys"\s*:\s*\[(.*?)\]') {
        foreach ($match in [regex]::Matches($Matches[1], '"([^"]+)"')) {
            $keys.Add($match.Groups[1].Value)
        }
    }

    return @($keys)
}

function Test-CompileVerifyHostOnlyUnsupported {
    param(
        $Report,
        [string] $Raw = ''
    )

    $unsupported = Get-CompileVerifyUnsupportedStepKeys -Report $Report -Raw $Raw
    if ($unsupported.Count -eq 0) {
        return $false
    }

    $hostOnly = Get-CompileVerifyHostOnlyStepKeys
    foreach ($key in $unsupported) {
        if ($hostOnly -notcontains ($key.ToLowerInvariant())) {
            return $false
        }
    }

    return $true
}

function Get-CompileVerifyHostOnlySkipNote {
    param([string[]] $UnsupportedStepKeys)

    return "Host-only steps (ActionRuntime excluded): $($UnsupportedStepKeys -join ', ')"
}

function Resolve-CompileVerifyCompileStatus {
    param(
        $Report,
        [string] $Raw = ''
    )

    if (-not (Test-CompileVerifyRuntimeCheckBuilt -Report $compileReport -Raw $rc.Stdout)) {
        return @{
            status = 'compile_fail'
            ok     = $false
        }
    }

    if (Get-CompileVerifyReportBool -Object $Report -Name 'isFullySupported' -Raw $Raw) {
        return @{
            status = 'compile_ok'
            ok     = $true
        }
    }

    return @{
        status = 'blocked'
        ok     = $false
    }
}

function New-CompileVerifyAgentPrompt {
    param(
        [Parameter(Mandatory)]
        $Case,

        [string] $Phase,
        $Report
    )

    $lines = @(
        "## Compile-verify case: $($Case.id)",
        '',
        "- actionId: $($Case.source.actionId)",
        $(if ($Case.source.sharedActionId) { "- sharedActionId: $($Case.source.sharedActionId)" } else { '' }),
        "- title: $($Case.source.title)",
        "- status: $($Case.status)",
        "- phase: $Phase",
        ''
    )

    if ($Phase -eq 'compile') {
        $unsupported = @($Report.unsupportedStepKeys)
        $supported = @($Report.supportedStepKeys)
        $split = Split-CompileVerifyUnsupportedStepKeys -UnsupportedStepKeys $unsupported
        $lines += @(
            '### Error',
            "- isFullySupported: $($Report.isFullySupported)",
            "- totalStepCount: $($Report.totalStepCount)",
            "- unsupportedSteps: $(if ($unsupported.Count) { $unsupported -join ', ' } else { '(none)' })",
            $(if ($split.Deliberate.Count) {
                "- deliberateExclusions: $($split.Deliberate -join ', ')"
            } else { '' }),
            $(if ($split.Fixable.Count) {
                "- fixableUnsupported: $($split.Fixable -join ', ')"
            } else { '' }),
            "- supportedSteps: $(if ($supported.Count) { $supported -join ', ' } else { '(none)' })",
            ''
        ) | Where-Object { $_ -ne '' }

        if (Test-CompileVerifyDeliberateExclusionOnly -UnsupportedStepKeys $unsupported) {
            $lines += @(
                '### Suggested steps (deliberate exclusion)',
                'All unsupported steps are listed in `StepMigrationCatalog.DeliberatelyExcluded`.',
                '1. Read ``cases/$($Case.id)/last-compile.json`` and pick a representative csscript/customwindow case',
                '2. Implement a new step module under `Quicker.ActionRuntime` (large feature — not a codegen bugfix)',
                '3. Remove the step key from `DeliberatelyExcluded` once the module is registered',
                '4. ``dotnet test Quicker.ActionRuntime.Tests`` then ``pwsh ./scripts/compile-verify-loop/Invoke-Case.ps1 -CaseId $($Case.id) -Force``'
            )
        }
        else {
            $lines += @(
                '### Suggested steps',
                "1. Read ``cases/$($Case.id)/last-compile.json``",
                '2. Add compiler/module support in `Quicker.ActionRuntime` for unsupported step keys',
                '3. `pwsh ./build.ps1 -t` when Plugin/qkrpc changed; else `dotnet build` ActionRuntime',
                "4. ``pwsh ./scripts/compile-verify-loop/Invoke-Case.ps1 -CaseId $($Case.id) -Force``"
            )
        }
    }
    else {
        $failures = @($Report.assertions.failures)
        $hints = @($Report.fixHints)
        $lines += @(
            '### Mock failure',
            "- assertions.passed: $($Report.assertions.passed)",
            $(if ($failures.Count) { "- failures: $($failures | ConvertTo-Json -Compress)" } else { '' }),
            $(if ($hints.Count) { "- fixHints: $($hints | ConvertTo-Json -Compress)" } else { '' }),
            "1. Read ``cases/$($Case.id)/last-mock.json``",
            '2. Fix `mock-profile.json` or ActionRuntime mock behavior',
            "3. ``pwsh ./scripts/compile-verify-loop/Invoke-Case.ps1 -CaseId $($Case.id) -MockOnly -Force``"
        ) | Where-Object { $_ -ne '' }
    }

    return ($lines -join "`n")
}

function Get-CompileVerifyJsonObjectField {
    param(
        [string] $Raw,
        [Parameter(Mandatory)][string] $Name
    )

    if ([string]::IsNullOrWhiteSpace($Raw)) {
        return $null
    }

    $marker = "`"$Name`":"
    $start = $Raw.IndexOf($marker, [StringComparison]::Ordinal)
    if ($start -lt 0) {
        return $null
    }

    $i = $start + $marker.Length
    while ($i -lt $Raw.Length -and [char]::IsWhiteSpace($Raw[$i])) {
        $i++
    }

    if ($i -ge $Raw.Length -or $Raw[$i] -ne '{') {
        return $null
    }

    $depth = 0
    $inString = $false
    $escape = $false
    $begin = $i
    for (; $i -lt $Raw.Length; $i++) {
        $ch = $Raw[$i]
        if ($inString) {
            if ($escape) {
                $escape = $false
                continue
            }

            if ($ch -eq '\') {
                $escape = $true
                continue
            }

            if ($ch -eq '"') {
                $inString = $false
            }

            continue
        }

        if ($ch -eq '"') {
            $inString = $true
            continue
        }

        if ($ch -eq '{') {
            $depth++
            continue
        }

        if ($ch -eq '}') {
            $depth--
            if ($depth -eq 0) {
                return $Raw.Substring($begin, $i - $begin + 1)
            }
        }
    }

    return $null
}

function Convert-CompileVerifyLibraryUpdatedAtToEditMs {
    param([string] $UpdatedAt)

    if ([string]::IsNullOrWhiteSpace($UpdatedAt)) {
        return 0
    }

    $text = $UpdatedAt.Trim()
    $formats = @('yyyy-MM-dd HH:mm', 'yyyy-MM-dd HH:mm:ss')
    foreach ($fmt in $formats) {
        $parsed = [DateTime]::MinValue
        if ([DateTime]::TryParseExact(
                $text,
                $fmt,
                [System.Globalization.CultureInfo]::InvariantCulture,
                [System.Globalization.DateTimeStyles]::AssumeLocal,
                [ref]$parsed)) {
            return [DateTimeOffset]::new($parsed).ToUnixTimeMilliseconds()
        }
    }

    try {
        return [DateTimeOffset]::Parse($text).ToUnixTimeMilliseconds()
    }
    catch {
        return 0
    }
}

function Invoke-CompileVerifyLibrarySearch {
    param(
        [Parameter(Mandatory)][string] $Keyword,
        [int] $Page = 1,
        [int] $Limit = 10,
        [int] $Days = 0
    )

    $args = @(
        'action', 'library', 'search',
        '--keyword', $Keyword,
        '--page', [string]$Page,
        '--limit', [string]$Limit,
        '--json'
    )
    if ($Days -gt 0) {
        $args += @('--days', [string]$Days)
    }

    return Invoke-CompileVerifyQkrpcJson -Args $args -TimeoutSeconds 120
}

function Read-CompileVerifyLibrarySearchItems {
    param([Parameter(Mandatory)] $SearchResult)

    $doc = ConvertFrom-CompileVerifyJson -Raw $SearchResult.Stdout
    if ($null -ne $doc -and $doc.ok -eq $true -and $null -ne $doc.payload -and $null -ne $doc.payload.items) {
        return @($doc.payload.items)
    }

    $items = [System.Collections.Generic.List[object]]::new()
    $pattern = '"sharedActionId"\s*:\s*"([^"]+)"[^}]*"title"\s*:\s*"([^"]*)"'
    foreach ($match in [regex]::Matches($SearchResult.Stdout, $pattern)) {
        $items.Add([ordered]@{
            sharedActionId = $match.Groups[1].Value.ToLowerInvariant()
            title          = $match.Groups[2].Value
        })
    }

    if ($items.Count -eq 0 -and $SearchResult.ExitCode -ne 0) {
        $head = if ($SearchResult.Stdout.Length -gt 300) { $SearchResult.Stdout.Substring(0, 300) } else { $SearchResult.Stdout }
        throw "library search failed (exit $($SearchResult.ExitCode)): $head"
    }

    return @($items)
}

function Invoke-CompileVerifySharedGet {
    param(
        [Parameter(Mandatory)][string] $SharedActionId,
        [string] $ReturnMode = 'full'
    )

    return Invoke-CompileVerifyQkrpcJson -Args @(
        'action', 'shared', 'get',
        '--id', $SharedActionId,
        '--return-mode', $ReturnMode,
        '--json'
    ) -TimeoutSeconds 180
}

function Read-CompileVerifySharedGetPayload {
    param([Parameter(Mandatory)][string] $Stdout)

    $success = $Stdout -match '"success"\s*:\s*true'
    $sharedActionId = Get-CompileVerifyRegexField -Raw $Stdout -Name 'sharedActionId'
    $localActionId = Get-CompileVerifyRegexField -Raw $Stdout -Name 'localActionId'
    $subProgramCount = Get-CompileVerifyRegexInt -Raw $Stdout -Name 'subProgramCount'
    $compressedJson = Get-CompileVerifyJsonObjectField -Raw $Stdout -Name 'compressed'

    if ($success -and -not [string]::IsNullOrWhiteSpace($compressedJson)) {
        return [PSCustomObject]@{
            Success          = $true
            SharedActionId   = $sharedActionId
            LocalActionId    = $localActionId
            CompressedJson   = $compressedJson
            SubProgramCount  = $subProgramCount
            InstalledLocally = $Stdout -match '"installedLocally"\s*:\s*true'
        }
    }

    $doc = ConvertFrom-CompileVerifyJson -Raw $Stdout
    if ($null -ne $doc -and $doc.ok -eq $true -and $null -ne $doc.payload -and $doc.payload.success -eq $true) {
        $fallbackCompressed = $null
        if ($null -ne $doc.payload.compressed) {
            $fallbackCompressed = if ($doc.payload.compressed -is [string]) {
                [string]$doc.payload.compressed
            }
            else {
                $doc.payload.compressed | ConvertTo-Json -Depth 100 -Compress
            }
        }

        return [PSCustomObject]@{
            Success          = $true
            SharedActionId   = [string]($doc.payload.sharedActionId ?? $sharedActionId)
            LocalActionId    = [string]($doc.payload.localActionId ?? $localActionId)
            CompressedJson   = $fallbackCompressed
            SubProgramCount  = [int]($doc.payload.subProgramCount ?? $subProgramCount)
            InstalledLocally = [bool]($doc.payload.installedLocally ?? $false)
        }
    }

    return [PSCustomObject]@{
        Success          = $success
        SharedActionId   = $sharedActionId
        LocalActionId    = $localActionId
        CompressedJson   = $compressedJson
        SubProgramCount  = $subProgramCount
        InstalledLocally = $Stdout -match '"installedLocally"\s*:\s*true'
    }
}

function Invoke-CompileVerifyRuntimeCheckXAction {
    param([Parameter(Mandatory)][string] $XActionFile)

    return Invoke-CompileVerifyQkrpcJson -Args @(
        'action', 'runtime-check',
        '--xaction-file', $XActionFile,
        '--json'
    ) -TimeoutSeconds 180
}

function Invoke-CompileVerifyRuntimeCheckCompressed {
    param([Parameter(Mandatory)][string] $CompressedFile)

    return Invoke-CompileVerifyQkrpcJson -Args @(
        'action', 'runtime-check',
        '--compressed-file', $CompressedFile,
        '--json'
    ) -TimeoutSeconds 180
}

function Get-CompileVerifySharedCompressedPath {
    param([Parameter(Mandatory)][string] $CaseId)
    Join-Path (Get-CompileVerifyCasePath -CaseId $CaseId) 'shared-compressed.json'
}

function Test-CompileVerifyLibraryCase {
    param($Case)
    [string]($Case.source.kind ?? '') -eq 'getquicker-library'
}

function Get-CompileVerifyCaseRuntimeArgs {
    param(
        [Parameter(Mandatory)] $Case,
        [Parameter(Mandatory)][string] $CaseDir
    )

    if (Test-CompileVerifyLibraryCase -Case $Case) {
        $compressedPath = Join-Path $CaseDir 'shared-compressed.json'
        if (Test-Path -LiteralPath $compressedPath) {
            return @{
                compileArgs = @('action', 'runtime-check', '--compressed-file', $compressedPath, '--json')
                mockArgs    = @('action', 'run', '--compressed-file', $compressedPath)
            }
        }

        $compileVia = [string]($Case.source.compileVia ?? '')
        if ($compileVia -eq 'local-install' -and -not [string]::IsNullOrWhiteSpace([string]($Case.source.localActionId ?? ''))) {
            $localId = [string]$Case.source.localActionId
            return @{
                compileArgs = @('action', 'runtime-check', '--id', $localId, '--json')
                mockArgs    = @('action', 'run', '--id', $localId)
            }
        }
    }

    $actionId = [string]($Case.source.actionId ?? $Case.source.sharedActionId ?? '')
    return @{
        compileArgs = @('action', 'runtime-check', '--id', $actionId, '--json')
        mockArgs    = @('action', 'run', '--id', $actionId)
    }
}

function Test-CompileVerifyExternalSubProgramIdentifier {
    param([string] $Identifier)

    if ([string]::IsNullOrWhiteSpace($Identifier)) {
        return $false
    }

    $id = $Identifier.Trim()
    $sharedTemplate = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}@[0-9]+@'
    return ($id.StartsWith('@@', [StringComparison]::Ordinal) -or $id.StartsWith('%%', [StringComparison]::Ordinal) -or $id -match $sharedTemplate)
}

function Get-CompileVerifyCaseProgramJson {
    param([string] $CaseDir)

    $programPath = Join-Path $CaseDir 'program.json'
    if (Test-Path -LiteralPath $programPath) {
        return [System.IO.File]::ReadAllText($programPath, [System.Text.UTF8Encoding]::new($false))
    }

    $lcPath = Join-Path $CaseDir 'last-compile.json'
    if (-not (Test-Path -LiteralPath $lcPath)) {
        return $null
    }

    $lc = Read-CompileVerifyJsonFile -Path $lcPath
    return Get-CompileVerifyReportString -Object $lc -Name 'compiledProgramJson' -Raw ''
}

function Test-CompileVerifyExternalSubProgramWrapper {
    param([string] $CaseDir)

    $programJson = Get-CompileVerifyCaseProgramJson -CaseDir $CaseDir
    if ([string]::IsNullOrWhiteSpace($programJson)) {
        return $false
    }

    try {
        $doc = $programJson | ConvertFrom-Json
    }
    catch {
        return $false
    }

    $steps = @($doc.steps)
    if ($steps.Count -ne 1) {
        return $false
    }

    $step = $steps[0]
    if ([string]$step.stepRunnerKey -notin @('sys:subprogram', 'sys:SubProgram')) {
        return $false
    }

    $subProgram = $null
    if ($step.inputParams.subProgram) {
        $subProgram = [string]$step.inputParams.subProgram
    }
    elseif ($step.inputParams.PSObject.Properties['subProgram']) {
        $raw = $step.inputParams.subProgram
        if ($raw.value) { $subProgram = [string]$raw.value }
        elseif ($raw -is [string]) { $subProgram = $raw }
    }

    return Test-CompileVerifyExternalSubProgramIdentifier -Identifier $subProgram
}

function Get-CompileVerifyStepSubProgramName {
    param($Step)

    if ($null -eq $Step) {
        return $null
    }

    if ($Step.inputParams.subProgram) {
        return [string]$Step.inputParams.subProgram
    }

    if ($Step.inputParams.PSObject.Properties['subProgram']) {
        $raw = $Step.inputParams.subProgram
        if ($raw.value) { return [string]$raw.value }
        if ($raw -is [string]) { return $raw }
    }

    return $null
}

function Test-CompileVerifyRawProgramUsesExternalSubProgram {
    param([string] $ProgramJson)

    if ([string]::IsNullOrWhiteSpace($ProgramJson)) {
        return $false
    }

    if ($ProgramJson -match '%%[0-9a-fA-F-]{36}' -or $ProgramJson -match '@@[0-9a-fA-F-]{36}') {
        return $true
    }

    $sharedTemplate = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}@[0-9]+@'
    return [regex]::IsMatch($ProgramJson, $sharedTemplate)
}

function Test-CompileVerifyCaseUsesExternalSubProgram {
    param([string] $CaseDir)

    $programJson = Get-CompileVerifyCaseProgramJson -CaseDir $CaseDir
    if ([string]::IsNullOrWhiteSpace($programJson)) {
        return $false
    }

    try {
        $doc = $programJson | ConvertFrom-Json
    }
    catch {
        return (Test-CompileVerifyRawProgramUsesExternalSubProgram -ProgramJson $programJson)
    }

    foreach ($step in @($doc.steps)) {
        if ([string]$step.stepRunnerKey -notin @('sys:subprogram', 'sys:SubProgram')) {
            continue
        }

        if (Test-CompileVerifyExternalSubProgramIdentifier -Identifier (Get-CompileVerifyStepSubProgramName $step)) {
            return $true
        }
    }

    return $false
}

function Get-CompileVerifyMockableStepKeys {
    $extra = @(
        'sys:outputtext', 'sys:showtext', 'sys:reportprogress', 'sys:notify', 'sys:msgbox',
        'sys:chromecontrol', 'sys:adobesoftscontrol', 'sys:keyinput', 'sys:runscript', 'sys:run',
        'sys:form', 'sys:http', 'sys:sendkeys', 'sys:screencapturepro', 'sys:getexplorerpath',
        'sys:getwindowtitle', 'sys:activateprocessmainwindow', 'sys:userinput',
        'sys:showimage', 'sys:screencapture', 'sys:csscript', 'sys:jsscript', 'sys:basic-ocr', 'sys:group', 'sys:each', 'sys:repeat',
        'sys:imecontrol', 'sys:download'
    )

    return @((Get-CompileVerifyFullTierStepKeys) + $extra | Select-Object -Unique)
}

function Test-CompileVerifyMockableOnlyStepKeys {
    param([string[]] $StepKeys)

    $allowed = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($key in (Get-CompileVerifyMockableStepKeys)) {
        [void]$allowed.Add($key)
    }

    foreach ($key in @($StepKeys)) {
        if ([string]::IsNullOrWhiteSpace($key)) {
            continue
        }

        if (-not $allowed.Contains($key.Trim().ToLowerInvariant())) {
            return $false
        }
    }

    return $StepKeys.Count -gt 0
}

function Test-CompileVerifyExternalSubProgramOnlyNoEmbedded {
    param([string] $CaseDir)

    if (-not (Test-CompileVerifyCaseUsesExternalSubProgram -CaseDir $CaseDir)) {
        return $false
    }

    $programJson = Get-CompileVerifyCaseProgramJson -CaseDir $CaseDir
    if ([string]::IsNullOrWhiteSpace($programJson)) {
        return $false
    }

    if ($programJson -match '"subPrograms"\s*:\s*\[\s*\{') {
        return $false
    }

    try {
        $doc = $programJson | ConvertFrom-Json
    }
    catch {
        return $false
    }

    foreach ($step in @($doc.steps)) {
        if ([string]$step.stepRunnerKey -notin @('sys:subprogram', 'sys:SubProgram')) {
            continue
        }

        if (-not (Test-CompileVerifyExternalSubProgramIdentifier -Identifier (Get-CompileVerifyStepSubProgramName $step))) {
            return $false
        }
    }

    return $true
}

function Test-CompileVerifyHasEmbeddedSubProgram {
    param([string] $CaseDir)

    $programJson = Get-CompileVerifyCaseProgramJson -CaseDir $CaseDir
    if ([string]::IsNullOrWhiteSpace($programJson)) {
        return $false
    }

    return $programJson -match '"subPrograms"\s*:\s*\[\s*\{'
}

function Get-CompileVerifyMockReadFileFixturePath {
    $fixturesDir = Join-Path (Get-CompileVerifyLoopRoot) 'fixtures'
    if (-not (Test-Path -LiteralPath $fixturesDir)) {
        New-Item -ItemType Directory -Path $fixturesDir -Force | Out-Null
    }

    $path = Join-Path $fixturesDir 'mock-readfile.json'
    if (-not (Test-Path -LiteralPath $path)) {
        Write-CompileVerifyUtf8File -Path $path -Content '{"ok":true,"data":[]}'
    }

    return [System.IO.Path]::GetFullPath($path)
}

function Write-CompileVerifyReadFileMockProfile {
    param([string] $CaseDir)

    $fixturePath = Get-CompileVerifyMockReadFileFixturePath
    $profile = [ordered]@{
        id          = 'subprogram-external-readfile-stub'
        version     = 1
        mocks       = [ordered]@{
            subPrograms = [ordered]@{ stubExternal = $true }
            files       = [ordered]@{
                seed = @(
                    [ordered]@{
                        path    = $fixturePath
                        content = '{"ok":true,"data":[]}'
                    }
                )
            }
        }
        initialVars = [ordered]@{
            filePath = $fixturePath
        }
        assertions  = [ordered]@{
            success = $true
        }
    }

    Write-CompileVerifyJsonFile -Path (Join-Path $CaseDir 'mock-profile.json') -Object $profile
}

function Test-CompileVerifyUsesRunnerHostExpression {
    param([string] $CaseDir)

    $programJson = Get-CompileVerifyCaseProgramJson -CaseDir $CaseDir
    if ([string]::IsNullOrWhiteSpace($programJson)) {
        return $false
    }

    $runnerHost = $programJson -match '\$=\s*Runner\.|Runner\.[A-Za-z_][A-Za-z0-9_]*\s*\('
    return $runnerHost `
        -or ($programJson -match 'JToken\.') `
        -or ($programJson -match 'ExpressionRunner\.') `
        -or ($programJson -match 'ViewRunner\.') `
        -or ($programJson -match 'CeaQuickerTools\.')
}
