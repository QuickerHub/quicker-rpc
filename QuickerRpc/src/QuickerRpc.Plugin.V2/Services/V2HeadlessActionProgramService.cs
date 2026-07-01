using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.AgentModel.XAction;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;
using QuickerRpc.Plugin.V2.Reflection;

namespace QuickerRpc.Plugin.V2.Services;

/// <summary>Headless XAction read/write via V2 reflection accessors (no Quicker compile-time refs).</summary>
public sealed class V2HeadlessActionProgramService
{
    // Defer Quicker DI lookup until first RPC call (avoids UI-thread deadlock during plugin start).
    private QuickerV2ActionAccessor? Actions => QuickerV2ActionAccessor.Current;

    public QuickerRpcActionProgramSnapshot? TryLoadProgramSnapshot(string? actionId)
    {
        var id = (actionId ?? string.Empty).Trim();
        if (id.Length == 0 || Actions is null)
        {
            return null;
        }

        if (!Actions.TryGetById(id, out var action, out _) || action is null)
        {
            return null;
        }

        if (!Actions.IsXAction(action))
        {
            return null;
        }

        var payloadJson = Actions.GetPayloadJson(action, out _);
        if (string.IsNullOrWhiteSpace(payloadJson))
        {
            return null;
        }

        var (title, description, icon, contextMenuData) = Actions.GetPresentation(action);
        return new QuickerRpcActionProgramSnapshot
        {
            ActionId = id,
            EditVersion = Actions.GetEditVersionMs(action),
            BodyJson = payloadJson,
            Presentation = new QuickerRpcActionPresentation
            {
                Title = title,
                Description = description,
                Icon = icon,
                ContextMenuData = contextMenuData,
            },
        };
    }

    public QuickerRpcApplyXActionResult ApplyXActionToAction(
        string? actionId,
        string? xActionJson,
        long? expectedEditVersion,
        bool force)
    {
        var id = (actionId ?? string.Empty).Trim();
        if (id.Length == 0)
        {
            return FailApply("actionId is required.");
        }

        if (string.IsNullOrWhiteSpace(xActionJson))
        {
            return FailApply("xActionJson is required.");
        }

        if (Actions is null)
        {
            return FailApply("Quicker V2 action accessor unavailable.");
        }

        JObject xAction;
        try
        {
            xAction = JObject.Parse(xActionJson);
        }
        catch (Exception ex)
        {
            return FailApply("xActionJson parse failed: " + ex.Message);
        }

        var stepsToken = xAction["steps"];
        var variablesToken = xAction["variables"];
        if (stepsToken is not JArray steps || variablesToken is not JArray variables)
        {
            return FailApply("xAction must contain steps and variables JSON arrays.");
        }

        if (!Actions.TryGetById(id, out var action, out var loadError) || action is null)
        {
            return FailApply(loadError ?? $"Action not found: {id}");
        }

        if (!Actions.IsXAction(action))
        {
            return FailApply($"Action {id} is not an XAction program.");
        }

        var versionBefore = Actions.GetEditVersionMs(action);
        if (!force && expectedEditVersion.HasValue && expectedEditVersion.Value != versionBefore)
        {
            return new QuickerRpcApplyXActionResult
            {
                Success = false,
                ActionId = id,
                ErrorMessage = "Version conflict: action was modified in Quicker. Re-read with action_get or use force.",
                VersionConflict = true,
                EditVersion = versionBefore,
            };
        }

        var catalog = QuickerV2StepRunnerCatalogBuilder.Build();
        var normalizedVariables = XActionProgramService.NormalizeVariablesForSave(variables);
        XActionProgramService.NormalizeStepsInputParamKeys(steps, catalog);

        var payload = MergePayload(Actions.GetPayloadJson(action, out _), xAction, steps, normalizedVariables);
        var clone = Actions.CloneAction(action);
        if (clone is null)
        {
            return FailApply("Failed to clone ActionItem2.");
        }

        Actions.SetOperationPayload(clone, payload);
        Actions.TouchLastEditUtc(clone, DateTime.UtcNow);
        if (!Actions.TrySaveAction(clone, out var saveError))
        {
            return FailApply(saveError ?? "save_failed");
        }

        if (!Actions.TryGetById(id, out var saved, out _) || saved is null)
        {
            return FailApply("save finished but action could not be reloaded.");
        }

        return new QuickerRpcApplyXActionResult
        {
            Success = true,
            ActionId = id,
            EditVersion = Actions.GetEditVersionMs(saved),
            UpdatedUtc = DateTimeOffset.UtcNow.ToString("o"),
        };
    }

