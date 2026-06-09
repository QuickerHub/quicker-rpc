using System;
using System.Collections.Generic;
using System.Threading;
using Quicker.Domain;
using Quicker.Domain.Actions.X;
using QuickerRpc.AgentModel.Search;
using QuickerRpc.Plugin.Reflection;

namespace QuickerRpc.Plugin.Services.Search;

/// <summary>
/// Background, cancellable index builds for action/subprogram search regions.
/// Builds run on the Quicker UI dispatcher at background priority in small batches.
/// </summary>
public sealed class AgentSearchIndexCoordinator
{
    private readonly AgentSearchHub _hub;
    private readonly object _sync = new();
    private readonly Dictionary<SearchRegion, RegionState> _regions = new();

    public AgentSearchIndexCoordinator(AgentSearchHub hub)
    {
        _hub = hub ?? throw new ArgumentNullException(nameof(hub));
    }

    public AgentSearchIndexStatus GetStatus(SearchRegion region)
    {
        lock (_sync)
        {
            if (_hub.IsPublished(region))
            {
                return AgentSearchIndexStatus.Ready;
            }

            return GetState(region).BuildScheduled
                ? AgentSearchIndexStatus.Building
                : AgentSearchIndexStatus.Missing;
        }
    }

    public bool IsReady(SearchRegion region) => _hub.IsPublished(region);

    public void ScheduleBuild(SearchRegion region)
    {
        if (region is not (SearchRegion.Action or SearchRegion.SubProgram))
        {
            return;
        }

        long generation;
        CancellationToken cancellationToken;
        lock (_sync)
        {
            if (_hub.IsPublished(region))
            {
                return;
            }

            var state = GetState(region);
            if (state.BuildScheduled)
            {
                return;
            }

            state.BuildScheduled = true;
            state.BuildStartedUtcMs = UtcNowMs();
            state.BuildCompletedUtcMs = null;
            state.Cts?.Cancel();
            state.Cts?.Dispose();
            state.Cts = new CancellationTokenSource();
            generation = state.Generation;
            cancellationToken = state.Cts.Token;
            ResetActionBuildState(state);
        }

        if (region == SearchRegion.Action)
        {
            StartActionBuild(generation, cancellationToken);
        }
        else
        {
            StartSubProgramBuild(generation, cancellationToken);
        }
    }

    public void Invalidate(SearchRegion region)
    {
        if (region is not (SearchRegion.Action or SearchRegion.SubProgram))
        {
            return;
        }

        CancellationTokenSource? cts;
        lock (_sync)
        {
            var state = GetState(region);
            state.Generation++;
            state.BuildScheduled = false;
            cts = state.Cts;
            state.Cts = null;
            ResetActionBuildState(state);
        }

        cts?.Cancel();
        cts?.Dispose();
        _hub.Invalidate(region);
        ScheduleBuild(region);
    }

    public void InvalidateAction() => Invalidate(SearchRegion.Action);

    public void InvalidateSubProgram() => Invalidate(SearchRegion.SubProgram);

    public void RebuildAll()
    {
        Invalidate(SearchRegion.Action);
        Invalidate(SearchRegion.SubProgram);
    }

    public IReadOnlyList<SearchIndexRegionDiagnostics> GetDiagnostics()
    {
        lock (_sync)
        {
            return new[]
            {
                CreateDiagnostics(SearchRegion.Action),
                CreateDiagnostics(SearchRegion.SubProgram),
            };
        }
    }

    public void CancelAllBuilds()
    {
        CancellationTokenSource? actionCts;
        CancellationTokenSource? subProgramCts;
        lock (_sync)
        {
            actionCts = CancelBuildLocked(SearchRegion.Action);
            subProgramCts = CancelBuildLocked(SearchRegion.SubProgram);
        }

        actionCts?.Cancel();
        actionCts?.Dispose();
        subProgramCts?.Cancel();
        subProgramCts?.Dispose();
    }

    private CancellationTokenSource? CancelBuildLocked(SearchRegion region)
    {
        var state = GetState(region);
        state.Generation++;
        state.BuildScheduled = false;
        var cts = state.Cts;
        state.Cts = null;
        ResetActionBuildState(state);
        return cts;
    }

    private void StartActionBuild(long generation, CancellationToken cancellationToken)
    {
        if (!QuickerInternalAccess.IsInQuicker)
        {
            ClearBuildScheduled(SearchRegion.Action);
            return;
        }

        List<SearchDocument> buffer;
        IEnumerator<ActionCatalogEntry> enumerator;
        lock (_sync)
        {
            if (!IsCurrentBuild(SearchRegion.Action, generation))
            {
                ClearBuildScheduled(SearchRegion.Action);
                return;
            }

            var state = GetState(SearchRegion.Action);
            buffer = new List<SearchDocument>();
            enumerator = ActionSearchIndexPublisher.EnumerateCatalogEntries().GetEnumerator();
            state.ActionBuffer = buffer;
            state.ActionEnumerator = enumerator;
        }

        ScheduleActionBatch(generation, cancellationToken);
    }

    private void ScheduleActionBatch(long generation, CancellationToken cancellationToken)
    {
        QuickerDispatcherInvoke.BeginOnUiThreadBackground(() =>
            ProcessActionBatch(generation, cancellationToken));
    }

