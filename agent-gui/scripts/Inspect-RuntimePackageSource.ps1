[CmdletBinding(DefaultParameterSetName='Inspect')]
param(
    [Parameter(Mandatory, ParameterSetName='Inspect')][string]$PathsJson,
    [Parameter(ParameterSetName='Inspect')][string]$TreeRoot,
    [Parameter(Mandatory, ParameterSetName='Worker')][string]$SessionDirectory,
    [Parameter(Mandatory, ParameterSetName='Worker')][int]$ParentProcessId
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($PSCmdlet.ParameterSetName -eq 'Worker') {
    $scriptFile = $PSCommandPath
    $session = [IO.Path]::GetFullPath($SessionDirectory)
    $temporary = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..\.tmp'))
    if (-not [IO.Path]::IsPathFullyQualified($SessionDirectory) -or
        [IO.Path]::GetDirectoryName($session) -ne $temporary -or
        -not [IO.Path]::GetFileName($session).StartsWith('runtime-package-metadata-')) { throw 'Invalid metadata worker session' }
    function Assert-WorkerPath([string]$Path, [switch]$File) {
        if ($Path -match '(?i)(^|[\\/])(OneDrive[^\\/]*|Dropbox|iCloud[^\\/]*)([\\/]|$)' -or $Path.StartsWith('\\')) { throw 'Unsafe metadata worker path' }
        $ancestors = [Collections.Generic.Stack[string]]::new()
        for ($cursor = $Path; $cursor; $cursor = [IO.Path]::GetDirectoryName($cursor)) { $ancestors.Push($cursor) }
        while ($ancestors.Count -gt 0) {
            $cursor = $ancestors.Pop()
            $item = Get-Item -LiteralPath $cursor -Force -ErrorAction Stop
            if (([long]$item.Attributes -band (0x400 -bor 0x1000 -bor 0x40000 -bor 0x400000)) -ne 0) { throw 'Unsafe metadata worker attributes' }
            if ($cursor -eq $Path -and $File) { if ($item.PSIsContainer) { throw 'Metadata packet is a directory' } }
            elseif (-not $item.PSIsContainer) { throw 'Metadata session ancestor is not a directory' }
        }
    }
    function Write-WorkerPacket([string]$Name, $Value) {
        Assert-WorkerPath $session
        $pending = Join-Path $session ".$Name.tmp"
        $final = Join-Path $session $Name
        $bytes = [Text.Encoding]::UTF8.GetBytes(($Value | ConvertTo-Json -Depth 8 -Compress))
        $stream = [IO.FileStream]::new($pending, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
        [IO.File]::Move($pending, $final)
    }
    Assert-WorkerPath $session
    $parent = [Diagnostics.Process]::GetProcessById($ParentProcessId)
    $null = $parent.Handle
    try {
        Write-WorkerPacket 'ready.json' @{ ok=$true; workerPid=$PID; parentPid=$ParentProcessId }
        $number = 1
        while (-not $parent.HasExited) {
            Assert-WorkerPath $session
            $requestFile = Join-Path $session "request-$number.json"
            try { $requestItem = Get-Item -LiteralPath $requestFile -Force -ErrorAction Stop }
            catch [System.Management.Automation.ItemNotFoundException] { Start-Sleep -Milliseconds 10; continue }
            Assert-WorkerPath $requestFile -File
            if ($requestItem.Length -gt 1MB) { throw 'Metadata request is too large' }
            $request = [IO.File]::ReadAllText($requestFile) | ConvertFrom-Json -AsHashtable
            if ($request.id -ne $number -or $request.pathsJson -isnot [string]) { throw 'Invalid metadata request' }
            try {
                if ($request.treeRoot) { $output = & $scriptFile -PathsJson $request.pathsJson -TreeRoot $request.treeRoot }
                else { $output = & $scriptFile -PathsJson $request.pathsJson }
                Write-WorkerPacket "response-$number.json" @{ ok=$true; id=$number; workerPid=$PID; output=($output -join "`n") }
            } catch {
                Write-WorkerPacket "response-$number.json" @{ ok=$false; id=$number; workerPid=$PID; error=$_.Exception.Message }
            }
            $number++
        }
    } finally { $parent.Dispose() }
    return
}

$count = 0
$unsafeFlags = 0x1000 -bor 0x40000 -bor 0x400000
$redirectedPaths = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)

function Assert-SourceName([string]$Path) {
    $absolute = [IO.Path]::GetFullPath($Path)
    if ($absolute.StartsWith('\\') -or $absolute -match '(?i)(^|[\\/])(OneDrive[^\\/]*|Dropbox|iCloud[^\\/]*)([\\/]|$)') { throw "Unsafe package source path: $absolute" }
    return $absolute
}

function Assert-SourceAttributes($Item) {
    if (([long]$Item.Attributes -band $unsafeFlags) -ne 0) { throw "Package source is a cloud placeholder: $($Item.FullName)" }
}

$inspectionPaths = @($PathsJson | ConvertFrom-Json)
if ($TreeRoot -and $inspectionPaths -notcontains $TreeRoot) { $inspectionPaths += $TreeRoot }
foreach ($candidate in $inspectionPaths) {
    $absolute = Assert-SourceName $candidate
    $ancestors = [Collections.Generic.Stack[string]]::new()
    for ($cursor = $absolute; $cursor; $cursor = [IO.Path]::GetDirectoryName($cursor)) { $ancestors.Push($cursor) }
    while ($ancestors.Count -gt 0) {
        $path = $ancestors.Pop()
        try { $entry = Get-Item -LiteralPath $path -Force -ErrorAction Stop }
        catch [System.Management.Automation.ItemNotFoundException] { continue }
        Assert-SourceAttributes $entry
        $count++
        # The Node caller inspects the readlink target before requesting more
        # metadata. Never inspect descendants through an unchecked root link.
        if (([long]$entry.Attributes -band 0x400) -ne 0) {
            $null = $redirectedPaths.Add($absolute)
            break
        }
    }
}

if ($TreeRoot) {
    $root = Assert-SourceName $TreeRoot
    if ($redirectedPaths.Contains($root)) { throw "Package tree root has a redirected ancestor: $root" }
    $pending = [Collections.Generic.Stack[string]]::new()
    $pending.Push($root)
    while ($pending.Count -gt 0) {
        $folder = $pending.Pop()
        $item = Get-Item -LiteralPath $folder -Force
        Assert-SourceAttributes $item
        if (([long]$item.Attributes -band 0x400) -ne 0) { continue }
        if (-not $item.PSIsContainer) { throw "Package tree root is not a directory: $folder" }
        foreach ($entry in Get-ChildItem -LiteralPath $folder -Force) {
            if ($entry.Name -ieq 'node_modules') { continue }
            $null = Assert-SourceName $entry.FullName
            Assert-SourceAttributes $entry
            $count++
            if ($entry.PSIsContainer -and ([long]$entry.Attributes -band 0x400) -eq 0) { $pending.Push($entry.FullName) }
        }
    }
}
Write-Output "runtime-package-source-metadata-ok:$count"
