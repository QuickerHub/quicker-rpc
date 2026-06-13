using System.Text.Json;
using QuickerRpc.Console.ActionRuntime.Mock;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console.Serve;

internal static class ActionRuntimeMockServeOps
{
    internal static async Task<ServeInvokeResponse> RunAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken token)
    {
        MockProfileDocument profile;
        string profileLabel;
        try
        {
            profile = MockProfileLoader.Load(
                ServeJsonArgs.GetString(args, "mockProfile", "mock-profile", "profile"),
                ServeJsonArgs.GetString(args, "mockProfileFile", "mock-profile-file"));
            profileLabel = ResolveProfileLabel(args, profile);
        }
        catch (Exception ex) when (ex is FileNotFoundException or InvalidOperationException)
        {
            return Fail("MOCK_PROFILE_NOT_FOUND", ex.Message);
        }

        var runAssertions = ServeJsonArgs.GetBool(args, "assert")
            || profile.Assertions != null;

        var buildOutcome = await ActionRuntimeServeOps.BuildPackageAsync(rpc, args, token)
            .ConfigureAwait(false);
        if (buildOutcome.Error is not null)
        {
            return buildOutcome.Error;
        }

        if (!buildOutcome.Result!.Success || buildOutcome.Result.Package is null)
        {
            return Fail(
                buildOutcome.Result.ErrorCode ?? "RUNTIME_PACKAGE_BUILD_FAILED",
                buildOutcome.Result.ErrorMessage ?? "Build failed.");
        }

        var outcome = ActionRuntimeMockRunner.Execute(
            buildOutcome.Result,
            profile,
            profileLabel,
            runAssertions);

        if (outcome.Payload is null)
        {
            return Fail(outcome.ErrorCode ?? "MOCK_RUN_FAILED", outcome.ErrorMessage ?? "Mock run failed.");
        }

        return new ServeInvokeResponse
        {
            Ok = outcome.Ok,
            Data = outcome.Payload,
            Error = outcome.Ok ? null : outcome.ErrorCode,
            Message = outcome.Ok ? null : outcome.ErrorMessage,
        };
    }

    internal static ServeInvokeResponse ListProfiles()
    {
        return Ok(ActionRuntimeMockRunner.BuildProfilesListPayload());
    }

    private static string ResolveProfileLabel(JsonElement args, MockProfileDocument profile)
    {
        var explicitId = ServeJsonArgs.GetString(args, "mockProfile", "mock-profile", "profile");
        if (!string.IsNullOrWhiteSpace(explicitId))
        {
            return explicitId.Trim();
        }

        var profileFile = ServeJsonArgs.GetString(args, "mockProfileFile", "mock-profile-file");
        if (!string.IsNullOrWhiteSpace(profileFile))
        {
            return Path.GetFileNameWithoutExtension(profileFile.Trim());
        }

        return profile.Id ?? "custom";
    }

    private static ServeInvokeResponse Ok(object data) =>
        new() { Ok = true, Data = data };

    private static ServeInvokeResponse Fail(string code, string message) =>
        new() { Ok = false, Error = code, Message = message };
}
