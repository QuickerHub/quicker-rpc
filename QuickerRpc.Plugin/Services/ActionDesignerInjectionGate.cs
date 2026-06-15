using System;
using Microsoft.Extensions.Logging;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Designer tab injection is allowed only when the logged-in Quicker user matches the private tool owner
/// (same id as <c>qkrpc quicker.account.get</c> / <see cref="QuickerAccountAccessor.TryGetCurrentUserId"/>).
/// </summary>
internal static class ActionDesignerInjectionGate
{
    private static volatile bool _enabled;
    private static string? _ownerUserId;

    /// <summary>
    /// Authorize the current Quicker account and enable injection for this plugin session.
    /// </summary>
    public static bool TryEnableForCurrentUser(ILogger? logger = null)
    {
        var currentUserId = QuickerAccountAccessor.TryGetCurrentUserId();
        if (string.IsNullOrEmpty(currentUserId))
        {
            Disable(logger, "ActionDesigner injection skipped: Quicker account is not logged in.");
            return false;
        }

        var ownerUserId = ActionDesignerToolOwner.ResolveOwnerUserId(currentUserId, out _);
        if (string.IsNullOrEmpty(ownerUserId))
        {
            Disable(logger, "ActionDesigner injection skipped: designer tool owner is not configured.");
            return false;
        }

        if (!UserIdsMatch(ownerUserId, currentUserId))
        {
            Disable(
                logger,
                $"ActionDesigner injection denied: current user '{currentUserId}' is not the private tool owner.");
            ActionDesignerUiInjector.RemoveAllInjectedTabs();
            return false;
        }

        _ownerUserId = ownerUserId;
        _enabled = true;
        logger?.LogInformation("ActionDesigner injection authorized for private owner user {UserId}.", ownerUserId);
        return true;
    }

    /// <summary>
    /// Returns whether the watcher may register handlers / inject UI for the current account.
    /// </summary>
    public static bool CanRegisterService() => TryEnableForCurrentUser();

    public static void Disable(ILogger? logger = null, string? message = null)
    {
        _enabled = false;
        _ownerUserId = null;
        if (!string.IsNullOrEmpty(message))
        {
            logger?.LogWarning("{Message}", message);
        }
    }

    public static bool CanInject()
    {
        if (!_enabled || string.IsNullOrEmpty(_ownerUserId))
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

        var ownerUserId = ActionDesignerToolOwner.ResolveOwnerUserId(currentUserId, out _);
        if (string.IsNullOrEmpty(ownerUserId) || !UserIdsMatch(ownerUserId, currentUserId))
        {
            Disable(message: null);
            ActionDesignerUiInjector.RemoveAllInjectedTabs();
            return false;
        }

        if (!UserIdsMatch(_ownerUserId, ownerUserId))
        {
            Disable(message: null);
            ActionDesignerUiInjector.RemoveAllInjectedTabs();
            return false;
        }

        return true;
    }

    private static bool UserIdsMatch(string expected, string actual) =>
        string.Equals(expected.Trim(), actual.Trim(), StringComparison.OrdinalIgnoreCase);
}
