using System;
using Microsoft.Extensions.Logging;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Designer tab injection: AI chat tab for any logged-in Quicker user; advanced tools tab for the private owner only.
/// </summary>
internal static class ActionDesignerInjectionGate
{
    private static volatile bool _watcherEnabled;

    /// <summary>
    /// Enable the designer watcher when a Quicker account is logged in.
    /// </summary>
    public static bool TryEnableWatcher(ILogger? logger = null)
    {
        var currentUserId = QuickerAccountAccessor.TryGetCurrentUserId();
        if (string.IsNullOrEmpty(currentUserId))
        {
            Disable(logger, "ActionDesigner injection skipped: Quicker account is not logged in.");
            return false;
        }

        _watcherEnabled = true;
        logger?.LogInformation("ActionDesigner watcher enabled for Quicker user {UserId}.", currentUserId);
        return true;
    }

    /// <summary>Alias for <see cref="TryEnableWatcher"/>.</summary>
    public static bool CanRegisterService() => TryEnableWatcher();

    public static void Disable(ILogger? logger = null, string? message = null)
    {
        _watcherEnabled = false;
        if (!string.IsNullOrEmpty(message))
        {
            logger?.LogWarning("{Message}", message);
        }
    }

    /// <summary>QuickerAgent chat tab — any logged-in user.</summary>
    public static bool CanInjectChatTab()
    {
        if (!_watcherEnabled)
        {
            return false;
        }

        var currentUserId = QuickerAccountAccessor.TryGetCurrentUserId();
        if (string.IsNullOrEmpty(currentUserId))
        {
            Disable(message: null);
            ActionDesignerUiInjector.RemoveAllInjectedTabs();
            return false;
        }

        return true;
    }

    /// <summary>Advanced QuickerRpc tools tab — private owner only.</summary>
    public static bool CanInjectToolsTab()
    {
        if (!CanInjectChatTab())
        {
            return false;
        }

        var currentUserId = QuickerAccountAccessor.TryGetCurrentUserId();
        var ownerUserId = ActionDesignerToolOwner.ResolveOwnerUserId(currentUserId, out _);
        if (string.IsNullOrEmpty(ownerUserId) || !UserIdsMatch(ownerUserId, currentUserId))
        {
            ActionDesignerUiInjector.RemoveToolsTabs();
            return false;
        }

        return true;
    }

    /// <summary>Owner-only: auto-select the QuickerRpc tools tab when Action Designer opens.</summary>
    public static bool ShouldAutoSelectToolsTabOnOpen() => CanInjectToolsTab();

    /// <summary>Advanced designer features (tools tab, global subprogram hooks).</summary>
    public static bool CanInject() => CanInjectToolsTab();

    private static bool UserIdsMatch(string expected, string actual) =>
        string.Equals(expected.Trim(), actual.Trim(), StringComparison.OrdinalIgnoreCase);
}
