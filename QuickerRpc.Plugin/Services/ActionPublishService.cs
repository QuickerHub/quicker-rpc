using System;
using System.Threading;
using System.Threading.Tasks;
using Quicker.Common;
using Quicker.Common.Entities;
using Quicker.Common.Vm;
using Quicker.Utilities;
using Quicker.View.Share;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Headless share to getquicker.net: first publish or refresh an existing shared action.
/// </summary>
public sealed class ActionPublishService
{
    private readonly ActionEditMgrAccessor? _actionEditMgr;
    private readonly ActionUpdateService _actionUpdateService;
    private readonly WebConnectorAccessor? _webConnector;

    public ActionPublishService(ActionUpdateService actionUpdateService)
    {
        _actionUpdateService = actionUpdateService;
        _actionEditMgr = ActionEditMgrAccessor.TryCreate();
        _webConnector = WebConnectorAccessor.TryCreate();
    }

    public async Task<QuickerRpcActionPublishResult> PublishSharedActionAsync(
        string actionId,
        QuickerRpcActionPublishRequest request,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var id = (actionId ?? string.Empty).Trim();
        if (id.Length == 0)
        {
            return Fail(null, "actionId is required.");
        }

        request ??= new QuickerRpcActionPublishRequest();

        var resolved = ActionContextResolver.TryResolve(id, out var profileObj, out var actionObj, out _);
        if (resolved && actionObj is ActionItem action && !string.IsNullOrWhiteSpace(action.SharedActionId))
        {
            return await UpdateExistingShareAsync(id, action.SharedActionId, request.ChangeLog).ConfigureAwait(true);
        }

        if (!resolved)
        {
            return await UpdateExistingShareAsync(id, sharedIdHint: id, request.ChangeLog).ConfigureAwait(true);
        }

        return await PublishFirstTimeAsync(id, profileObj, actionObj, request).ConfigureAwait(true);
    }

    private async Task<QuickerRpcActionPublishResult> UpdateExistingShareAsync(
        string actionId,
        string? sharedIdHint,
        string? changeLog)
    {
        if (string.IsNullOrWhiteSpace(changeLog))
        {
            return Fail(actionId, "Change log is required (--changelog or --changelog-file) when updating a shared action.");
        }

        var update = await _actionUpdateService.UpdateSharedActionAsync(actionId, changeLog).ConfigureAwait(true);
        var sharedId = FirstNonEmpty(sharedIdHint, update.ActionId) ?? actionId;
        return new QuickerRpcActionPublishResult
        {
            Ok = update.Ok,
            Mode = "update",
            ActionId = update.ActionId ?? actionId,
            SharedActionId = sharedId,
            ShareUrl = TryCreateShareUrl(sharedId),
            Message = update.Message,
        };
    }

