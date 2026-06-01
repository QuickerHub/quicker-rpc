using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Plugin.UI;

/// <summary>Monitor grid row with human-readable last-edit time.</summary>
public sealed class ActionMonitorRow
{
    public ActionMonitorRow(QuickerRpcActionSummaryItem item) => Item = item;

    public QuickerRpcActionSummaryItem Item { get; }

    public string ActionId => Item.ActionId;

    public string Title => Item.Title;

    public string Description => Item.Description;

    public string? ProfileName => Item.ProfileName;

    public string? ExeFile => Item.ExeFile;

    public string LastEditDisplay => NaturalTimeFormat.FormatUtcIso(Item.LastEditTimeUtc);

    /// <summary>ISO UTC; used for column sort.</summary>
    public string LastEditTimeUtc => Item.LastEditTimeUtc;
}
