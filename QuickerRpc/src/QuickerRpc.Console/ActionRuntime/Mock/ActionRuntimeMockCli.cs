using System.Text.Json;
using QuickerRpc.Console.ActionRuntime.Mock;

namespace QuickerRpc.Console.ActionRuntime.Mock;

internal static class ActionRuntimeMockCli
{
    internal static int Run(
        ActionRuntimePackageBuilder.BuildResult buildResult,
        MockProfileDocument profile,
        string profileLabel,
        bool json,
        bool runAssertions)
    {
        var outcome = ActionRuntimeMockRunner.Execute(
            buildResult,
            profile,
            profileLabel,
            runAssertions);

        if (json)
        {
            global::System.Console.WriteLine(
                JsonSerializer.Serialize(outcome.Payload, QkrpcJson.CliOutput));
        }
        else if (outcome.Ok)
        {
            global::System.Console.WriteLine($"mock-run ok ({profileLabel})");
        }
        else
        {
            WriteHumanError(outcome);
        }

        return outcome.ExitCode;
    }

    internal static int ListProfiles(bool json)
    {
        var ids = MockProfileLoader.ListProfileIds();
        if (json)
        {
            global::System.Console.WriteLine(JsonSerializer.Serialize(
                ActionRuntimeMockRunner.BuildProfilesListPayload(),
                QkrpcJson.CliOutput));
        }
        else
        {
            foreach (var id in ids)
            {
                global::System.Console.WriteLine(id);
            }
        }

        return ExitCodes.Success;
    }

    private static void WriteHumanError(MockRunExecuteResult outcome)
    {
        global::System.Console.Error.WriteLine(outcome.ErrorMessage ?? "mock-run failed.");
        if (outcome.Payload is null)
        {
            return;
        }

        try
        {
            var json = JsonSerializer.Serialize(outcome.Payload);
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.TryGetProperty("assertions", out var assertions)
                && assertions.TryGetProperty("failures", out var failures))
            {
                foreach (var failure in failures.EnumerateArray())
                {
                    var code = failure.TryGetProperty("code", out var codeEl) ? codeEl.GetString() : "ASSERT";
                    var message = failure.TryGetProperty("message", out var msgEl) ? msgEl.GetString() : string.Empty;
                    global::System.Console.Error.WriteLine($"{code}: {message}");
                }
            }
        }
        catch
        {
            // Best-effort human output only.
        }
    }
}
