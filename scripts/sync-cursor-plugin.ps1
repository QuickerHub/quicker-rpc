# Sync Cursor plugin assets from monorepo sources (generated files are gitignored).
# Usage:
#   pwsh -NoProfile -File ./scripts/sync-cursor-plugin.ps1
#   pwsh -NoProfile -File ./scripts/sync-cursor-plugin.ps1 -Check

[CmdletBinding()]
param(
    [switch]$Check
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$pluginRoot = Join-Path $repoRoot 'cursor-plugin\quicker-rpc'
$skillsSourceRoot = Join-Path $repoRoot 'docs\skills'
$rulesSource = Join-Path $repoRoot 'docs\agent-rules\qkrpc.mdc'
$versionFile = Join-Path $repoRoot 'version.json'
$pluginManifest = Join-Path $pluginRoot '.cursor-plugin\plugin.json'

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
  if (-not (Test-Path $rulesSource)) {
    $missing += 'docs/agent-rules/qkrpc.mdc'
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
$manifest.version = $cliVersion
$manifestJson = ($manifest | ConvertTo-Json -Depth 10) + "`n"

$skillsDestRoot = Join-Path $pluginRoot 'skills'
$rulesDest = Join-Path $pluginRoot 'rules\qkrpc.mdc'
$rulesContent = Read-Text $rulesSource

if ($Check) {
  Test-SourcesPresent

  $issues = @()
  if ((Read-Text $pluginManifest) -ne $manifestJson) {
    $issues += '.cursor-plugin/plugin.json (version != version.json)'
  }

  $tempRoot = Join-Path ([IO.Path]::GetTempPath()) "qkrpc-plugin-sync-check-$([Guid]::NewGuid().ToString('N').Substring(0, 8))"
  $tempPlugin = Join-Path $tempRoot 'quicker-rpc'
  New-Item -ItemType Directory -Force -Path $tempPlugin | Out-Null

  try {
    foreach ($skillName in $defaultSkills) {
      $src = Join-Path $skillsSourceRoot $skillName
      $dst = Join-Path $tempPlugin 'skills' $skillName
      Copy-Tree $src $dst
    }
    New-Item -ItemType Directory -Force -Path (Join-Path $tempPlugin 'rules') | Out-Null
    Write-Text (Join-Path $tempPlugin 'rules\qkrpc.mdc') $rulesContent

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
      $issues += 'skills/ (missing — run sync or install-cursor-plugin)'
    }

    if (-not (Test-Path $rulesDest)) {
      $issues += 'rules/qkrpc.mdc (missing — run sync)'
    }
    elseif ((Read-Text $rulesDest) -ne $rulesContent) {
      $issues += 'rules/qkrpc.mdc (stale — run sync)'
    }
  }
  finally {
    if (Test-Path $tempRoot) {
      Remove-Item -Recurse -Force $tempRoot
    }
  }

  if ($issues.Count -gt 0) {
    Write-Error "Cursor plugin assets need sync:`n  - $($issues -join "`n  - ")`nRun: pwsh -NoProfile -File ./scripts/sync-cursor-plugin.ps1"
  }

  Write-Host "Cursor plugin sources OK; local bundle matches ($cliVersion)."
  exit 0
}

Test-SourcesPresent

Write-Text $pluginManifest $manifestJson
New-Item -ItemType Directory -Force -Path (Split-Path $rulesDest -Parent) | Out-Null
Write-Text $rulesDest $rulesContent

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

Write-Host "Cursor plugin synced at $pluginRoot (version $cliVersion)"
Write-Host "Note: skills/ and rules/ are gitignored — edit docs/skills and docs/agent-rules only."
