# Verify alinko.top binding status for domestic EdgeOne project quickeragent.
# Run after adding the custom domain in Tencent console and updating DNS at Alibaba.

$ErrorActionPreference = "Stop"
$Domain = "alinko.top"
$ProjectId = "makers-ftqqzd9mnyhm"
$PresetHost = "quickeragent-hsozo4t4.edgeone.cool"

function Get-EdgeOneToken {
    $tokenFile = Get-ChildItem "$env:USERPROFILE\.edgeone" -File |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    if (-not $tokenFile) {
        throw "No EdgeOne token found. Run: edgeone login --site china"
    }
    return (Get-Content $tokenFile.FullName | ConvertFrom-Json).value.Token
}

Write-Host "==> EdgeOne custom domain (project $ProjectId)"
$token = Get-EdgeOneToken
$headers = @{
    Authorization = "Bearer $token"
    "Content-Type" = "application/json"
}
$body = @{
    Action     = "DescribePagesProjects"
    PageNumber = 1
    PageSize   = 10
    Region     = "ap-guangzhou"
    ProjectIds = @($ProjectId)
} | ConvertTo-Json -Depth 6
$resp = Invoke-RestMethod -Uri "https://pages-api.cloud.tencent.com/v1" -Method Post -Headers $headers -Body $body
$project = $resp.Data.Response.Projects[0]
$domains = @($project.CustomDomains)
if ($domains.Count -eq 0) {
    Write-Host "    [pending] No custom domain bound yet."
    Write-Host "    Console: https://console.cloud.tencent.com/edgeone/pages/project/$ProjectId/domain"
} else {
    $domains | ForEach-Object {
        Write-Host "    [ok] $($_.Domain) status=$($_.Status)"
        if ($_.Cname) { Write-Host "         CNAME target: $($_.Cname)" }
    }
}

Write-Host ""
Write-Host "==> Public DNS CNAME for $Domain"
try {
    $cname = Resolve-DnsName $Domain -Type CNAME -ErrorAction Stop
    $target = $cname[0].NameHost
    Write-Host "    $Domain -> $target"
    if ($target -match "dnsoe3\.com|edgeone") {
        Write-Host "    [ok] Points to EdgeOne"
    } else {
        Write-Host "    [warn] CNAME may be stale (old project or wrong target)"
    }
} catch {
    Write-Host "    [warn] No CNAME record found: $($_.Exception.Message)"
}

Write-Host ""
Write-Host "==> HTTPS check for https://$Domain/"
try {
    $r = Invoke-WebRequest -Uri "https://$Domain/" -UseBasicParsing -TimeoutSec 20
    Write-Host "    [ok] HTTP $($r.StatusCode) Server=$($r.Headers['Server'])"
    if ($r.Content -match "QuickerAgent|quicker-agent") {
        Write-Host "    [ok] Page content looks like QuickerAgent landing page"
    }
} catch {
    Write-Host "    [fail] $($_.Exception.Message)"
}

Write-Host ""
Write-Host "==> Preset domain (requires eo_token preview from deploy output if 401)"
Write-Host "    https://$PresetHost"