    private async Task<QuickerRpcActionPublishResult> PublishFirstTimeAsync(
        string id,
        object profileObj,
        object actionObj,
        QuickerRpcActionPublishRequest request)
    {
        if (_webConnector is null)
        {
            return Fail(id, "Not running inside Quicker (WebConnector unavailable).");
        }

        if (_actionEditMgr?.SetButtonAction is null)
        {
            return Fail(id, "Not running inside Quicker (ActionEditMgr unavailable).");
        }

        if (actionObj is not ActionItem action || profileObj is not ActionProfile profile)
        {
            return Fail(id, "Resolved action/profile types are unsupported.");
        }

        if (action.UseTemplate && !string.IsNullOrWhiteSpace(action.TemplateId))
        {
            return Fail(
                action.Id ?? id,
                "This action is an unmodified shared action install. Share the original action instead.");
        }

        var title = FirstNonEmpty(request.Title, action.Title);
        var description = FirstNonEmpty(request.Description, action.Description);
        if (string.IsNullOrWhiteSpace(title))
        {
            return Fail(action.Id ?? id, "Title is required (--title or action title).");
        }

        if (string.IsNullOrWhiteSpace(description))
        {
            return Fail(action.Id ?? id, "Description is required (--description or action description).");
        }

        var isPublic = request.IsPublic;
        if (isPublic && !HasPublishableIcon(action.Icon))
        {
            return Fail(
                action.Id ?? id,
                "Public share requires a custom icon (fa:Light_* or image URL). Set via action set-metadata or patch.");
        }

        if (string.IsNullOrWhiteSpace(action.Id) || action.Id == Guid.Empty.ToString())
        {
            action.Id = Guid.NewGuid().ToString("D");
        }

        var vm = BuildSharedActionVm(action, profile, request, title, description, isPublic);
        var (shareOk, shareMessage, sharedDto) = await _webConnector.ShareActionAsync(vm).ConfigureAwait(true);
        if (!shareOk || sharedDto is null)
        {
            return Fail(action.Id ?? id, string.IsNullOrWhiteSpace(shareMessage) ? "Share failed." : shareMessage);
        }

        action.SharedActionId = sharedDto.Id.ToString("D");
        action.ShareTimeUtc = DateTime.UtcNow;
        if (string.IsNullOrWhiteSpace(action.Description) && !string.IsNullOrWhiteSpace(sharedDto.Description))
        {
            action.Description = sharedDto.Description;
        }

        var sharedId = sharedDto.Id.ToString("D");
        var shareUrl = AppHelper.CreateSharedActionLink(sharedId);
        if (!_actionEditMgr.TrySetButtonAction(profile, action.Row, action.Col, action, skipSave: false, out var saveError))
        {
            return new QuickerRpcActionPublishResult
            {
                Ok = true,
                Mode = "publish",
                ActionId = action.Id,
                SharedActionId = sharedId,
                ShareUrl = shareUrl,
                Revision = sharedDto.Revision,
                IsPublic = sharedDto.IsPublic,
                Message = $"Shared successfully but failed to save local action metadata: {saveError}",
            };
        }

        return new QuickerRpcActionPublishResult
        {
            Ok = true,
            Mode = "publish",
            ActionId = action.Id,
            SharedActionId = sharedId,
            ShareUrl = shareUrl,
            Revision = sharedDto.Revision,
            IsPublic = sharedDto.IsPublic,
            Message = isPublic
                ? $"动作已分享：{shareUrl}"
                : $"动作已非公开分享：{shareUrl}",
        };
    }

    private static SharedActionVm BuildSharedActionVm(
        ActionItem action,
        ActionProfile profile,
        QuickerRpcActionPublishRequest request,
        string title,
        string description,
        bool isPublic)
    {
        var data = action.Data ?? string.Empty;
        if (ActionProgramContent.IsXActionBody(data))
        {
            try
            {
                data = ShareActionHelper.EmbedGlobalSubPrograms(data);
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException("Failed to embed global subprograms: " + ex.Message, ex);
            }
        }

        return new SharedActionVm
        {
            Title = title,
            Description = description,
            ActionType = action.ActionType,
            Path = action.Path,
            DelayMs = action.DelayMs,
            Children = action.Children,
            Data = data,
            Data2 = action.Data2,
            Data3 = action.Data3,
            InternalId = action.Id,
            SourceSharedActionId = action.TemplateId,
            SourceSharedActionRevision = action.TemplateRevision,
            SourceProfileId = profile.Id,
            Language = Thread.CurrentThread.CurrentCulture.Name,
            Icon = action.Icon,
            Tags = request.Tags ?? string.Empty,
            Keywords = request.Keywords ?? string.Empty,
            Note = request.Note ?? string.Empty,
            IsPublic = isPublic,
            ChangeLog = request.ChangeLog ?? string.Empty,
            SubmitReview = request.SubmitReview,
            SoftVersion = AppHelper.GetSoftVersion(),
            MinQuickerVersion = action.MinQuickerVersion,
            UserLimitation = action.UserLimitation ?? ActionUserLimitation.None,
            ContextMenuData = action.ContextMenuData,
            EnableEvaluateVariable = action.EnableEvaluateVariable,
            DoNotClosePanel = action.DoNotClosePanel ?? false,
            AllowScrollTrigger = action.AllowScrollTrigger,
            Association = action.Association,
            AsSubProgram = action.AsSubProgram,
            ExeFile = ActionProfile.ExeName_Common,
            ExeFullpath = string.Empty,
        };
    }

    private static string? TryCreateShareUrl(string? sharedId)
    {
        if (string.IsNullOrWhiteSpace(sharedId))
        {
            return null;
        }

        try
        {
            return AppHelper.CreateSharedActionLink(sharedId.Trim());
        }
        catch
        {
            return null;
        }
    }

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

    private static QuickerRpcActionPublishResult Fail(string? actionId, string message) =>
        new()
        {
            Ok = false,
            ActionId = actionId,
            Message = message,
        };
}
