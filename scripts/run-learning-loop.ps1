# Continuous step-module learning loop: sleep first, then tick every $IntervalSeconds.
# Arm loop after running the prompt once in the agent turn (avoids double-run on startup).
# Stop: Get-Process -Id <pid> | Stop-Process
param(
  [int] $IntervalSeconds = 5
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$prompt = @'
续跑 step-module learning：读 docs/superpowers/plans/2026-06-13-step-module-learning.md 与 docs/authoring-references/step-modules/.learning-progress.json；node scripts/step-module-learning-progress.mjs --next；若 ALL_DONE 则 npm run docs:modules:gen && npm run docs:gen 并停止本 loop。否则对本批每模块执行单模块学习协议 P1–P5：step-runner get（逐 controlField）、读 kc/<id>.md 与 examples/<id>.md、无增量则 --mark-skip --reason、必要时 __module_learning__ 临时动作实跑验证（用后即删）、写 authored/<id>.md 并 --mark-done。勿改 kc/ 与 examples/ 正文。对话结束立即执行，不要等待用户。
'@

$payload = @{ prompt = $prompt.Trim() } | ConvertTo-Json -Compress

while ($true) {
  Start-Sleep -Seconds $IntervalSeconds
  Write-Output "AGENT_LOOP_TICK_step-module-learning $payload"
}
