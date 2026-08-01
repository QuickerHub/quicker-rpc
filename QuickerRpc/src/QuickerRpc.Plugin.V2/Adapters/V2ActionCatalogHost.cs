using System.Collections;
using System.Reflection;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;
using QuickerRpc.Plugin.V2.Reflection;

namespace QuickerRpc.Plugin.V2.Adapters;

internal sealed class V2ActionCatalogHost : IQuickerRpcActionCatalogHost
{
    private const int ColumnCount = 4;
    private const int MinimumSlotCount = 16;

    public Task<QuickerRpcCreateActionResult> CreateActionAsync(
        string? title = null,
        string? description = null,
        string? icon = null,
        string? profileId = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(CreateAction(title, description, icon, profileId));
    }

    public async Task<QuickerRpcActionUpdateResult> DeleteActionAsync(
        string actionId,
        bool showConfirm = false,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var id = (actionId ?? string.Empty).Trim();
        if (id.Length == 0)
        {
            return new QuickerRpcActionUpdateResult { Ok = false, Message = "actionId is required." };
        }

        var accessor = QuickerV2ActionAccessor.Current;
        object? action = null;
        string? resolveError = null;
        if (accessor is null || !accessor.TryGetById(id, out action, out resolveError) || action is null)
        {
            return new QuickerRpcActionUpdateResult
            {
                Ok = false,
                ActionId = id,
                Message = resolveError ?? "Quicker V2 action services unavailable.",
            };
        }

        var serviceType = QuickerV2Runtime.ResolveType(QuickerV2TypeNames.ActionDeleteCommandService);
        var service = serviceType is null ? null : QuickerV2Runtime.TryGetService(serviceType);
        var delete = serviceType?.GetMethods(BindingFlags.Public | BindingFlags.Instance)
            .FirstOrDefault(method =>
                string.Equals(method.Name, "DeleteActionAsync", StringComparison.Ordinal)
                && method.GetParameters().Length >= 3);
        if (service is null || delete is null)
        {
            return new QuickerRpcActionUpdateResult
            {
                Ok = false,
                ActionId = id,
                Message = "Quicker V2 ActionDeleteCommandService.DeleteActionAsync unavailable.",
            };
        }

        try
        {
            var parameters = delete.GetParameters();
            var args = new object?[parameters.Length];
            args[0] = action;
            for (var i = 1; i < parameters.Length; i++)
            {
                if (string.Equals(parameters[i].Name, "showConfirm", StringComparison.OrdinalIgnoreCase))
                {
                    args[i] = showConfirm;
                }
                else if (parameters[i].HasDefaultValue)
                {
                    args[i] = parameters[i].DefaultValue;
                }
                else
                {
                    args[i] = parameters[i].ParameterType.IsValueType
                        ? Activator.CreateInstance(parameters[i].ParameterType)
                        : null;
                }
            }

            if (delete.Invoke(service, args) is not Task task)
            {
                return new QuickerRpcActionUpdateResult
                {
                    Ok = false,
                    ActionId = id,
                    Message = "DeleteActionAsync did not return Task.",
                };
            }

            await task.WaitAsync(cancellationToken).ConfigureAwait(false);
            var deleted = task.GetType().GetProperty("Result")?.GetValue(task) is true;
            return new QuickerRpcActionUpdateResult
            {
                Ok = deleted,
                ActionId = id,
                Message = deleted ? "动作已删除。" : "删除动作已取消或失败。",
            };
        }
        catch (TargetInvocationException ex) when (ex.InnerException is not null)
        {
            return new QuickerRpcActionUpdateResult { Ok = false, ActionId = id, Message = ex.InnerException.Message };
        }
        catch (Exception ex)
        {
            return new QuickerRpcActionUpdateResult { Ok = false, ActionId = id, Message = ex.Message };
        }
    }

