using Quicker.Common;

namespace QuickerRpc.Plugin.Services;

/// <summary>Action fields exposed to JSON query filter/sorter scripts as <c>action</c>.</summary>
public sealed class ActionSearchScriptRow
{
    public string ActionId { get; set; } = string.Empty;

    public string Title { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    public string Icon { get; set; } = string.Empty;

    public string ProfileId { get; set; } = string.Empty;

    public string ProfileName { get; set; } = string.Empty;

    public string ExeFile { get; set; } = string.Empty;

    /// <summary>local | library | published</summary>
    public string Source { get; set; } = string.Empty;

    public string TemplateId { get; set; } = string.Empty;

    public string SharedActionId { get; set; } = string.Empty;

    public long EditMs { get; set; }

    public bool UseTemplate { get; set; }

    public int Score { get; set; }

    internal static ActionSearchScriptRow FromEntry(
        ActionCatalogEntry entry,
        long editMs,
        int score)
    {
        var action = entry.Action;
        return new ActionSearchScriptRow
        {
            ActionId = (action.Id ?? string.Empty).Trim(),
            Title = action.Title ?? string.Empty,
            Description = action.Description ?? string.Empty,
            Icon = action.Icon ?? string.Empty,
            ProfileId = (entry.Profile?.Id ?? string.Empty).Trim(),
            ProfileName = entry.Profile?.Name ?? string.Empty,
            ExeFile = entry.Profile?.ExeFile ?? string.Empty,
            Source = ActionItemSourceHelper.ResolveKindToken(action),
            TemplateId = ActionItemSourceHelper.GetTemplateId(action) ?? string.Empty,
            SharedActionId = ActionItemSourceHelper.GetSharedActionId(action) ?? string.Empty,
            EditMs = editMs,
            UseTemplate = action.UseTemplate,
            Score = score,
        };
    }
}
