using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Test;

/// <summary>
/// Ensures a local XAction named <see cref="Title"/> exists with steps and variables for live RPC tests.
/// </summary>
internal static class QuickerRpcRpcTestAction
{
    public const string Title = "_rpc_test";

    public const string Description = "QuickerRpc integration test fixture (auto-managed).";

    public static async Task<string> EnsureActionIdAsync(
        IQuickerRpcService rpc,
        TestContext context,
        CancellationToken cancellationToken)
    {
        var actionId = await FindExistingIdAsync(rpc, cancellationToken).ConfigureAwait(false);
        if (actionId is null)
        {
            var created = await rpc
                .CreateActionAsync(Title, Description, icon: null, profileId: null, cancellationToken)
                .ConfigureAwait(false);
            Assert.IsTrue(created.Ok, created.Message ?? "CreateAction failed.");
            Assert.IsFalse(string.IsNullOrWhiteSpace(created.ActionId), "CreateAction returned no actionId.");
            actionId = created.ActionId!.Trim();
            context.WriteLine($"Created {Title}: {actionId}");
        }
        else
        {
            context.WriteLine($"Found existing {Title}: {actionId}");
        }

        if (await HasProgramContentAsync(rpc, actionId, cancellationToken).ConfigureAwait(false))
        {
            return actionId;
        }

        context.WriteLine($"Seeding {Title} body via ApplyXActionToAction (force).");
        var bodyJson = LoadFixtureJson();
        var apply = await rpc
            .ApplyXActionToActionAsync(actionId, bodyJson, expectedEditVersion: null, force: true, cancellationToken)
            .ConfigureAwait(false);
        Assert.IsTrue(apply.Success, apply.ErrorMessage ?? "ApplyXActionToAction failed.");

        Assert.IsTrue(
            await HasProgramContentAsync(rpc, actionId, cancellationToken).ConfigureAwait(false),
            $"{Title}: body still empty after seed; reload QuickerRpc plugin (build.ps1 -t).");

        return actionId;
    }

    private static async Task<string?> FindExistingIdAsync(
        IQuickerRpcService rpc,
        CancellationToken cancellationToken)
    {
        var search = await rpc
            .SearchActionSummariesAsync(Title, maxResults: 30, scope: null, cancellationToken)
            .ConfigureAwait(false);
        if (!search.Success || search.Items is null)
        {
            return null;
        }

        return search.Items
            .Where(i => string.Equals((i.Title ?? string.Empty).Trim(), Title, StringComparison.OrdinalIgnoreCase))
            .Select(i => (i.ActionId ?? string.Empty).Trim())
            .FirstOrDefault(id => id.Length > 0);
    }

    private static async Task<bool> HasProgramContentAsync(
        IQuickerRpcService rpc,
        string actionId,
        CancellationToken cancellationToken)
    {
        var get = await rpc
            .GetCompressedActionByIdAsync(actionId, returnMode: "full", cancellationToken)
            .ConfigureAwait(false);
        if (!get.Success || string.IsNullOrWhiteSpace(get.CompressedJson))
        {
            return false;
        }

        try
        {
            var root = QuickerRpcCompressedJsonAssert.ParseRequired(get.CompressedJson);
            return QuickerRpcCompressedJsonAssert.StepCount(root) > 0
                && QuickerRpcCompressedJsonAssert.VariableCount(root) > 0;
        }
        catch
        {
            return false;
        }
    }

    private static string LoadFixtureJson()
    {
        var dir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location)
            ?? AppDomain.CurrentDomain.BaseDirectory;
        var path = Path.Combine(dir, "Fixtures", "rpc-test-xaction.json");
        Assert.IsTrue(File.Exists(path), "Missing fixture: " + path);
        return File.ReadAllText(path);
    }
}
