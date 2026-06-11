using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Quicker.Common;
using Quicker.Common.Entities;
using Quicker.Common.Vm;
using Quicker.Domain;
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
    private readonly ActionDocService _actionDocService;
    private readonly WebConnectorAccessor? _webConnector;

    public ActionPublishService(ActionUpdateService actionUpdateService, ActionDocService actionDocService)
    {
        _actionUpdateService = actionUpdateService;
        _actionDocService = actionDocService;
        _actionEditMgr = ActionEditMgrAccessor.TryCreate();
        _webConnector = WebConnectorAccessor.TryCreate();
    }

    public Task<QuickerRpcActionPublishPreflightResult> PreflightPublishSharedActionAsync(
        string actionId,
        QuickerRpcActionPublishRequest request,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var id = (actionId ?? string.Empty).Trim();
        if (id.Length == 0)
        {
            return Task.FromResult(PreflightFail(null, "actionId is required."));
        }

        request ??= new QuickerRpcActionPublishRequest();
        var readiness = BuildReadiness(id, request);
        return Task.FromResult(ToPreflightResult(id, readiness));
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

        var readiness = BuildReadiness(id, request);
        if (!readiness.Ready)
        {
            return FailWithReadiness(id, readiness);
        }

        if (string.Equals(readiness.Mode, ActionPublishReadiness.ModeUpdate, StringComparison.OrdinalIgnoreCase))
        {
            return await UpdateExistingShareAsync(id, ResolveSharedIdHint(id), request.ChangeLog).ConfigureAwait(true);
        }

        var resolved = ActionContextResolver.TryResolve(id, out var profileObj, out var actionObj, out _);
        if (!resolved || actionObj is not ActionItem action || profileObj is not ActionProfile profile)
        {
            return Fail(id, "Resolved action/profile types are unsupported.");
        }

        return await PublishFirstTimeAsync(id, profile, action, request, readiness).ConfigureAwait(true);
    }

    private ActionPublishReadinessResult BuildReadiness(string id, QuickerRpcActionPublishRequest request)
    {
        var resolved = ActionContextResolver.TryResolve(id, out _, out var actionObj, out _);
        var mode = ResolveMode(id, resolved, actionObj);
        var action = actionObj as ActionItem;

        return ActionPublishReadiness.Evaluate(new ActionPublishReadiness.Context
        {
            Mode = mode,
            RequestTitle = request.Title,
            RequestDescription = request.Description,
            ActionTitle = action?.Title,
            ActionDescription = action?.Description,
            ActionIcon = action?.Icon,
            IsPublic = request.IsPublic,
            ChangeLog = request.ChangeLog,
            UseTemplate = action?.UseTemplate ?? false,
            TemplateId = action?.TemplateId,
            HasWebConnector = _webConnector is not null,
            HasActionEditMgr = _actionEditMgr?.SetButtonAction is not null,
            EmbedSubProgramsError = TryProbeEmbedSubPrograms(action),
            Tags = request.Tags,
            AllowedTags = TryGetAllowedActionTags(),
            SubmitReview = request.SubmitReview,
            DetailHtml = request.DetailHtml,
            RequestNote = request.Note,
        });
    }

    /// <summary>
    /// Predefined getquicker action categories. The share API returns InternalServerError for
    /// tags outside this list, so readiness validates against it. Null disables validation.
    /// </summary>
    private static IReadOnlyCollection<string>? TryGetAllowedActionTags()
    {
        try
        {
            return AppState.ActionTags?.Where(t => !string.IsNullOrWhiteSpace(t)).ToArray();
        }
        catch
        {
            return null;
        }
    }

    private static string ResolveMode(string id, bool resolved, object? actionObj)
    {
        if (resolved && actionObj is ActionItem action && !string.IsNullOrWhiteSpace(action.SharedActionId))
        {
            return ActionPublishReadiness.ModeUpdate;
        }

        if (!resolved)
        {
            return ActionPublishReadiness.ModeUpdate;
        }

        return ActionPublishReadiness.ModePublish;
    }

    private static string? ResolveSharedIdHint(string id)
    {
        if (ActionContextResolver.TryResolve(id, out _, out var actionObj, out _)
            && actionObj is ActionItem action
            && !string.IsNullOrWhiteSpace(action.SharedActionId))
        {
            return action.SharedActionId;
        }

        return id;
    }

    private static string? TryProbeEmbedSubPrograms(ActionItem? action)
    {
        if (action is null)
        {
            return null;
        }

        var data = action.Data ?? string.Empty;
        if (!ActionProgramContent.IsXActionBody(data))
        {
            return null;
        }

        try
        {
            _ = ShareActionHelper.EmbedGlobalSubPrograms(data);
            return null;
        }
        catch (Exception ex)
        {
            return ex.Message;
        }
    }

    private async Task<QuickerRpcActionPublishResult> UpdateExistingShareAsync(
        string actionId,
        string? sharedIdHint,
        string? changeLog)
    {
        var update = await _actionUpdateService.UpdateSharedActionAsync(actionId, changeLog).ConfigureAwait(true);
        var sharedId = FirstNonEmpty(sharedIdHint, update.ActionId) ?? actionId;
        return new QuickerRpcActionPublishResult
        {
            Ok = update.Ok,
            Mode = ActionPublishReadiness.ModeUpdate,
            ActionId = update.ActionId ?? actionId,
            SharedActionId = sharedId,
            ShareUrl = TryCreateShareUrl(sharedId),
            Message = update.Message,
        };
    }

    private async Task<QuickerRpcActionPublishResult> PublishFirstTimeAsync(
        string id,
        ActionProfile profile,
        ActionItem action,
        QuickerRpcActionPublishRequest request,
        ActionPublishReadinessResult readiness)
    {
        var title = readiness.Title!;
        var description = readiness.Description!;
        var isPublic = request.IsPublic;

        if (string.IsNullOrWhiteSpace(action.Id) || action.Id == Guid.Empty.ToString())
        {
            action.Id = Guid.NewGuid().ToString("D");
        }

        var vm = BuildSharedActionVm(action, profile, request, title, description, isPublic, readiness.Tags);
        var (shareOk, shareMessage, sharedDto) = await _webConnector!.ShareActionAsync(vm).ConfigureAwait(true);
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
        var (reviewSubmitted, reviewMessage) = await SubmitForReviewIfRequestedAsync(
                sharedId,
                request,
                isPublic)
            .ConfigureAwait(true);

        if (!_actionEditMgr!.TrySetButtonAction(profile, action.Row, action.Col, action, skipSave: false, out var saveError))
        {
            return new QuickerRpcActionPublishResult
            {
                Ok = true,
                Mode = ActionPublishReadiness.ModePublish,
                ActionId = action.Id,
                SharedActionId = sharedId,
                ShareUrl = shareUrl,
                Revision = sharedDto.Revision,
                IsPublic = sharedDto.IsPublic,
                ReviewSubmitted = reviewSubmitted,
                Message = AppendReviewMessage(
                    $"Shared successfully but failed to save local action metadata: {saveError}",
                    reviewMessage),
            };
        }

        return new QuickerRpcActionPublishResult
        {
            Ok = true,
            Mode = ActionPublishReadiness.ModePublish,
            ActionId = action.Id,
            SharedActionId = sharedId,
            ShareUrl = shareUrl,
            Revision = sharedDto.Revision,
            IsPublic = sharedDto.IsPublic,
            ReviewSubmitted = reviewSubmitted,
            Message = AppendReviewMessage(
                isPublic
                    ? $"动作已分享：{shareUrl}"
                    : $"动作已非公开分享：{shareUrl}",
                reviewMessage),
        };
    }

    /// <summary>
    /// Public shares only enter the action library after the web edit form is submitted for review
    /// (保存并发布到动作库). Writes the action page intro (DetailHtml) in the same submit.
    /// </summary>
    private async Task<(bool Submitted, string? Message)> SubmitForReviewIfRequestedAsync(
        string sharedId,
        QuickerRpcActionPublishRequest request,
        bool isPublic)
    {
        if (!isPublic || !request.SubmitReview)
        {
            return (false, null);
        }

        try
        {
            var doc = await _actionDocService
                .SubmitForReviewAsync(
                    sharedId,
                    NullIfEmpty(ActionPublishIntro.ResolveDetailHtml(request.DetailHtml, request.Note)))
                .ConfigureAwait(true);
            return doc.Ok
                ? (true, "已自动提交动作库审核。")
                : (false, $"提交审核失败（请到分享页编辑界面手动点击「保存并发布到动作库」）：{doc.Message}");
        }
        catch (Exception ex)
        {
            return (false, $"提交审核失败（请到分享页编辑界面手动点击「保存并发布到动作库」）：{ex.Message}");
        }
    }

    private static string AppendReviewMessage(string message, string? reviewMessage) =>
        string.IsNullOrWhiteSpace(reviewMessage) ? message : message + " " + reviewMessage;

    private static SharedActionVm BuildSharedActionVm(
        ActionItem action,
        ActionProfile profile,
        QuickerRpcActionPublishRequest request,
        string title,
        string description,
        bool isPublic,
        string? normalizedTags)
    {
        var data = action.Data ?? string.Empty;
        if (ActionProgramContent.IsXActionBody(data))
        {
            data = ShareActionHelper.EmbedGlobalSubPrograms(data);
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
            Tags = normalizedTags ?? string.Empty,
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

    private static QuickerRpcActionPublishPreflightResult ToPreflightResult(
        string actionId,
        ActionPublishReadinessResult readiness)
    {
        string? sharedActionId = null;
        if (ActionContextResolver.TryResolve(actionId, out _, out var actionObj, out _)
            && actionObj is ActionItem action
            && !string.IsNullOrWhiteSpace(action.SharedActionId))
        {
            sharedActionId = action.SharedActionId;
        }
        else if (string.Equals(readiness.Mode, ActionPublishReadiness.ModeUpdate, StringComparison.OrdinalIgnoreCase))
        {
            sharedActionId = actionId;
        }

        return new QuickerRpcActionPublishPreflightResult
        {
            Ready = readiness.Ready,
            Mode = readiness.Mode,
            Message = readiness.Message,
            ActionId = actionId,
            SharedActionId = sharedActionId,
            Title = readiness.Title,
            Description = readiness.Description,
            Icon = readiness.Icon,
            IsPublic = readiness.IsPublic,
            Issues = readiness.Issues,
        };
    }

    private static QuickerRpcActionPublishPreflightResult PreflightFail(string? actionId, string message) =>
        new()
        {
            Ready = false,
            ActionId = actionId,
            Message = message,
            Issues =
            [
                new QuickerRpcActionPublishIssue
                {
                    Code = "INVALID_REQUEST",
                    Field = "actionId",
                    Message = message,
                    Severity = "error",
                },
            ],
        };

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

    private static QuickerRpcActionPublishResult FailWithReadiness(
        string actionId,
        ActionPublishReadinessResult readiness) =>
        new()
        {
            Ok = false,
            ActionId = actionId,
            Mode = readiness.Mode,
            Message = readiness.Message,
            Issues = readiness.Issues,
        };
}
