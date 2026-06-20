# Analyze QuickerAgent chat export(s) for prompt/tool/skill optimization.
#
# Examples:
#   pwsh -NoProfile -File ./scripts/Invoke-AgentSessionAnalysis.ps1 -Latest
#   pwsh -NoProfile -File ./scripts/Invoke-AgentSessionAnalysis.ps1 -ExportPath "C:\...\quicker-agent-*.json"
#   pwsh -NoProfile -File ./scripts/Invoke-AgentSessionAnalysis.ps1 -Latest -Json -OutFile .local/session-analysis.md

[CmdletBinding()]
param(
    [string] $ExportPath = '',

    [switch] $Latest,

    [string] $ExportsDir = '',

    [switch] $Json,

    [string] $OutFile = ''
)

$ErrorActionPreference = 'Stop'

function Resolve-DefaultExportsDir {
    if ($ExportsDir) {
        return (Resolve-Path -LiteralPath $ExportsDir).Path
    }
    $appData = [Environment]::GetFolderPath('ApplicationData')
    return Join-Path $appData 'QuickerAgent\exports'
}

function Resolve-LatestExportFile {
    param([string] $Dir)
    if (-not (Test-Path -LiteralPath $Dir)) {
        throw "Exports directory not found: $Dir"
    }
    $files = Get-ChildItem -LiteralPath $Dir -Filter 'quicker-agent-*.json' -File |
        Sort-Object LastWriteTime -Descending
    if ($files.Count -eq 0) {
        throw "No quicker-agent-*.json in $Dir — export a thread from QuickerAgent chat first."
    }
    return $files[0].FullName
}

$repoRoot = Split-Path $PSScriptRoot -Parent
$guiDir = Join-Path $repoRoot 'agent-gui'
if (-not (Test-Path $guiDir)) {
    throw "Missing $guiDir — run from quicker-rpc repo root."
}

$resolvedExport = $ExportPath
if (-not $resolvedExport) {
    if (-not $Latest) {
        throw @"
Specify -ExportPath <file.json> or -Latest to analyze the newest export under:
  $(Resolve-DefaultExportsDir)
"@
    }
    $dir = Resolve-DefaultExportsDir
    $resolvedExport = Resolve-LatestExportFile -Dir $dir
    Write-Host "Using latest export: $resolvedExport" -ForegroundColor DarkGray
}

if (-not (Test-Path -LiteralPath $resolvedExport)) {
    throw "Export file not found: $resolvedExport"
}

Push-Location $guiDir
try {
    $args = @('agent-session', '--', $resolvedExport)
    if ($Json) { $args += '--json' }

    if ($OutFile) {
        $outPath = if ([System.IO.Path]::IsPathRooted($OutFile)) {
            $OutFile
        } else {
            Join-Path $repoRoot $OutFile
        }
        $outDir = Split-Path $outPath -Parent
        if ($outDir -and -not (Test-Path -LiteralPath $outDir)) {
            New-Item -ItemType Directory -Path $outDir -Force | Out-Null
        }
        pnpm @args | Set-Content -LiteralPath $outPath -Encoding utf8
        Write-Host "Report written: $outPath" -ForegroundColor Green
    } else {
        pnpm @args
    }
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
