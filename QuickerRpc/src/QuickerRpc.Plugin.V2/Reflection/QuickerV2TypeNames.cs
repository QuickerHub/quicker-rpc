namespace QuickerRpc.Plugin.V2.Reflection;

/// <summary>Stable V2 type names probed from tools/quicker-host/net10 (Quicker 2.x).</summary>
internal static class QuickerV2TypeNames
{
    public const string Launcher = "Quicker.Domain.Services.Launcher";
    public const string AppState = "Quicker.Domain.AppState";

    public const string ISyncService = "Quicker.Domain.Services.ISyncService";
    public const string SyncService = "Quicker.Domain.Services.SyncService";

    public const string ActionRuntimeLookupService = "Quicker.Domain.Services.Actions.ActionRuntimeLookupService";
    public const string ActionItem2Store = "Quicker.Domain.Services.ActionItem2Store";
    public const string ActionEditingStateService = "Quicker.Domain.Services.ActionEditingStateService";
    public const string ProfileManager = "Quicker.Domain.Profiles.ProfileManager";
    public const string ActionPageCommandService = "Quicker.Infrastructure.Data.Services.ActionPageCommandService";
    public const string ActionDeleteCommandService = "Quicker.Domain.Services.ActionDeleteCommandService";
    public const string FloatActionService = "Quicker.Domain.Floating.FloatActionService";
    public const string ActionItem2Extensions = "Quicker.Utilities.Extensions.ActionItem2Extensions";

    public const string ActionItem2 = "Quicker.Common.V2.ActionItem2";
    public const string ActionMetadata = "Quicker.Common.V2.ActionMetadata";
    public const string OperationPresentation = "Quicker.Common.V2.OperationPresentation";
    public const string ActionPresentation = "Quicker.Common.V2.ActionPresentation";
    public const string OperationTypes = "Quicker.Common.V2.OperationTypes";
    public const string IOperationPayload = "Quicker.Common.V2.IOperationPayload";
    public const string XActionDto = "Quicker.Common.ActionPayloads.XAction.XActionDto";
    public const string ActionItem2Converter = "Quicker.Common.V2.ActionItem2Converter";

    public const string GlobalSubProgramDataService = "Quicker.ReactiveData.GlobalSubProgramDataService";
    public const string IGlobalSubProgramDataService = "Quicker.ReactiveData.IGlobalSubProgramDataService";
    public const string SubProgram = "Quicker.Domain.Actions.X.SubProgram";
    public const string SubProgramHelper = "Quicker.Domain.Actions.X.SubPrograms.SubProgramHelper";
    public const string StorageActionStep = "Quicker.Domain.Actions.X.Storage.ActionStep";
    public const string StorageActionVariable = "Quicker.Domain.Actions.X.Storage.ActionVariable";

    public const string IStepRunnerService = "Quicker.Domain.Actions.X.StepRunners.IStepRunnerService";
    public const string ActionWithLocation = "Quicker.Domain.Services.ActionWithLocation";
    public const string ActionLocation = "Quicker.Domain.Services.ActionLocation";
    public const string IActionSearchService = "Quicker.Domain.Services.IActionSearchService";
    public const string IUserInfoService = "Quicker.Domain.Services.IUserInfoService";
    public const string IApplicationSettingsService = "Quicker.Domain.Services.IApplicationSettingsService";
    public const string IExeSettingsService = "Quicker.Domain.Services.IExeSettingsService";
    public const string UserSettings2 = "Quicker.Common.V2.Settings.UserSettings2";
    public const string ExeSettings2 = "Quicker.Common.V2.ExeSettings2";
    public const string InternalState = "Quicker.Domain.Services.InternalState";
}
