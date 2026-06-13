using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using Quicker.Common;
using Quicker.Domain.Actions.X;

namespace QuickerRpc.Plugin.Services;

/// <summary>Find local actions whose XAction steps call a global subprogram.</summary>
internal static class ActionSubProgramCallScanner
{
    public static bool TryResolveSubProgram(
        string subProgramIdOrName,
        out SubProgram? subProgram,
        out string? callIdentifier,
        out string? error)
    {
        subProgram = null;
        callIdentifier = null;
        error = null;

        var accessor = DataServiceSubProgramAccessor.TryCreate();
        if (accessor is null)
        {
            error = "Not running inside Quicker.";
            return false;
        }

        if (!accessor.TryGetByIdOrName(subProgramIdOrName, out subProgram, out error) || subProgram is null)
        {
            error ??= $"Subprogram not found: {subProgramIdOrName}";
            return false;
        }

        callIdentifier = DataServiceSubProgramAccessor.GetCallIdentifier(subProgram);
        return true;
    }

    public static IReadOnlyList<ActionCatalogEntry> FindActionsCallingSubProgram(string subProgramIdOrName) =>
        FindActionsCallingSubProgram(subProgramIdOrName, exclusiveSubProgramOnly: false);

    public static IReadOnlyList<ActionCatalogEntry> FindActionsDedicatedToSubProgram(string subProgramIdOrName) =>
        FindActionsCallingSubProgram(subProgramIdOrName, exclusiveSubProgramOnly: true);

    public static IReadOnlyList<SubProgram> FindGlobalSubProgramsCallingSubProgram(string subProgramIdOrName) =>
        FindGlobalSubProgramsCallingSubProgram(subProgramIdOrName, exclusiveSubProgramOnly: false);

    public static IReadOnlyList<SubProgram> FindGlobalSubProgramsCallingSubProgram(
        string subProgramIdOrName,
        bool exclusiveSubProgramOnly)
    {
        if (!TryResolveSubProgram(subProgramIdOrName, out var subProgram, out var callIdentifier, out _)
            || subProgram is null)
        {
            return Array.Empty<SubProgram>();
        }

        return FindGlobalSubProgramsCallingSubProgram(subProgram, callIdentifier, exclusiveSubProgramOnly);
    }

    public static IReadOnlyList<SubProgramReferenceHit> FindAllReferences(string subProgramIdOrName)
    {
        if (!TryResolveSubProgram(subProgramIdOrName, out var subProgram, out var callIdentifier, out _)
            || subProgram is null)
        {
            return Array.Empty<SubProgramReferenceHit>();
        }

        return FindAllReferences(subProgram, callIdentifier, CancellationToken.None);
    }

    public static IReadOnlyList<SubProgramReferenceHit> FindAllReferences(
        SubProgram subProgram,
        CancellationToken cancellationToken = default)
    {
        var callIdentifier = DataServiceSubProgramAccessor.GetCallIdentifier(subProgram);
        return FindAllReferences(subProgram, callIdentifier, cancellationToken);
    }

    public static Task<IReadOnlyList<SubProgramReferenceHit>> FindAllReferencesAsync(
        SubProgram subProgram,
        CancellationToken cancellationToken = default) =>
        Task.Run(
            () => FindAllReferences(subProgram, cancellationToken),
            cancellationToken);