    public QuickerRpcUpdateActionMetadataResult UpdateActionMetadata(
        string? actionId,
        string? title,
        string? description,
        string? icon,
        string? contextMenuData,
        long? expectedEditVersion,
        bool force)
    {
        var id = (actionId ?? string.Empty).Trim();
        if (id.Length == 0)
        {
            return FailMetadata("actionId is required.");
        }

        if (Actions is null)
        {
            return FailMetadata("Quicker V2 action accessor unavailable.");
        }

        if (!Actions.TryGetById(id, out var action, out var loadError) || action is null)
        {
            return FailMetadata(loadError ?? $"Action not found: {id}");
        }

        var versionBefore = Actions.GetEditVersionMs(action);
        if (!force && expectedEditVersion.HasValue && expectedEditVersion.Value != versionBefore)
        {
            return new QuickerRpcUpdateActionMetadataResult
            {
                Success = false,
                ActionId = id,
                ErrorMessage = "Version conflict: action was modified in Quicker. Re-read with action_get or use force.",
                VersionConflict = true,
                EditVersion = versionBefore,
            };
        }

        var clone = Actions.CloneAction(action);
        if (clone is null)
        {
            return FailMetadata("Failed to clone ActionItem2.");
        }

        UpdatePresentationFields(clone, title, description, icon);
        Actions.TouchLastEditUtc(clone, DateTime.UtcNow);
        if (!Actions.TrySaveAction(clone, out var saveError))
        {
            return FailMetadata(saveError ?? "save_failed");
        }

        if (!Actions.TryGetById(id, out var saved, out _) || saved is null)
        {
            return FailMetadata("save finished but action could not be reloaded.");
        }

        var (savedTitle, savedDescription, savedIcon, savedContextMenuData) = Actions.GetPresentation(saved);
        return new QuickerRpcUpdateActionMetadataResult
        {
            Success = true,
            ActionId = id,
            EditVersion = Actions.GetEditVersionMs(saved),
            Title = savedTitle,
            Description = savedDescription,
            Icon = savedIcon,
            ContextMenuData = savedContextMenuData,
            UpdatedUtc = DateTimeOffset.UtcNow.ToString("o"),
        };
    }

    public QuickerRpcApplyActionPatchResult ApplyActionPatchToAction(
        string? actionId,
        string? patchJson,
        long? expectedEditVersion,
        bool force)
    {
        var snapshot = TryLoadProgramSnapshot(actionId);
        if (snapshot is null)
        {
            return FailPatch("Action program not found or unavailable.");
        }

        if (string.IsNullOrWhiteSpace(patchJson))
        {
            return FailPatch("patchJson is required.");
        }

        JObject patch;
        try
        {
            patch = JObject.Parse(patchJson);
        }
        catch (Exception ex)
        {
            return FailPatch("patchJson parse failed: " + ex.Message);
        }

        if (Actions is null)
        {
            return FailPatch("Quicker V2 action accessor unavailable.");
        }

        if (!Actions.TryGetById(snapshot.ActionId, out var action, out var loadError) || action is null)
        {
            return FailPatch(loadError ?? $"Action not found: {snapshot.ActionId}");
        }

        var versionBefore = Actions.GetEditVersionMs(action);
        if (!force && expectedEditVersion.HasValue && expectedEditVersion.Value != versionBefore)
        {
            return FailPatch(
                "Version conflict: action was modified in Quicker. Re-read with action_get or use force.",
                versionConflict: true,
                editVersion: versionBefore);
        }

        var body = JObject.Parse(snapshot.BodyJson);
        var core = V2ActionPatchCore.Apply(body, patch, QuickerV2StepRunnerCatalogBuilder.Build());
        if (!core.Success)
        {
            return FailPatch(core.ErrorMessage ?? "patch apply failed.");
        }

        var clone = Actions.CloneAction(action);
        if (clone is null)
        {
            return FailPatch("Failed to clone ActionItem2.");
        }

        Actions.SetOperationPayload(clone, core.Body.ToString(Newtonsoft.Json.Formatting.None));
        UpdatePresentationFields(
            clone,
            core.Metadata.Title,
            core.Metadata.Description,
            core.Metadata.Icon,
            core.Metadata.ContextMenuData);
        Actions.TouchLastEditUtc(clone, DateTime.UtcNow);
        if (!Actions.TrySaveAction(clone, out var saveError))
        {
            return FailPatch(saveError ?? "save_failed");
        }

        if (!Actions.TryGetById(snapshot.ActionId, out var saved, out _) || saved is null)
        {
            return FailPatch("save finished but action could not be reloaded.");
        }

        return new QuickerRpcApplyActionPatchResult
        {
            Success = true,
            ActionId = snapshot.ActionId,
            EditVersion = Actions.GetEditVersionMs(saved),
            PresentationUpdated = core.PresentationUpdated,
            UpdatedStepsJson = core.UpdatedStepsJson,
            AddedStepsJson = core.AddedStepsJson,
            UpdatedVariablesJson = core.UpdatedVariablesJson,
            AddedVariablesJson = core.AddedVariablesJson,
            UpdatedUtc = DateTimeOffset.UtcNow.ToString("o"),
            Warnings = core.Warnings,
            ReadSource = "catalog",
            AppliedToDesigner = false,
            Persisted = true,
        };
    }

