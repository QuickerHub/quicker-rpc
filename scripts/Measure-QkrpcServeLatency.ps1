#Requires -Version 7.0
<#
.SYNOPSIS
  Measure qkrpc serve HTTP latency for common Quicker data/search ops.

.DESCRIPTION
  Requires Quicker + QuickerRpc plugin + qkrpc serve (default http://127.0.0.1:9477).
  Prints a markdown table and optional JSON report.

.EXAMPLE
  pwsh -NoProfile -File ./scripts/Measure-QkrpcServeLatency.ps1

.EXAMPLE
  pwsh -NoProfile -File ./scripts/Measure-QkrpcServeLatency.ps1 -Warmup 5 -Iterations 30 -Json | Set-Content .local/qkrpc-latency.json
#>
[CmdletBinding()]
param(
    [string] $BaseUrl = $(if ($env:QKRPC_HTTP_URL) { $env:QKRPC_HTTP_URL.TrimEnd('/') } else { 'http://127.0.0.1:9477' }),
    [int] $Warmup = $(if ($env:QUICKER_RPC_LATENCY_WARMUP) { [int]$env:QUICKER_RPC_LATENCY_WARMUP } else { 3 }),
    [int] $Iterations = $(if ($env:QUICKER_RPC_LATENCY_ITERATIONS) { [int]$env:QUICKER_RPC_LATENCY_ITERATIONS } else { 15 }),
    [string] $SearchQuery = $(if ($env:QUICKER_RPC_TEST_SEARCH_QUERY) { $env:QUICKER_RPC_TEST_SEARCH_QUERY } else { 'QuickerRpc' }),
    [string] $ActionId = $(if ($env:QUICKER_RPC_TEST_ACTION_ID) { $env:QUICKER_RPC_TEST_ACTION_ID } elseif ($env:QUICKER_RPC_TEST_SHARED_ACTION_ID) { $env:QUICKER_RPC_TEST_SHARED_ACTION_ID } else { 'f5c76108-3ce9-433f-8cd0-8f0d9c562052' }),
    [string] $StepRunnerKey = $(if ($env:QUICKER_RPC_TEST_STEP_RUNNER_KEY) { $env:QUICKER_RPC_TEST_STEP_RUNNER_KEY } else { 'sys:MsgBox' }),
    [int] $TimeoutSeconds = 20,
    [switch] $Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-Percentile {
    param([double[]] $Sorted, [double] $Percentile)
    if ($Sorted.Length -eq 1) { return $Sorted[0] }
    $position = $Percentile * ($Sorted.Length - 1)
    $lower = [int][Math]::Floor($position)
    $upper = [int][Math]::Ceiling($position)
    if ($lower -eq $upper) { return $Sorted[$lower] }
    $weight = $position - $lower
    return $Sorted[$lower] + (($Sorted[$upper] - $Sorted[$lower]) * $weight)
}

function Get-Stats {
    param([double[]] $Samples)
    $sorted = @($Samples | Sort-Object)
    $mean = ($sorted | Measure-Object -Average).Average
    $p95Index = [Math]::Max(0, [Math]::Min([int][Math]::Ceiling($sorted.Length * 0.95) - 1, $sorted.Length - 1))
    [ordered]@{
        sampleCount = $sorted.Length
        minMs       = $sorted[0]
        maxMs       = $sorted[-1]
        meanMs      = [Math]::Round($mean, 3)
        medianMs    = [Math]::Round((Get-Percentile -Sorted $sorted -Percentile 0.5), 3)
        p95Ms       = [Math]::Round($sorted[$p95Index], 3)
    }
}

function Invoke-QkrpcServe {
    param(
        [string] $Op,
        [hashtable] $InvokeArgs = @{}
    )
    $body = @{
        op             = $Op
        args           = $InvokeArgs
        timeoutSeconds = $TimeoutSeconds
    } | ConvertTo-Json -Depth 8 -Compress

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $response = Invoke-RestMethod -Uri "$BaseUrl/v1/invoke" -Method Post -Body $body -ContentType 'application/json' -TimeoutSec ($TimeoutSeconds + 5)
    $sw.Stop()

    if (-not $response.ok) {
        $code = $response.error ?? 'INVOKE_FAILED'
        $msg = $response.message ?? 'unknown'
        throw "$code`: $msg"
    }

    return [ordered]@{
        elapsedMs = [Math]::Round($sw.Elapsed.TotalMilliseconds, 3)
        data      = $response.data
    }
}

function Measure-Op {
    param(
        [string] $Name,
        [string] $Op,
        [hashtable] $InvokeArgs,
        [switch] $ColdCacheBust
    )

    $coldMs = $null
    if ($ColdCacheBust) {
        $coldArgs = @{} + $InvokeArgs
        $coldArgs['_cacheBust'] = [guid]::NewGuid().ToString('N')
        $coldMs = (Invoke-QkrpcServe -Op $Op -InvokeArgs $coldArgs).elapsedMs
    }

    for ($i = 0; $i -lt $Warmup; $i++) {
        $null = Invoke-QkrpcServe -Op $Op -InvokeArgs $InvokeArgs
    }

    $samples = [System.Collections.Generic.List[double]]::new()
    for ($i = 0; $i -lt $Iterations; $i++) {
        $samples.Add((Invoke-QkrpcServe -Op $Op -InvokeArgs $InvokeArgs).elapsedMs)
    }

    return [ordered]@{
        name      = $Name
        op        = $Op
        coldMs    = $coldMs
        stats     = Get-Stats -Samples $samples.ToArray()
    }
}

function Measure-HealthGet {
    $samples = [System.Collections.Generic.List[double]]::new()
    for ($i = 0; $i -lt $Warmup; $i++) {
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        $null = Invoke-RestMethod -Uri "$BaseUrl/health" -TimeoutSec 3
        $sw.Stop()
    }
    for ($i = 0; $i -lt $Iterations; $i++) {
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        $null = Invoke-RestMethod -Uri "$BaseUrl/health" -TimeoutSec 3
        $sw.Stop()
        $samples.Add([Math]::Round($sw.Elapsed.TotalMilliseconds, 3))
    }
    return [ordered]@{
        name   = 'health GET'
        op     = 'GET /health'
        coldMs = $null
        stats  = Get-Stats -Samples $samples.ToArray()
    }
}

$health = Invoke-RestMethod -Uri "$BaseUrl/health" -TimeoutSec 3
if (-not $health.ok) {
    throw "qkrpc serve unhealthy at $BaseUrl"
}

$resolvedActionId = $ActionId
if (-not $resolvedActionId) {
    $searchHit = Invoke-QkrpcServe -Op 'action.search' -InvokeArgs @{ query = $SearchQuery; limit = 1 }
    $resolvedActionId = $searchHit.data.payload.items[0].actionId
}
if (-not $resolvedActionId) {
    throw "No action id. Set -ActionId or QUICKER_RPC_TEST_ACTION_ID."
}

$scenarios = @(
    (Measure-HealthGet),
    (Measure-Op -Name 'ping' -Op 'ping' -InvokeArgs @{}),
    (Measure-Op -Name 'guide.search (serve-local)' -Op 'guide.search' -InvokeArgs @{ query = 'step-runner search'; limit = 8 }),
    (Measure-Op -Name 'action.search' -Op 'action.search' -InvokeArgs @{ query = $SearchQuery; limit = 10 }),
    (Measure-Op -Name 'action.get summary' -Op 'action.get' -InvokeArgs @{ id = $resolvedActionId; returnMode = 'summary' }),
    (Measure-Op -Name 'action.get full' -Op 'action.get' -InvokeArgs @{ id = $resolvedActionId; returnMode = 'full' }),
    (Measure-Op -Name 'step-runner.search' -Op 'step-runner.search' -InvokeArgs @{ query = 'clipboard'; limit = 10 } -ColdCacheBust),
    (Measure-Op -Name 'step-runner.get' -Op 'step-runner.get' -InvokeArgs @{ key = $StepRunnerKey } -ColdCacheBust),
    (Measure-Op -Name 'subprogram.search' -Op 'subprogram.search' -InvokeArgs @{ query = '子程序'; limit = 10 }),
    (Measure-Op -Name 'fa.search' -Op 'fa.search' -InvokeArgs @{ query = 'folder'; limit = 10 })
)

if ($Json) {
    $scenarios | ConvertTo-Json -Depth 8
    return
}

Write-Host ''
Write-Host "qkrpc serve latency ($BaseUrl, warmup=$Warmup iterations=$Iterations, ms)"
Write-Host ''
Write-Host '| operation | cold | p50 | p95 | mean | min | max |'
Write-Host '| --- | ---: | ---: | ---: | ---: | ---: | ---: |'
foreach ($row in $scenarios) {
    $cold = if ($null -ne $row.coldMs) { '{0:F1}' -f $row.coldMs } else { '-' }
    Write-Host ("| {0} | {1} | {2:F1} | {3:F1} | {4:F1} | {5:F1} | {6:F1} |" -f `
        $row.name, $cold, $row.stats.medianMs, $row.stats.p95Ms, $row.stats.meanMs, $row.stats.minMs, $row.stats.maxMs)
}
