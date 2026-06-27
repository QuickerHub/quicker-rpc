using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console.ActionRuntime.Mock;

internal sealed class MockTraceDiffResult
{
    public bool StepRunnerSpineMatch { get; init; }

    public IReadOnlyList<string> MockStepRunnerSpine { get; init; } = [];

    public IReadOnlyList<string> PluginStepRunnerSpine { get; init; } = [];

    public IReadOnlyList<string> MockOnlyStepRunnerKeys { get; init; } = [];

    public IReadOnlyList<string> PluginOnlyStepRunnerKeys { get; init; } = [];

    public int? FirstMismatchIndex { get; init; }
}

internal static class MockTraceDiffComparer
{
    internal static MockTraceDiffResult Compare(
        IReadOnlyList<QuickerRpcActionTraceEvent> mockEvents,
        IReadOnlyList<QuickerRpcActionTraceEvent> pluginEvents)
    {
        var mockSpine = ExtractStepRunnerSpine(mockEvents);
        var pluginSpine = ExtractStepRunnerSpine(pluginEvents);

        var mockSet = new HashSet<string>(mockSpine, StringComparer.OrdinalIgnoreCase);
        var pluginSet = new HashSet<string>(pluginSpine, StringComparer.OrdinalIgnoreCase);

        int? firstMismatch = null;
        var max = Math.Max(mockSpine.Count, pluginSpine.Count);
        for (var i = 0; i < max; i++)
        {
            var mockKey = i < mockSpine.Count ? mockSpine[i] : null;
            var pluginKey = i < pluginSpine.Count ? pluginSpine[i] : null;
            if (!string.Equals(mockKey, pluginKey, StringComparison.OrdinalIgnoreCase))
            {
                firstMismatch = i;
                break;
            }
        }

        return new MockTraceDiffResult
        {
            StepRunnerSpineMatch = firstMismatch is null && mockSpine.Count == pluginSpine.Count,
            MockStepRunnerSpine = mockSpine,
            PluginStepRunnerSpine = pluginSpine,
            MockOnlyStepRunnerKeys = mockSpine.Where(k => !pluginSet.Contains(k)).Distinct(StringComparer.OrdinalIgnoreCase).ToList(),
            PluginOnlyStepRunnerKeys = pluginSpine.Where(k => !mockSet.Contains(k)).Distinct(StringComparer.OrdinalIgnoreCase).ToList(),
            FirstMismatchIndex = firstMismatch,
        };
    }

    private static List<string> ExtractStepRunnerSpine(IReadOnlyList<QuickerRpcActionTraceEvent> events)
    {
        var spine = new List<string>();
        foreach (var traceEvent in events)
        {
            if (!string.Equals(traceEvent.Kind, "step_begin", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            if (string.IsNullOrWhiteSpace(traceEvent.StepRunnerKey))
            {
                continue;
            }

            spine.Add(traceEvent.StepRunnerKey.Trim());
        }

        return spine;
    }
}
