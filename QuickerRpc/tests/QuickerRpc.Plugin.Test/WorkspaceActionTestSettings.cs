using System;
using QuickerRpc.AgentModel.XAction.Testing;

namespace QuickerRpc.Plugin.Test;

/// <summary>Environment overrides for workspace action closed-loop tests.</summary>
internal static class WorkspaceActionTestSettings
{
    /// <summary>Fixture project folder name under <c>Fixtures/workspace-actions/</c>.</summary>
    public const string DefaultFixtureName = "smoke-evalexpression";

    public const string DepDownloadFixtureName = "dep-download-smoke";

    public static string FixtureName =>
        NullIfEmpty(Environment.GetEnvironmentVariable("QKRPC_WORKSPACE_TEST_FIXTURE"))
        ?? DefaultFixtureName;

    /// <summary>Action id or directory name under repo <c>.quicker/actions/</c> for optional live run.</summary>
    public static string? WorkspaceActionKey =>
        NullIfEmpty(Environment.GetEnvironmentVariable("QKRPC_WORKSPACE_TEST_ACTION"));

    public static string? WorkspaceRoot =>
        NullIfEmpty(Environment.GetEnvironmentVariable("QKRPC_WORKSPACE_ROOT"));

    public static string? LiveTargetActionId =>
        NullIfEmpty(Environment.GetEnvironmentVariable("QKRPC_WORKSPACE_LIVE_TARGET_ACTION_ID"));

    public static string? PackagesRoot =>
        NullIfEmpty(Environment.GetEnvironmentVariable(PackageDependencyResolver.PackagesRootEnvVar));

    private static string? NullIfEmpty(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
