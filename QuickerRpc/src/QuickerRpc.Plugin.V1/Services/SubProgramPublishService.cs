using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Quicker.Common;
using Quicker.Common.Entities;
using Quicker.Common.Vm;
using Quicker.Domain;
using Quicker.Domain.Actions.X;
using Quicker.Utilities;
using Quicker.View.Share;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Headless share/update of global subprograms on getquicker.net (mirrors ShareSubProgramWindow).
/// </summary>
public sealed class SubProgramPublishService
{
    private const string ModePublish = "publish";
    private const string ModeUpdate = "update";

    private readonly DataServiceSubProgramAccessor? _subPrograms;
    private readonly Lazy<WebConnectorAccessor?> _webConnector =
        new(WebConnectorAccessor.TryCreate, System.Threading.LazyThreadSafetyMode.ExecutionAndPublication);

    public SubProgramPublishService()
    {
        _subPrograms = DataServiceSubProgramAccessor.TryCreate();
    }

    public Task<QuickerRpcActionPublishPreflightResult> PreflightPublishSharedSubProgramAsync(
        string subProgramIdOrName,
        QuickerRpcActionPublishRequest request,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var key = (subProgramIdOrName ?? string.Empty).Trim();
        if (key.Length == 0)
        {
            return Task.FromResult(PreflightFail(null, "subProgram id or name is required."));
        }

        request ??= new QuickerRpcActionPublishRequest();
        var readiness = BuildReadiness(key, request);
        return Task.FromResult(ToPreflightResult(key, readiness));
    }

    public async Task<QuickerRpcActionPublishResult> PublishSharedSubProgramAsync(
        string subProgramIdOrName,
        QuickerRpcActionPublishRequest request,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var key = (subProgramIdOrName ?? string.Empty).Trim();
        if (key.Length == 0)
        {
            return Fail(null, "subProgram id or name is required.");
        }

        request ??= new QuickerRpcActionPublishRequest();
        var readiness = BuildReadiness(key, request);
        if (!readiness.Ready)
        {
            return FailWithReadiness(key, readiness);
        }

        if (_subPrograms is null)
        {
            return Fail(key, "Not running inside Quicker (DataService unavailable).");
        }

        if (_webConnector.Value is null)
        {
            return Fail(key, "Not running inside Quicker (WebConnector unavailable).");
        }

        if (!_subPrograms.TryGetByIdOrName(key, out var subProgram, out var loadError) || subProgram is null)
        {
            return Fail(key, loadError ?? $"Subprogram not found: {key}");
        }

        var mode = readiness.Mode!;
        var title = readiness.Title!;
        var description = readiness.Description!;
        var sharedLibraryId = ResolveSharedLibraryId(key, subProgram, mode);

        var vm = BuildSharedActionVm(subProgram, request, title, description, sharedLibraryId, mode);
        var (shareOk, shareMessage, sharedDto) = await _webConnector.Value!
            .ShareSubProgramAsync(vm, overwrite: true)
            .ConfigureAwait(true);
        if (!shareOk || sharedDto is null)
        {
            return Fail(subProgram.Id ?? key, string.IsNullOrWhiteSpace(shareMessage) ? "Share failed." : shareMessage);
        }

        subProgram.SharedId = sharedDto.Id.ToString("D");
        subProgram.ShareTimeUtc = sharedDto.LastUpdateTimeUtc ?? DateTime.UtcNow;
        if (!_subPrograms.TrySave(subProgram, out var saveError))
        {
            var sharedId = sharedDto.Id.ToString("D");
            return new QuickerRpcActionPublishResult
            {
                Ok = true,
                Mode = mode,
                ActionId = subProgram.Id,
                SharedActionId = sharedId,
                ShareUrl = TryCreateShareUrl(sharedId),
                Revision = sharedDto.Revision,
                IsPublic = sharedDto.IsPublic,
                Message = $"Shared successfully but failed to save local metadata: {saveError}",
            };
        }

        var libraryId = sharedDto.Id.ToString("D");
        return new QuickerRpcActionPublishResult
        {
            Ok = true,
            Mode = mode,
            ActionId = subProgram.Id,
            SharedActionId = libraryId,
            ShareUrl = TryCreateShareUrl(libraryId),
            Revision = sharedDto.Revision,
            IsPublic = sharedDto.IsPublic,
            Message = string.Equals(mode, ModeUpdate, StringComparison.OrdinalIgnoreCase)
                ? $"子程序已更新：{libraryId}"
                : $"子程序已分享：{TryCreateShareUrl(libraryId)}",
        };
    }

