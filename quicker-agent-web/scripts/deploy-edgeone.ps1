# Build and deploy QuickerAgent landing page to EdgeOne Makers (domestic Tencent Cloud).
# Prerequisites: npm install -g edgeone@latest && edgeone login --site china
# Custom domain alinko.top requires domestic account real-name verification in console.

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$WebRoot = Join-Path $RepoRoot "quicker-agent-web"
$ProjectId = "makers-ftqqzd9mnyhm"
$PresetUrl = "https://quickeragent-hsozo4t4.edgeone.cool"
$ConsoleUrl = "https://console.cloud.tencent.com/edgeone/pages/project/$ProjectId/domain"

Write-Host "==> Building static site..."
node (Join-Path $WebRoot "scripts/build.mjs")

Write-Host "==> Deploying to EdgeOne project quickeragent (domestic account)..."
Push-Location $WebRoot
try {
    # -a overseas: no ICP filing required for custom domain (mainland preset URL may 401)
    edgeone pages deploy dist -n quickeragent -a overseas
} finally {
    Pop-Location
}

Write-Host "==> Done. Preset URL: $PresetUrl"
Write-Host "    Console: $ConsoleUrl"
Write-Host "    Custom domain alinko.top: add in Domain Management, then update DNS CNAME."
