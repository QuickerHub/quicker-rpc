# Extract Quicker WPF embedded PNG assets into agent-gui/public/ActionDesignerIcons/.
# Source: Quicker.exe manifest resource Quicker.g.resources (keys like assets/var/text.png).
param(
    [string]$QuickerExe = "C:\Program Files\Quicker\Quicker.exe",
    [string]$OutRoot = (Join-Path $PSScriptRoot "..\public\ActionDesignerIcons")
)

if (-not (Test-Path $QuickerExe)) {
    Write-Error "Quicker.exe not found: $QuickerExe"
    exit 1
}

$prefixes = @(
    "assets/var/"
)

$asm = [Reflection.Assembly]::LoadFrom($QuickerExe)
$rs = $asm.GetManifestResourceStream("Quicker.g.resources")
if (-not $rs) {
    Write-Error "Quicker.g.resources not found in $QuickerExe"
    exit 1
}

$reader = New-Object System.Resources.ResourceReader($rs)
$count = 0
foreach ($entry in $reader) {
    $key = [string]$entry.Key
    $matched = $false
    foreach ($p in $prefixes) {
        if ($key.StartsWith($p, [StringComparison]::OrdinalIgnoreCase)) {
            $matched = $true
            break
        }
    }
    if (-not $matched) { continue }

    $rel = $key.Substring("assets/".Length) -replace '\\', '/'
    $dest = Join-Path $OutRoot ($rel -replace '/', [IO.Path]::DirectorySeparatorChar)
    $dir = Split-Path $dest -Parent
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }

    $s = [IO.Stream]$entry.Value
    $buf = New-Object byte[] $s.Length
    [void]$s.Read($buf, 0, $buf.Length)
    [IO.File]::WriteAllBytes($dest, $buf)
    $count++
}
$reader.Close()

Write-Host "Extracted $count icon(s) to $OutRoot"