    public static IReadOnlyList<SubProgramReferenceHit> FindAllReferences(
        SubProgram subProgram,
        string? callIdentifier,
        CancellationToken cancellationToken)
    {
        var context = SubProgramReferenceScanContext.Create(subProgram, callIdentifier);
        var hits = new ConcurrentBag<SubProgramReferenceHit>();

        ScanActions(context, exclusiveSubProgramOnly: false, hits, cancellationToken);
        ScanGlobalSubPrograms(context, exclusiveSubProgramOnly: false, hits, cancellationToken);

        return hits
            .OrderBy(static hit => hit.Kind)
            .ThenBy(static hit => hit.Title, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static IReadOnlyList<ActionCatalogEntry> FindActionsCallingSubProgram(
        string subProgramIdOrName,
        bool exclusiveSubProgramOnly)
    {
        if (!TryResolveSubProgram(subProgramIdOrName, out var subProgram, out var callIdentifier, out _)
            || subProgram is null)
        {
            return Array.Empty<ActionCatalogEntry>();
        }

        var context = SubProgramReferenceScanContext.Create(subProgram, callIdentifier);
        var hits = new ConcurrentBag<SubProgramReferenceHit>();
        ScanActions(context, exclusiveSubProgramOnly, hits, CancellationToken.None);

        var matchedIds = new HashSet<string>(
            hits.Where(static hit => hit.Kind == SubProgramReferenceTargetKind.Action).Select(static hit => hit.Id),
            StringComparer.OrdinalIgnoreCase);

        var matches = new List<ActionCatalogEntry>();
        foreach (var entry in ActionCatalogEnumerator.Enumerate(scope: null))
        {
            var id = (entry.Action.Id ?? string.Empty).Trim();
            if (id.Length > 0 && matchedIds.Contains(id))
            {
                matches.Add(entry);
            }
        }

        return matches;
    }

    private static IReadOnlyList<SubProgram> FindGlobalSubProgramsCallingSubProgram(
        SubProgram subProgram,
        string? callIdentifier,
        bool exclusiveSubProgramOnly)
    {
        var context = SubProgramReferenceScanContext.Create(subProgram, callIdentifier);
        var hits = new ConcurrentBag<SubProgramReferenceHit>();
        ScanGlobalSubPrograms(context, exclusiveSubProgramOnly, hits, CancellationToken.None);

        var accessor = DataServiceSubProgramAccessor.TryCreate();
        if (accessor is null)
        {
            return Array.Empty<SubProgram>();
        }

        var matchedIds = new HashSet<string>(
            hits.Where(static hit => hit.Kind == SubProgramReferenceTargetKind.GlobalSubProgram)
                .Select(static hit => hit.Id),
            StringComparer.OrdinalIgnoreCase);

        return accessor.EnumerateAll()
            .Where(candidate =>
            {
                var id = (candidate.Id ?? string.Empty).Trim();
                return id.Length > 0 && matchedIds.Contains(id);
            })
            .ToList();
    }

    private static void ScanActions(
        SubProgramReferenceScanContext context,
        bool exclusiveSubProgramOnly,
        ConcurrentBag<SubProgramReferenceHit> hits,
        CancellationToken cancellationToken)
    {
        var candidates = ActionCatalogEnumerator.Enumerate(scope: null)
            .Where(static entry => entry.Action.ActionType == ActionType.XAction)
            .Select(entry => new ActionScanCandidate(
                (entry.Action.Id ?? string.Empty).Trim(),
                entry.Action.Title,
                entry.Action))
            .Where(candidate => candidate.Id.Length > 0)
            .ToList();

        var options = new ParallelOptions
        {
            CancellationToken = cancellationToken,
        };

        Parallel.ForEach(candidates, options, candidate =>
        {
            if (!TryGetBodyJson(candidate.Action, candidate.Id, out var bodyJson)
                || string.IsNullOrWhiteSpace(bodyJson)
                || !context.BodyMayReference(bodyJson))
            {
                return;
            }

            var isMatch = exclusiveSubProgramOnly
                ? BodyDedicatedToSubProgram(bodyJson, context)
                : BodyUsesSubProgram(bodyJson, context);
            if (!isMatch)
            {
                return;
            }

            var title = string.IsNullOrWhiteSpace(candidate.Title)
                ? candidate.Id
                : candidate.Title.Trim();
            hits.Add(new SubProgramReferenceHit
            {
                Kind = SubProgramReferenceTargetKind.Action,
                Title = title,
                Id = candidate.Id,
            });
        });
    }

    private static void ScanGlobalSubPrograms(
        SubProgramReferenceScanContext context,
        bool exclusiveSubProgramOnly,
        ConcurrentBag<SubProgramReferenceHit> hits,
        CancellationToken cancellationToken)
    {
        var accessor = DataServiceSubProgramAccessor.TryCreate();
        if (accessor is null)
        {
            return;
        }

        var targetId = context.TargetId;
        var candidates = accessor.EnumerateAll()
            .Where(candidate =>
            {
                if (candidate is null)
                {
                    return false;
                }

                var candidateId = (candidate.Id ?? string.Empty).Trim();
                return targetId.Length == 0
                    || candidateId.Length == 0
                    || !string.Equals(candidateId, targetId, StringComparison.OrdinalIgnoreCase);
            })
            .Select(candidate => new SubProgramScanCandidate(
                (candidate!.Id ?? string.Empty).Trim(),
                candidate.Name,
                candidate))
            .Where(candidate => candidate.Id.Length > 0)
            .ToList();

        var options = new ParallelOptions
        {
            CancellationToken = cancellationToken,
        };

        Parallel.ForEach(candidates, options, candidate =>
        {
            if (!TryGetSubProgramStepsJson(candidate.SubProgram, out var stepsJson)
                || !context.BodyMayReference(stepsJson))
            {
                return;
            }

            JArray steps;
            try
            {
                steps = JArray.Parse(stepsJson);
            }
            catch
            {
                return;
            }

            var isMatch = exclusiveSubProgramOnly
                ? SubProgramStepReferenceMatcher.StepsDedicatedToSubProgram(
                    steps,
                    context.Target,
                    context.CallIdentifier)
                : SubProgramStepReferenceMatcher.StepsUseSubProgram(
                    steps,
                    context.Target,
                    context.CallIdentifier);
            if (!isMatch)
            {
                return;
            }

            var title = string.IsNullOrWhiteSpace(candidate.Name)
                ? candidate.Id
                : candidate.Name.Trim();
            hits.Add(new SubProgramReferenceHit
            {
                Kind = SubProgramReferenceTargetKind.GlobalSubProgram,
                Title = title,
                Id = candidate.Id,
            });
        });
    }

    private static bool TryGetSubProgramStepsJson(SubProgram subProgram, out string stepsJson)
    {
        stepsJson = string.Empty;
        if (subProgram.Steps is System.Collections.ICollection collection && collection.Count == 0)
        {
            return false;
        }

        try
        {
            stepsJson = SubProgramProgramSerialization.StepsToJson(subProgram.Steps);
            return stepsJson.Length > 0;
        }
        catch
        {
            return false;
        }
    }

    private static bool BodyUsesSubProgram(string bodyJson, SubProgramReferenceScanContext context)
    {
        try
        {
            var root = JObject.Parse(bodyJson);
            var steps = ActionProgramContent.ReadBodyArrays(root).Steps;
            return SubProgramStepReferenceMatcher.StepsUseSubProgram(
                steps,
                context.Target,
                context.CallIdentifier);
        }
        catch
        {
            return false;
        }
    }

    private static bool BodyDedicatedToSubProgram(string bodyJson, SubProgramReferenceScanContext context)
    {
        try
        {
            var root = JObject.Parse(bodyJson);
            var steps = ActionProgramContent.ReadBodyArrays(root).Steps;
            return SubProgramStepReferenceMatcher.StepsDedicatedToSubProgram(
                steps,
                context.Target,
                context.CallIdentifier);
        }
        catch
        {
            return false;
        }
    }

    private static bool TryGetBodyJson(ActionItem action, string? actionId, out string? bodyJson)
    {
        bodyJson = null;
        if (ActionProgramContent.HasProgramContent(action.Data))
        {
            bodyJson = action.Data;
            return true;
        }

        var id = (actionId ?? action.Id ?? string.Empty).Trim();
        if (id.Length == 0)
        {
            return false;
        }

        if (SharedActionProgramAccessor.TryGetFromSharedCache(action, id, out bodyJson, out _))
        {
            return !string.IsNullOrWhiteSpace(bodyJson);
        }

        return SharedActionProgramAccessor.TryGetPayloadFromLegacyFallbacks(id, out bodyJson)
            && !string.IsNullOrWhiteSpace(bodyJson);
    }

    private sealed class ActionScanCandidate
    {
        public ActionScanCandidate(string id, string? title, ActionItem action)
        {
            Id = id;
            Title = title;
            Action = action;
        }

        public string Id { get; }

        public string? Title { get; }

        public ActionItem Action { get; }
    }

    private sealed class SubProgramScanCandidate
    {
        public SubProgramScanCandidate(string id, string? name, SubProgram subProgram)
        {
            Id = id;
            Name = name;
            SubProgram = subProgram;
        }

        public string Id { get; }

        public string? Name { get; }

        public SubProgram SubProgram { get; }
    }
}