    public Task<QuickerRpcMoveActionResult> MoveActionAsync(
        string actionId,
        string targetProfile,
        int? targetRow = null,
        int? targetCol = null,
        bool allowSwap = false,
        string? onNoEmptySlot = null,
        string? onOccupiedSlot = null,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(new QuickerRpcMoveActionResult { Ok = false, Message = V2StubMessage.NotImplemented });

    public Task<QuickerRpcCreateGlobalProfilesResult> CreateGlobalProfilesAsync(
        int count = 1,
        bool insertAfterFirstPage = false,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(new QuickerRpcCreateGlobalProfilesResult { Ok = false, Message = V2StubMessage.NotImplemented });

    public Task<QuickerRpcCreateGlobalProfilesResult> ReorderGlobalProfilesAfterFirstAsync(
        IReadOnlyList<string> profileIds,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(new QuickerRpcCreateGlobalProfilesResult { Ok = false, Message = V2StubMessage.NotImplemented });

    public Task<QuickerRpcDeleteProfileResult> DeleteEmptyProfilesAsync(
        IReadOnlyList<string> profileIdsOrNames,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(new QuickerRpcDeleteProfileResult { Ok = false, Message = V2StubMessage.NotImplemented });

    public Task<QuickerRpcDeleteProfileResult> PruneEmptyProfilesAsync(
        string scope,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(new QuickerRpcDeleteProfileResult { Ok = false, Message = V2StubMessage.NotImplemented });

    public Task<QuickerRpcCreateVirtualProcessResult> EnsureVirtualProcessAsync(
        string exeFile,
        string displayName,
        string profileNamePrefix,
        string? collectSubProgramName = null,
        bool dedicatedSubProgramOnly = true,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(new QuickerRpcCreateVirtualProcessResult { Ok = false, Message = V2StubMessage.NotImplemented });

    private static QuickerRpcCreateActionResult CreateAction(
        string? title,
        string? description,
        string? icon,
        string? profileId)
    {
        if (!TryResolveCreationServices(out var profileManager, out var getGlobalPages, out var pageCommands, out var setButtonAction, out var error))
        {
            return CreateFail(error ?? "Quicker V2 action creation services unavailable.");
        }

        try
        {
            if (getGlobalPages!.Invoke(profileManager, [true]) is not IEnumerable pages)
            {
                return CreateFail("ProfileManager.GetGlobalPages returned no pages.");
            }

            object? selectedPage = null;
            var selectedSlot = -1;
            var requestedProfile = (profileId ?? string.Empty).Trim();
            foreach (var page in pages)
            {
                if (page is null)
                {
                    continue;
                }

                var candidatePageId = QuickerV2Reflection.ReadMember(page, "Id")?.ToString() ?? string.Empty;
                var candidatePageName = QuickerV2Reflection.ReadMember(page, "Name")?.ToString() ?? string.Empty;
                if (requestedProfile.Length > 0
                    && !string.Equals(candidatePageId, requestedProfile, StringComparison.OrdinalIgnoreCase)
                    && !string.Equals(candidatePageName, requestedProfile, StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                var records = QuickerV2Reflection.ReadMember(page, "ActionRecords") as IList;
                var slot = FindEmptySlot(records);
                if (slot < 0)
                {
                    continue;
                }

                selectedPage = page;
                selectedSlot = slot;
                break;
            }

            if (selectedPage is null)
            {
                return CreateFail(requestedProfile.Length > 0
                    ? $"Global action page not found or has no empty slot: {requestedProfile}"
                    : "No global action page has an empty slot.");
            }

            var action = CreateXAction(title, description, icon, out var actionId);
            if (action is null)
            {
                return CreateFail("Could not construct Quicker V2 XAction types.");
            }

            var pageIdValue = QuickerV2Reflection.ReadMember(selectedPage, "Id");
            var row = selectedSlot / ColumnCount;
            var col = selectedSlot % ColumnCount;
            setButtonAction!.Invoke(pageCommands, [pageIdValue, row, col, action, true, true]);

            var pageId = pageIdValue?.ToString();
            var pageName = QuickerV2Reflection.ReadMember(selectedPage, "Name")?.ToString();
            var exeFile = QuickerV2Reflection.ReadMember(selectedPage, "ExeFile")?.ToString();
            return new QuickerRpcCreateActionResult
            {
                Ok = true,
                Message = "已在全局动作页创建组合动作。",
                ActionId = actionId.ToString("D"),
                ProfileId = pageId,
                ProfileName = pageName,
                ExeFile = exeFile,
                Row = row,
                Col = col,
                EditVersion = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                CreatedProfile = false,
                IsVirtual = false,
            };
        }
        catch (TargetInvocationException ex) when (ex.InnerException is not null)
        {
            return CreateFail(ex.InnerException.Message);
        }
        catch (Exception ex)
        {
            return CreateFail(ex.Message);
        }
    }

    private static int FindEmptySlot(IList? records)
    {
        if (records is null)
        {
            return 0;
        }

        for (var i = 0; i < records.Count; i++)
        {
            if (records[i] is null || records[i] is Guid guid && guid == Guid.Empty)
            {
                return i;
            }
        }

        return records.Count < MinimumSlotCount ? records.Count : -1;
    }

    private static object? CreateXAction(
        string? title,
        string? description,
        string? icon,
        out Guid actionId)
    {
        actionId = Guid.NewGuid();
        var actionType = QuickerV2Runtime.ResolveType(QuickerV2TypeNames.ActionItem2);
        var presentationType = QuickerV2Runtime.ResolveType(QuickerV2TypeNames.OperationPresentation);
        var metadataType = QuickerV2Runtime.ResolveType(QuickerV2TypeNames.ActionMetadata);
        var payloadType = QuickerV2Runtime.ResolveType(QuickerV2TypeNames.XActionDto);
        if (actionType is null || presentationType is null || metadataType is null || payloadType is null)
        {
            return null;
        }

        var action = Activator.CreateInstance(actionType);
        var presentation = Activator.CreateInstance(presentationType);
        var metadata = Activator.CreateInstance(metadataType);
        var payload = Activator.CreateInstance(payloadType);
        if (action is null || presentation is null || metadata is null || payload is null)
        {
            return null;
        }

        QuickerV2Reflection.WriteMember(action, "Id", actionId);
        QuickerV2Reflection.WriteMember(presentation, "Title", string.IsNullOrWhiteSpace(title) ? "新动作" : title.Trim());
        QuickerV2Reflection.WriteMember(presentation, "Description", description);
        QuickerV2Reflection.WriteMember(presentation, "Icon", icon);
        QuickerV2Reflection.WriteMember(metadata, "CreateTimeUtc", DateTime.UtcNow);
        QuickerV2Reflection.WriteMember(metadata, "LastEditTimeUtc", DateTime.UtcNow);
        QuickerV2Reflection.WriteMember(action, "Presentation", presentation);
        QuickerV2Reflection.WriteMember(action, "Metadata", metadata);
        QuickerV2Reflection.WriteMember(action, "OperationType", "xAction");
        QuickerV2Reflection.WriteMember(action, "OperationPayload", payload);
        return action;
    }

    private static bool TryResolveCreationServices(
        out object? profileManager,
        out MethodInfo? getGlobalPages,
        out object? pageCommands,
        out MethodInfo? setButtonAction,
        out string? error)
    {
        profileManager = null;
        getGlobalPages = null;
        pageCommands = null;
        setButtonAction = null;
        error = null;
        if (!QuickerV2Runtime.IsRunningInQuicker)
        {
            error = "Not running inside Quicker.";
            return false;
        }

        var profileType = QuickerV2Runtime.ResolveType(QuickerV2TypeNames.ProfileManager);
        var commandType = QuickerV2Runtime.ResolveType(QuickerV2TypeNames.ActionPageCommandService);
        profileManager = profileType is null ? null : QuickerV2Runtime.TryGetService(profileType);
        pageCommands = commandType is null ? null : QuickerV2Runtime.TryGetService(commandType);
        getGlobalPages = profileType?.GetMethod(
            "GetGlobalPages",
            BindingFlags.Public | BindingFlags.Instance,
            binder: null,
            types: [typeof(bool)],
            modifiers: null);
        setButtonAction = commandType?.GetMethods(BindingFlags.Public | BindingFlags.Instance)
            .FirstOrDefault(method =>
                string.Equals(method.Name, "SetButtonAction", StringComparison.Ordinal)
                && method.GetParameters().Length == 6);

        if (profileManager is not null && getGlobalPages is not null && pageCommands is not null && setButtonAction is not null)
        {
            return true;
        }

        error = "ProfileManager.GetGlobalPages or ActionPageCommandService.SetButtonAction unavailable.";
        return false;
    }

    private static QuickerRpcCreateActionResult CreateFail(string message) =>
        new() { Ok = false, Message = message };
}