    private void ProcessActionBatch(long generation, CancellationToken cancellationToken)
    {
        List<SearchDocument>? buffer;
        IEnumerator<ActionCatalogEntry>? enumerator;
        lock (_sync)
        {
            if (!IsCurrentBuild(SearchRegion.Action, generation))
            {
                ClearBuildScheduled(SearchRegion.Action);
                return;
            }

            var state = GetState(SearchRegion.Action);
            buffer = state.ActionBuffer;
            enumerator = state.ActionEnumerator;
        }

        if (buffer is null || enumerator is null)
        {
            ClearBuildScheduled(SearchRegion.Action);
            return;
        }

        try
        {
            var hasMore = ActionSearchIndexPublisher.TryAppendBatch(
                enumerator,
                buffer,
                ActionSearchIndexPublisher.BuildBatchSize,
                cancellationToken);

            if (hasMore)
            {
                ScheduleActionBatch(generation, cancellationToken);
                return;
            }

            CompletePublish(SearchRegion.Action, generation, buffer);
        }
        catch (OperationCanceledException)
        {
            AbandonBuild(SearchRegion.Action, generation);
        }
        catch (Exception)
        {
            AbandonBuild(SearchRegion.Action, generation);
        }
    }

    private void StartSubProgramBuild(long generation, CancellationToken cancellationToken)
    {
        if (!QuickerInternalAccess.IsInQuicker)
        {
            ClearBuildScheduled(SearchRegion.SubProgram);
            return;
        }

        QuickerDispatcherInvoke.BeginOnUiThreadBackground(() =>
        {
            if (!IsCurrentBuild(SearchRegion.SubProgram, generation))
            {
                ClearBuildScheduled(SearchRegion.SubProgram);
                return;
            }

            try
            {
                var programs = EnumerateSubPrograms();
                var documents = SubProgramSearchIndexPublisher.BuildDocuments(programs, cancellationToken);
                CompletePublish(SearchRegion.SubProgram, generation, documents);
            }
            catch (OperationCanceledException)
            {
                AbandonBuild(SearchRegion.SubProgram, generation);
            }
            catch (Exception)
            {
                AbandonBuild(SearchRegion.SubProgram, generation);
            }
        });
    }

    private void CompletePublish(SearchRegion region, long generation, IReadOnlyList<SearchDocument> documents)
    {
        lock (_sync)
        {
            if (!IsCurrentBuild(region, generation))
            {
                ClearBuildScheduled(region);
                return;
            }
        }

        if (region == SearchRegion.Action)
        {
            ActionSearchIndexPublisher.Publish(_hub, documents);
        }
        else
        {
            SubProgramSearchIndexPublisher.Publish(_hub, documents);
        }

        lock (_sync)
        {
            if (!IsCurrentBuild(region, generation))
            {
                ClearBuildScheduled(region);
                return;
            }

            var state = GetState(region);
            ResetActionBuildState(state);
            state.BuildScheduled = false;
            state.Cts?.Dispose();
            state.Cts = null;
            state.BuildCompletedUtcMs = UtcNowMs();
            if (state.BuildStartedUtcMs is long startedMs)
            {
                state.LastBuildDurationMs = state.BuildCompletedUtcMs.Value - startedMs;
            }

            state.LastDocumentCount = documents.Count;
        }
    }

    private void AbandonBuild(SearchRegion region, long generation)
    {
        lock (_sync)
        {
            if (!IsCurrentBuild(region, generation))
            {
                return;
            }

            ResetActionBuildState(GetState(region));
            ClearBuildScheduled(region);
        }
    }

    private bool IsCurrentBuild(SearchRegion region, long generation)
    {
        lock (_sync)
        {
            return GetState(region).Generation == generation;
        }
    }

    private void ClearBuildScheduled(SearchRegion region)
    {
        lock (_sync)
        {
            var state = GetState(region);
            state.BuildScheduled = false;
            state.Cts?.Dispose();
            state.Cts = null;
            ResetActionBuildState(state);
        }
    }

    private static void ResetActionBuildState(RegionState state)
    {
        state.ActionBuffer = null;
        if (state.ActionEnumerator is not null)
        {
            try
            {
                state.ActionEnumerator.Dispose();
            }
            catch
            {
                // Iterator dispose may touch Quicker assemblies; ignore during cancel/teardown.
            }

            state.ActionEnumerator = null;
        }
    }

    private static IEnumerable<SubProgram> EnumerateSubPrograms()
    {
        var accessor = DataServiceSubProgramAccessor.TryCreate();
        if (accessor is not null)
        {
            return accessor.EnumerateAll();
        }

        try
        {
            return AppState.DataService.GlobalSubPrograms;
        }
        catch
        {
            return Array.Empty<SubProgram>();
        }
    }

    private RegionState GetState(SearchRegion region)
    {
        if (!_regions.TryGetValue(region, out var state))
        {
            state = new RegionState();
            _regions[region] = state;
        }

        return state;
    }

    private SearchIndexRegionDiagnostics CreateDiagnostics(SearchRegion region)
    {
        var state = GetState(region);
        return new SearchIndexRegionDiagnostics
        {
            Region = region,
            Status = GetStatus(region),
            Generation = state.Generation,
            BuildStartedUtcMs = state.BuildStartedUtcMs,
            BuildCompletedUtcMs = state.BuildCompletedUtcMs,
            LastBuildDurationMs = state.LastBuildDurationMs,
            DocumentCount = state.LastDocumentCount,
        };
    }

    private static long UtcNowMs() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    private sealed class RegionState
    {
        public long Generation;

        public bool BuildScheduled;

        public CancellationTokenSource? Cts;

        public List<SearchDocument>? ActionBuffer;

        public IEnumerator<ActionCatalogEntry>? ActionEnumerator;

        public long? BuildStartedUtcMs;

        public long? BuildCompletedUtcMs;

        public long? LastBuildDurationMs;

        public int? LastDocumentCount;
    }
}
