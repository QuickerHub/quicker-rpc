# Sync Codex plugin assets from monorepo sources (generated skills are gitignored).
# Usage:
#   pwsh -NoProfile -File ./scripts/sync-codex-plugin.ps1
#   pwsh -NoProfile -File ./scripts/sync-codex-plugin.ps1 -Check

[CmdletBinding()]
param(
    [switch]$Check
)

$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot '..\publish\qkrpc-publish-lib.ps1')

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$pluginRoot = Join-Path $repoRoot 'codex-plugin\quicker-rpc'
$skillsSourceRoot = Join-Path $repoRoot 'docs\skills'
$assetsSource = Join-Path $repoRoot 'cursor-plugin\quicker-rpc\assets'
$versionFile = Resolve-QuickerRpcVersionJsonPath -MonorepoRoot $repoRoot
$pluginManifest = Join-Path $pluginRoot '.codex-plugin\plugin.json'

$defaultSkills = @(
    'qkrpc',
    'quicker-rpc-knowledge',
    'quicker-authoring',
    'quicker-eval-expression',
    'quicker-run'
)

function Copy-Tree([string]$source, [string]$dest) {
  if (-not (Test-Path $source)) {
    throw "Missing source: $source"
  }
  if (Test-Path $dest) {
    Remove-Item -Recurse -Force $dest
  }
  Copy-Item -Path $source -Destination $dest -Recurse -Force
}

function Read-Text([string]$path) {
  if (-not (Test-Path $path)) {
    throw "Missing file: $path"
  }
  return [System.IO.File]::ReadAllText($path)
}

function Write-Text([string]$path, [string]$content) {
  $dir = Split-Path $path -Parent
  if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
  }
  [System.IO.File]::WriteAllText($path, $content)
}

function Test-SourcesPresent() {
  $missing = @()
  foreach ($skillName in $defaultSkills) {
    $skillMd = Join-Path $skillsSourceRoot $skillName 'SKILL.md'
    if (-not (Test-Path $skillMd)) {
      $missing += "docs/skills/$skillName/SKILL.md"
    }
  }
  if (-not (Test-Path (Join-Path $assetsSource 'logo.png'))) {
    $missing += 'cursor-plugin/quicker-rpc/assets/logo.png (run sync-cursor-plugin or copy assets)'
  }
  if ($missing.Count -gt 0) {
    throw "Missing source assets:`n  - $($missing -join "`n  - ")"
  }
}

$versionJson = Get-Content $versionFile -Raw | ConvertFrom-Json
$cliVersion = $versionJson.QuickerRpc
if ([string]::IsNullOrWhiteSpace($cliVersion)) {
  throw "version.json missing QuickerRpc field"
}

$manifest = Get-Content $pluginManifest -Raw | ConvertFrom-Json
$parts = $cliVersion.Split('.')
if ($parts.Length -ge 3) {
  $manifest.version = ($parts[0..2] -join '.')
}
else {
  $manifest.version = $cliVersion
}
$manifestJson = ($manifest | ConvertTo-Json -Depth 10) + "`n"

$skillsDestRoot = Join-Path $pluginRoot 'skills'
$assetsDest = Join-Path $pluginRoot 'assets'

if ($Check) {
  Test-SourcesPresent

  $issues = @()
  if ((Read-Text $pluginManifest) -ne $manifestJson) {
    $issues += '.codex-plugin/plugin.json (version != version.json)'
  }

  $tempRoot = Join-Path ([IO.Path]::GetTempPath()) "qkrpc-codex-sync-check-$([Guid]::NewGuid().ToString('N').Substring(0, 8))"
  $tempPlugin = Join-Path $tempRoot 'quicker-rpc'
  New-Item -ItemType Directory -Force -Path $tempPlugin | Out-Null

  try {
    foreach ($skillName in $defaultSkills) {
      $src = Join-Path $skillsSourceRoot $skillName
      $dst = Join-Path $tempPlugin 'skills' $skillName
      Copy-Tree $src $dst
    }

    if (Test-Path $skillsDestRoot) {
      foreach ($skillName in $defaultSkills) {
        $expected = Join-Path $tempPlugin 'skills' $skillName
        $actual = Join-Path $skillsDestRoot $skillName
        if (-not (Test-Path $actual)) {
          $issues += "skills/$skillName (missing — run sync)"
          continue
        }
        $expSkill = Join-Path $expected 'SKILL.md'
        $actSkill = Join-Path $actual 'SKILL.md'
        if ((Read-Text $expSkill) -ne (Read-Text $actSkill)) {
          $issues += "skills/$skillName (stale — run sync)"
        }
      }
    }
    else {
      $issues += 'skills/ (missing — run sync)'
    }
  }
  finally {
    if (Test-Path $tempRoot) {
      Remove-Item -Recurse -Force $tempRoot
    }
  }

  if ($issues.Count -gt 0) {
    Write-Error "Codex plugin assets need sync:`n  - $($issues -join "`n  - ")`nRun: pwsh -NoProfile -File ./scripts/sync-codex-plugin.ps1"
  }

  Write-Host "Codex plugin sources OK; local bundle matches ($cliVersion)."
  exit 0
}

Test-SourcesPresent

Write-Text $pluginManifest $manifestJson

if (Test-Path $assetsDest) {
  Remove-Item -Recurse -Force $assetsDest
}
Copy-Tree $assetsSource $assetsDest

if (Test-Path $skillsDestRoot) {
  Remove-Item -Recurse -Force $skillsDestRoot
}
New-Item -ItemType Directory -Force -Path $skillsDestRoot | Out-Null

foreach ($skillName in $defaultSkills) {
  $src = Join-Path $skillsSourceRoot $skillName
  $dst = Join-Path $skillsDestRoot $skillName
  Copy-Tree $src $dst
  Write-Host "synced skill: $skillName"
}

Write-Host "Codex plugin synced at $pluginRoot (version $cliVersion)"
Write-Host "Note: skills/ are gitignored — edit docs/skills only."