    public QuickerRpcSearchStepRunnersResult SearchStepRunners(string? keyword, int? maxResults)
    {
        if (!QuickerV2Runtime.IsRunningInQuicker)
        {
            return new QuickerRpcSearchStepRunnersResult
            {
                Success = false,
                ErrorMessage = "Not running inside Quicker.",
            };
        }

        var mapped = StepRunnerCatalogMapper.Search(QuickerV2StepRunnerCatalogBuilder.Build(), keyword ?? string.Empty, maxResults);
        return MapSearchResult(mapped);
    }

    public QuickerRpcSearchStepRunnersResult ListStepRunners(int? maxResults)
    {
        if (!QuickerV2Runtime.IsRunningInQuicker)
        {
            return new QuickerRpcSearchStepRunnersResult
            {
                Success = false,
                ErrorMessage = "Not running inside Quicker.",
            };
        }

        var mapped = StepRunnerCatalogMapper.ListCatalog(QuickerV2StepRunnerCatalogBuilder.Build(), maxResults);
        return MapSearchResult(mapped);
    }

    public QuickerRpcStepRunnerDetailResult GetStepRunnerDetail(string? stepRunnerKey, string? controlFieldValue = null)
    {
        if (!QuickerV2Runtime.IsRunningInQuicker)
        {
            return new QuickerRpcStepRunnerDetailResult
            {
                Success = false,
                ErrorMessage = "Not running inside Quicker.",
            };
        }

        var mapped = StepRunnerCatalogMapper.GetDetail(
            QuickerV2StepRunnerCatalogBuilder.Build(),
            stepRunnerKey ?? string.Empty,
            controlFieldValue);
        return new QuickerRpcStepRunnerDetailResult
        {
            Success = mapped.Success,
            ErrorMessage = mapped.ErrorMessage,
            SchemaJson = mapped.Schema is null ? null : StepRunnerAgentSchemaJson.Serialize(mapped.Schema),
        };
    }

    private static string MergePayload(string? existingPayloadJson, JObject xAction, JArray steps, JArray variables)
    {
        JObject root;
        try
        {
            root = string.IsNullOrWhiteSpace(existingPayloadJson) ? new JObject() : JObject.Parse(existingPayloadJson);
        }
        catch
        {
            root = new JObject();
        }

        root["steps"] = steps;
        root["variables"] = variables;
        if (xAction["subPrograms"] is JArray subPrograms)
        {
            root["subPrograms"] = subPrograms;
        }

        return root.ToString(Newtonsoft.Json.Formatting.None);
    }

    private static void UpdatePresentationFields(
        object action,
        string? title,
        string? description,
        string? icon,
        string? contextMenuData = null)
    {
        var presentation = QuickerV2Reflection.ReadMember(action, "Presentation");
        if (presentation is null)
        {
            return;
        }

        if (title is not null)
        {
            QuickerV2Reflection.WriteMember(presentation, "Title", title);
        }

        if (description is not null)
        {
            QuickerV2Reflection.WriteMember(presentation, "Description", description);
        }

        if (icon is not null)
        {
            QuickerV2Reflection.WriteMember(presentation, "Icon", icon);
        }

        if (contextMenuData is not null)
        {
            if (!TryWriteMember(presentation, "ContextMenuData", contextMenuData))
            {
                QuickerV2Reflection.WriteMember(action, "ContextMenuData", contextMenuData);
            }
        }
    }

    private static bool TryWriteMember(object target, string name, object? value)
    {
        if (QuickerV2Reflection.ReadMember(target, name) is null)
        {
            return false;
        }

        QuickerV2Reflection.WriteMember(target, name, value);
        return true;
    }

    private static QuickerRpcSearchStepRunnersResult MapSearchResult(SearchStepRunnersResult mapped) =>
        new()
        {
            Success = mapped.Success,
            ErrorMessage = mapped.ErrorMessage,
            Keyword = mapped.Keyword,
            MatchCount = mapped.MatchCount,
            Items = mapped.Items
                .Select(x => new QuickerRpcStepRunnerSearchItem
                {
                    Key = x.Key,
                    Name = x.Name,
                    Description = x.Description,
                    Snippet = x.Snippet,
                    Icon = x.Icon,
                })
                .ToList(),
        };

    private static QuickerRpcApplyXActionResult FailApply(string message) =>
        new() { Success = false, ErrorMessage = message };

    private static QuickerRpcUpdateActionMetadataResult FailMetadata(string message) =>
        new() { Success = false, ErrorMessage = message };

    private static QuickerRpcApplyActionPatchResult FailPatch(
        string message,
        bool? versionConflict = null,
        long? editVersion = null) =>
        new()
        {
            Success = false,
            ErrorMessage = message,
            VersionConflict = versionConflict,
            EditVersion = editVersion,
        };
}