    private static SharedActionVm BuildSharedActionVm(
        SubProgram subProgram,
        QuickerRpcActionPublishRequest request,
        string title,
        string description,
        Guid? sharedLibraryId,
        string mode)
    {
        var data = JsonConvert.SerializeObject(subProgram);
        data = ShareActionHelper.EmbedGlobalSubPrograms(data);

        return new SharedActionVm
        {
            AsSubProgram = true,
            Id = sharedLibraryId,
            ActionType = ActionType.XSubProgram,
            Children = null,
            Title = title,
            Description = description,
            Data = data,
            Data2 = string.Empty,
            Data3 = string.Empty,
            InternalId = subProgram.Id,
            SourceSharedActionId = subProgram.TemplateId,
            SourceSharedActionRevision = subProgram.TemplateRevision,
            SourceProfileId = string.Empty,
            Language = Thread.CurrentThread.CurrentCulture.Name,
            Icon = subProgram.Icon,
            Tags = string.Empty,
            Note = string.Empty,
            IsPublic = request.IsPublic,
            ChangeLog = string.Equals(mode, ModeUpdate, StringComparison.OrdinalIgnoreCase)
                ? request.ChangeLog ?? string.Empty
                : string.Empty,
            SoftVersion = AppHelper.GetSoftVersion(),
            UserLimitation = ActionUserLimitation.None,
            ExeFile = ActionProfile.ExeName_SubProgram,
            ExeFullpath = ActionProfile.ExeName_SubProgram,
            Keywords = request.Keywords ?? string.Empty,
        };
    }

    private ReadinessResult BuildReadiness(string key, QuickerRpcActionPublishRequest request)
    {
        var issues = new List<QuickerRpcActionPublishIssue>();
        SubProgram? subProgram = null;
        if (_subPrograms?.TryGetByIdOrName(key, out subProgram, out _) == true && subProgram is not null)
        {
            // resolved local subprogram
        }
        else if (Guid.TryParse(key, out _))
        {
            // shared library id only — update path without local instance is not supported yet
            issues.Add(Issue(
                "SUBPROGRAM_NOT_FOUND",
                "id",
                $"Local subprogram not found: {key}. Open/sync the subprogram in Quicker first."));
        }
        else
        {
            issues.Add(Issue(
                "SUBPROGRAM_NOT_FOUND",
                "id",
                $"Subprogram not found: {key}"));
        }

        var mode = ResolveMode(key, subProgram);
        if (string.Equals(mode, ModeUpdate, StringComparison.OrdinalIgnoreCase)
            && string.IsNullOrWhiteSpace(request.ChangeLog))
        {
            issues.Add(Issue(
                "MISSING_CHANGELOG",
                "changelog",
                "Change log is required when updating a shared subprogram (--changelog or --changelog-file)."));
        }

        if (string.Equals(mode, ModePublish, StringComparison.OrdinalIgnoreCase))
        {
            if (_webConnector.Value is null)
            {
                issues.Add(Issue(
                    "WEBCONNECTOR_UNAVAILABLE",
                    null,
                    "Not running inside Quicker (WebConnector unavailable)."));
            }

            var title = FirstNonEmpty(request.Title, subProgram?.Name);
            var description = FirstNonEmpty(request.Description, subProgram?.Description);
            if (string.IsNullOrWhiteSpace(title))
            {
                issues.Add(Issue(
                    "MISSING_TITLE",
                    "title",
                    "Title is required for first publish (--title or subprogram name)."));
            }

            if (string.IsNullOrWhiteSpace(description))
            {
                issues.Add(Issue(
                    "MISSING_DESCRIPTION",
                    "description",
                    "Description is required for first publish (--description or subprogram description)."));
            }
        }

        if (!string.IsNullOrWhiteSpace(request.Note))
        {
            issues.Add(Issue(
                "DEPRECATED_SHARE_NOTE",
                "note",
                "Deprecated share note is not supported for subprograms; omit --note / --share-note."));
        }

        var ready = issues.Count == 0;
        return new ReadinessResult
        {
            Ready = ready,
            Mode = mode,
            Title = FirstNonEmpty(request.Title, subProgram?.Name),
            Description = FirstNonEmpty(request.Description, subProgram?.Description),
            Message = ready ? null : "Preflight failed.",
            Issues = issues,
        };
    }

