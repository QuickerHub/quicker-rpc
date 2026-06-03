using System;
using System.Text;

namespace QuickerRpc.AgentModel.XAction.Project;

/// <summary>Derives human-readable directory names under <c>.quicker/actions/</c>.</summary>
public static class ActionProjectDirectoryNaming
{
    private const int MaxDirectoryNameLength = 48;

    /// <summary>Slug from action title, e.g. <c>QuickerRpc 管理</c> → <c>quickerrpc-管理</c>.</summary>
    public static string DeriveSlugFromTitle(string? title)
    {
        if (string.IsNullOrWhiteSpace(title))
        {
            return string.Empty;
        }

        var sb = new StringBuilder();
        var pendingHyphen = false;
        foreach (var ch in title.Trim())
        {
            if (char.IsWhiteSpace(ch) || ch == '_' || ch == '-')
            {
                pendingHyphen = sb.Length > 0;
                continue;
            }

            if (char.IsLetterOrDigit(ch))
            {
                if (pendingHyphen && sb.Length > 0 && sb[sb.Length - 1] != '-')
                {
                    sb.Append('-');
                }

                pendingHyphen = false;
                sb.Append(IsAsciiLetter(ch) ? char.ToLowerInvariant(ch) : ch);
                continue;
            }

            if (pendingHyphen && sb.Length > 0 && sb[sb.Length - 1] != '-')
            {
                sb.Append('-');
                pendingHyphen = false;
            }
        }

        var slug = QuickerProjectLayout.SanitizeDirectoryName(sb.ToString().Trim('-'));
        if (slug.Length > MaxDirectoryNameLength)
        {
            slug = slug.Substring(0, MaxDirectoryNameLength).TrimEnd('-');
        }

        return slug;
    }

    private static bool IsAsciiLetter(char ch) =>
        (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');

    public static string FallbackDirectoryName(string actionId)
    {
        return DirectoryNameFromActionId(actionId);
    }

    /// <summary>Directory segment under <c>.quicker/actions/</c> — the action GUID.</summary>
    public static string DirectoryNameFromActionId(string actionId)
    {
        var id = (actionId ?? string.Empty).Trim();
        if (id.Length == 0)
        {
            throw new ArgumentException("actionId is required.", nameof(actionId));
        }

        return QuickerProjectLayout.SanitizeDirectoryName(id);
    }
}
