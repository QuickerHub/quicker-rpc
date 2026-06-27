using System.Diagnostics;
using Quicker.ActionRuntime.Abstractions;
using Quicker.ActionRuntime.Abstractions.Models;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console.ActionRuntime.Mock;

internal sealed class MockSyntheticTraceCollector
{
    private int _sequence;
    private readonly Stopwatch _stopwatch = Stopwatch.StartNew();
    private readonly List<QuickerRpcActionTraceEvent> _events = [];

    public IReadOnlyList<QuickerRpcActionTraceEvent> Events => _events;

    public void Attach(ActionExecutionPackage package)
    {
        package.Options.StepBegin = OnStepBegin;
        package.Options.StepEnd = OnStepEnd;
    }

    private void OnStepBegin(ActionStep step)
    {
        _events.Add(new QuickerRpcActionTraceEvent
        {
            Sequence = ++_sequence,
            Kind = "step_begin",
            StepRunnerKey = step.StepRunnerKey,
            Note = step.Note,
            ElapsedMs = _stopwatch.ElapsedMilliseconds,
        });
    }

    private void OnStepEnd(ActionStep step, StepResult result)
    {
        _events.Add(new QuickerRpcActionTraceEvent
        {
            Sequence = ++_sequence,
            Kind = "step_end",
            StepRunnerKey = step.StepRunnerKey,
            ElapsedMs = _stopwatch.ElapsedMilliseconds,
        });

        if (!result.IsSuccess && !string.IsNullOrWhiteSpace(result.Message))
        {
            _events.Add(new QuickerRpcActionTraceEvent
            {
                Sequence = ++_sequence,
                Kind = "error",
                StepRunnerKey = step.StepRunnerKey,
                Message = result.Message,
                ElapsedMs = _stopwatch.ElapsedMilliseconds,
            });
        }
    }
}