    private static string ResolveMode(string key, SubProgram? subProgram)
    {
        if (subProgram is not null && !string.IsNullOrWhiteSpace(subProgram.SharedId))
        {
            return ModeUpdate;
        }

        if (subProgram is null && Guid.TryParse(key, out _))
        {
            return ModeUpdate;
        }

        return ModePublish;
    }

    private static Guid? ResolveSharedLibraryId(string key, SubProgram subProgram, string mode)
    {
        if (!string.Equals(mode, ModeUpdate, StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        if (!string.IsNullOrWhiteSpace(subProgram.SharedId) && Guid.TryParse(subProgram.SharedId, out var fromLocal))
        {
            return fromLocal;
        }

        return Guid.TryParse(key, out var fromKey) ? fromKey : null;
    }

    private static QuickerRpcActionPublishPreflightResult ToPreflightResult(string subProgramId, ReadinessResult readiness)
    {
        string? sharedId = null;
        if (readiness.Mode == ModeUpdate)
        {
            sharedId = subProgramId;
        }

        return new QuickerRpcActionPublishPreflightResult
        {
            Ready = readiness.Ready,
            Mode = readiness.Mode,
            Message = readiness.Message,
            ActionId = subProgramId,
            SharedActionId = sharedId,
            Title = readiness.Title,
            Description = readiness.Description,
            Issues = readiness.Issues,
        };
    }

    private static QuickerRpcActionPublishResult Fail(string? subProgramId, string message) =>
        new()
        {
            Ok = false,
            ActionId = subProgramId,
            Message = message,
        };

    private static QuickerRpcActionPublishResult FailWithReadiness(string subProgramId, ReadinessResult readiness) =>
        new()
        {
            Ok = false,
            ActionId = subProgramId,
            Mode = readiness.Mode,
            Message = readiness.Message ?? "Publish failed.",
            Issues = readiness.Issues,
        };

    private static QuickerRpcActionPublishPreflightResult PreflightFail(string? subProgramId, string message) =>
        new()
        {
            Ready = false,
            ActionId = subProgramId,
            Message = message,
            Issues =
            [
                Issue("INVALID_REQUEST", null, message),
            ],
        };

    private static QuickerRpcActionPublishIssue Issue(string code, string? field, string message) =>
        new() { Code = code, Field = field, Message = message };

    private static string? FirstNonEmpty(params string?[] values)
    {
        foreach (var value in values)
        {
            if (!string.IsNullOrWhiteSpace(value))
            {
                return value.Trim();
            }
        }

        return null;
    }

    private static string? TryCreateShareUrl(string sharedId) =>
        string.IsNullOrWhiteSpace(sharedId) ? null : AppHelper.CreateSharedSubProgramLink(sharedId);

    private sealed class ReadinessResult
    {
        public bool Ready { get; set; }

        public string? Mode { get; set; }

        public string? Title { get; set; }

        public string? Description { get; set; }

        public string? Message { get; set; }

        public List<QuickerRpcActionPublishIssue> Issues { get; set; } = new();
    }
}
