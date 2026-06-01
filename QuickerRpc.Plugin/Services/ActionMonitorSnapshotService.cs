using System;
using System.Collections.Generic;
using System.Linq;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Plugin.Services;

/// <summary>Loads agent-page and recently-edited action lists for the monitor window.</summary>
public sealed class ActionMonitorSnapshotService
{
    private readonly HeadlessActionProgramService _programs;

    public ActionMonitorSnapshotService(HeadlessActionProgramService programs)
    {
        _programs = programs;
    }

    public ActionMonitorSnapshot Load(int agentMaxResults = 100, int recentMaxResults = 40)
    {
        var agent = _programs.SearchActionSummaries(null, agentMaxResults, QkrpcVirtualActionHost.AgentScope);
        var recent = _programs.SearchActionSummaries(
            null,
            recentMaxResults,
            scope: null,
            sort: ActionSummarySort.LastEditApiValue);

        return new ActionMonitorSnapshot
        {
            RefreshedAt = DateTimeOffset.Now,
            AgentActions = ToItems(agent),
            RecentlyEdited = ToItems(recent),
            AgentError = agent.Success ? null : agent.ErrorMessage,
            RecentError = recent.Success ? null : recent.ErrorMessage,
        };
    }

    private static IReadOnlyList<QuickerRpcActionSummaryItem> ToItems(QuickerRpcSearchActionSummariesResult result)
    {
        if (!result.Success || result.Items is null)
        {
            return Array.Empty<QuickerRpcActionSummaryItem>();
        }

        return result.Items.ToList();
    }
}

public sealed class ActionMonitorSnapshot
{
    public DateTimeOffset RefreshedAt { get; set; }

    public IReadOnlyList<QuickerRpcActionSummaryItem> AgentActions { get; set; } =
        Array.Empty<QuickerRpcActionSummaryItem>();

    public IReadOnlyList<QuickerRpcActionSummaryItem> RecentlyEdited { get; set; } =
        Array.Empty<QuickerRpcActionSummaryItem>();

    public string? AgentError { get; set; }

    public string? RecentError { get; set; }
}
