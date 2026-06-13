# Continuous action-level learning loop: sleep first, then tick every $IntervalSeconds.
# Arm loop after running /learn-authoring once in the agent turn (avoids double-run on startup).
# Stop: Get-Process -Id <pid> | Stop-Process
param(
  [int] $IntervalSeconds = 5
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$prompt = @'
续跑 action-level learning：读 docs/superpowers/plans/2026-06-13-quicker-action-authoring-learning.md 与 docs/authoring-references/action-patterns/.learning-progress.json；node scripts/action-authoring-learning-progress.mjs --next；若 ALL_DONE 则汇报 backlog 建议并停止 loop。否则按 batch 中每项 type 执行 .cursor/commands/learn-authoring.md 协议（library-exemplar / pattern-distill / skill-promote / pattern-enrich / sdk-benchmark）。硬规则：step-runner get 后再写 inputParams；磁盘 patch 非内联；动作库只读；mock assert 通过再 mark-done。临时动作仅 __pattern_learning__* / __bench_*，用后即删。批末 npm run docs:gen（若改了 skill src）。对话结束立即执行，不要等待用户。
'@

$payload = @{ prompt = $prompt.Trim() } | ConvertTo-Json -Compress

while ($true) {
  Start-Sleep -Seconds $IntervalSeconds
  Write-Output "AGENT_LOOP_TICK_action-authoring-learning $payload"
}
