using System.Text;
using System.Text.Json;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console;

internal static class ActionTraceCli
{
    public static ActionTraceClientCallbacks CreateCallbacks(bool jsonOutput, string? traceFilePath = null) =>
        new(jsonOutput, traceFilePath);

    public static void WriteTraceEvent(
        QuickerRpcActionTraceEvent traceEvent,
        bool jsonOutput,
        TextWriter? extraSink = null)
    {
        if (jsonOutput)
        {
            global::System.Console.Error.WriteLine(JsonSerializer.Serialize(
                new { type = "trace", trace = traceEvent },
                QkrpcJson.CliOutput));
            return;
        }

        var line = FormatHuman(traceEvent);
        global::System.Console.Out.WriteLine(line);
        extraSink?.WriteLine(line);
    }

    public static string FormatHuman(QuickerRpcActionTraceEvent traceEvent)
    {
        var indent = new string(' ', Math.Max(0, traceEvent.Depth) * 2);
        var prefix = traceEvent.Kind switch
        {
            "step_begin" => ">",
            "step_end" => "<",
            "group_begin" => "[+",
            "group_end" => "[-",
            "repeat_begin" => "~",
            "repeat_end" => "~",
            "input" => " in",
            "output" => "out",
            "info" => " .",
            "warning" => " !",
            "error" => " X",
            "var_state" => "var",
            _ => " .",
        };

        var head = traceEvent.Kind switch
        {
            "step_begin" => BuildStepHead(traceEvent),
            "input" => BuildInputHead(traceEvent),
            "output" => BuildOutputHead(traceEvent),
            "var_state" => $"{{{traceEvent.VarKey}}}={traceEvent.ParamValue}",
            _ => traceEvent.Message ?? traceEvent.Note ?? traceEvent.Kind,
        };

        var elapsed = traceEvent.ElapsedMs > 0 ? $" +{traceEvent.ElapsedMs}ms" : string.Empty;
        return $"{indent}{prefix} {head}{elapsed}";
    }

    private static string BuildStepHead(QuickerRpcActionTraceEvent traceEvent)
    {
        var name = !string.IsNullOrWhiteSpace(traceEvent.StepRunnerName)
            ? traceEvent.StepRunnerName
            : traceEvent.StepRunnerKey ?? "step";
        if (!string.IsNullOrWhiteSpace(traceEvent.Note))
        {
            return $"{name} - {traceEvent.Note}";
        }

        return name;
    }

    private static string BuildInputHead(QuickerRpcActionTraceEvent traceEvent)
    {
        var key = traceEvent.ParamKey ?? "param";
        if (!string.IsNullOrWhiteSpace(traceEvent.ParamExpression)
            && traceEvent.ParamExpression != traceEvent.ParamValue)
        {
            return $"{key}: {traceEvent.ParamExpression} => {traceEvent.ParamValue}";
        }

        return $"{key}={traceEvent.ParamValue}";
    }

    private static string BuildOutputHead(QuickerRpcActionTraceEvent traceEvent)
    {
        var key = traceEvent.ParamKey ?? "out";
        var target = !string.IsNullOrWhiteSpace(traceEvent.VarName) ? traceEvent.VarName : key;
        return $"{target}={traceEvent.ParamValue}";
    }
}

internal sealed class ActionTraceClientCallbacks : IQuickerRpcClientCallbacks, IAsyncDisposable
{
    private readonly bool _jsonOutput;
    private readonly StreamWriter? _traceFile;

    public ActionTraceClientCallbacks(bool jsonOutput, string? traceFilePath = null)
    {
        _jsonOutput = jsonOutput;
        if (!jsonOutput && !string.IsNullOrWhiteSpace(traceFilePath))
        {
            _traceFile = new StreamWriter(traceFilePath, append: false, new UTF8Encoding(false)) { AutoFlush = true };
        }
    }

    public int StreamedCount { get; private set; }

    internal TextWriter? ExtraSink => _traceFile;

    public ValueTask DisposeAsync()
    {
        _traceFile?.Dispose();
        return ValueTask.CompletedTask;
    }

    public Task ActionTraceEventAsync(QuickerRpcActionTraceEvent traceEvent)
    {
        StreamedCount++;
        ActionTraceCli.WriteTraceEvent(traceEvent, _jsonOutput, _traceFile);
        return Task.CompletedTask;
    }
}
