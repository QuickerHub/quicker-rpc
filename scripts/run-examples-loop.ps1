# Continuous step-module examples loop: sleep first, then tick every $IntervalSeconds.
# Arm loop after running the prompt once in the agent turn (avoids double-run on startup).
# Stop: Get-Process -Id <pid> | Stop-Process
param(
  [int] $IntervalSeconds = 5
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$prompt = @'
续跑 step-module examples v2：读 docs/superpowers/plans/2026-06-10-step-module-examples-v2.md 与 docs/authoring-references/step-modules/.examples-progress.json；node scripts/step-module-examples-progress.mjs --next；若 ALL_DONE 则 npm run docs:gen 并停止本 loop。否则对本批每模块：qkrpc step-runner get、读 kc/<id>.md 与 authored/<id>.md、写 examples/<id>.md、mark-done；批末 compress-module-ref-examples.mjs。勿删改 kc/authored 正文。对话结束立即执行，不要等待用户。
'@

$payload = @{ prompt = $prompt.Trim() } | ConvertTo-Json -Compress

while ($true) {
  Start-Sleep -Seconds $IntervalSeconds
  Write-Output "AGENT_LOOP_TICK_step-module-examples $payload"
}
