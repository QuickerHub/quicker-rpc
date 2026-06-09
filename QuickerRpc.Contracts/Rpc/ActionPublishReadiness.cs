using System;
using System.Collections.Generic;
using System.Linq;

namespace QuickerRpc.Contracts.Rpc;

/// <summary>Structured publish/update readiness checks shared by preflight and publish.</summary>
public static class ActionPublishReadiness
{
    public const string ModePublish = "publish";
    public const string ModeUpdate = "update";

    public sealed class Context
    {
        public string Mode { get; set; } = ModePublish;

        public string? RequestTitle { get; set; }

        public string? RequestDescription { get; set; }

        public string? ActionTitle { get; set; }

        public string? ActionDescription { get; set; }

        public string? ActionIcon { get; set; }

        public bool IsPublic { get; set; } = true;

        public string? ChangeLog { get; set; }

        public bool UseTemplate { get; set; }

        public string? TemplateId { get; set; }

        public bool HasWebConnector { get; set; } = true;

        public bool HasActionEditMgr { get; set; } = true;

        public string? EmbedSubProgramsError { get; set; }
    }

    public static ActionPublishReadinessResult Evaluate(Context context)
    {
        var issues = new List<QuickerRpcActionPublishIssue>();
        var mode = string.Equals(context.Mode, ModeUpdate, StringComparison.OrdinalIgnoreCase)
            ? ModeUpdate
            : ModePublish;

        if (string.Equals(mode, ModeUpdate, StringComparison.OrdinalIgnoreCase))
        {
            if (string.IsNullOrWhiteSpace(context.ChangeLog))
            {
                issues.Add(Issue(
                    "MISSING_CHANGELOG",
                    "changelog",
                    "Change log is required when updating a shared action (--changelog or --changelog-file)."));
            }
        }
        else
        {
            if (!context.HasWebConnector)
            {
                issues.Add(Issue(
                    "WEBCONNECTOR_UNAVAILABLE",
                    "environment",
                    "Not running inside Quicker (WebConnector unavailable)."));
            }

            if (!context.HasActionEditMgr)
            {
                issues.Add(Issue(
                    "ACTION_EDIT_MGR_UNAVAILABLE",
                    "environment",
                    "Not running inside Quicker (ActionEditMgr unavailable)."));
            }

            if (context.UseTemplate && !string.IsNullOrWhiteSpace(context.TemplateId))
            {
                issues.Add(Issue(
                    "UNMODIFIED_SHARED_INSTALL",
                    "action",
                    "This action is an unmodified shared action install. Share the original action instead."));
            }

            var title = FirstNonEmpty(context.RequestTitle, context.ActionTitle);
            if (string.IsNullOrWhiteSpace(title))
            {
                issues.Add(Issue(
                    "MISSING_TITLE",
                    "title",
                    "Title is required (--title or action set-metadata title)."));
            }

            var description = FirstNonEmpty(context.RequestDescription, context.ActionDescription);
            if (string.IsNullOrWhiteSpace(description))
            {
                issues.Add(Issue(
                    "MISSING_DESCRIPTION",
                    "description",
                    "Description is required (--description or action set-metadata description)."));
            }

            if (context.IsPublic && !HasPublishableIcon(context.ActionIcon))
            {
                issues.Add(Issue(
                    "MISSING_ICON",
                    "icon",
                    "Public share requires a custom icon (fa:Light_* or image URL). Set via action set-metadata or patch."));
            }

            if (!string.IsNullOrWhiteSpace(context.EmbedSubProgramsError))
            {
                issues.Add(Issue(
                    "EMBED_SUBPROGRAMS_FAILED",
                    "program",
                    "Failed to embed global subprograms: " + context.EmbedSubProgramsError));
            }
        }

        var ready = issues.Count == 0;
        return new ActionPublishReadinessResult
        {
            Ready = ready,
            Mode = mode,
            Title = FirstNonEmpty(context.RequestTitle, context.ActionTitle),
            Description = FirstNonEmpty(context.RequestDescription, context.ActionDescription),
            Icon = NullIfEmpty(context.ActionIcon),
            IsPublic = context.IsPublic,
            Issues = issues,
            Message = ready
                ? "Ready to publish."
                : string.Join("; ", issues.Select(i => i.Message)),
        };
    }

    private static QuickerRpcActionPublishIssue Issue(string code, string field, string message) =>
        new()
        {
            Code = code,
            Field = field,
            Message = message,
            Severity = "error",
        };

    private static bool HasPublishableIcon(string? icon) =>
        !string.IsNullOrWhiteSpace(icon)
        && !icon.Contains("_system", StringComparison.OrdinalIgnoreCase);

    private static string? FirstNonEmpty(string? preferred, string? fallback)
    {
        if (!string.IsNullOrWhiteSpace(preferred))
        {
            return preferred.Trim();
        }

        return NullIfEmpty(fallback);
    }

    private static string? NullIfEmpty(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}

public sealed class ActionPublishReadinessResult
{
    public bool Ready { get; set; }

    public string Mode { get; set; } = ActionPublishReadiness.ModePublish;

    public string Message { get; set; } = string.Empty;

    public string? Title { get; set; }

    public string? Description { get; set; }

    public string? Icon { get; set; }

    public bool IsPublic { get; set; }

    public IReadOnlyList<QuickerRpcActionPublishIssue> Issues { get; set; } =
        Array.Empty<QuickerRpcActionPublishIssue>();
}

public sealed class QuickerRpcActionPublishIssue
{
    public string Code { get; set; } = string.Empty;

    public string Field { get; set; } = string.Empty;

    public string Message { get; set; } = string.Empty;

    public string Severity { get; set; } = "error";
}

public sealed class QuickerRpcActionPublishPreflightResult
{
    public bool Ready { get; set; }

    public string Mode { get; set; } = ActionPublishReadiness.ModePublish;

    public string Message { get; set; } = string.Empty;

    public string? ActionId { get; set; }

    public string? SharedActionId { get; set; }

    public string? Title { get; set; }

    public string? Description { get; set; }

    public string? Icon { get; set; }

    public bool IsPublic { get; set; }

    public IReadOnlyList<QuickerRpcActionPublishIssue> Issues { get; set; } =
        Array.Empty<QuickerRpcActionPublishIssue>();
}
