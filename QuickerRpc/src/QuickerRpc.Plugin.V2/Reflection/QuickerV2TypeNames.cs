namespace QuickerRpc.Plugin.V2.Reflection;

/// <summary>Stable V2 type names probed from tools/quicker-host/net10 (Quicker 2.x).</summary>
internal static class QuickerV2TypeNames
{
    public const string Launcher = "Quicker.Domain.Services.Launcher";
    public const string AppState = "Quicker.Domain.AppState";

    public const string ActionRuntimeLookupService = "Quicker.Domain.Services.Actions.ActionRuntimeLookupService";
    public const string ActionItem2Store = "Quicker.Domain.Services.ActionItem2Store";
    public const string ActionEditingStateService = "Quicker.Domain.Services.ActionEditingStateService";
    public const string ActionItem2Extensions = "Quicker.Utilities.Extensions.ActionItem2Extensions";

    public const string ActionItem2 = "Quicker.Common.V2.ActionItem2";
    public const string ActionMetadata = "Quicker.Common.V2.ActionMetadata";
    public const string ActionPresentation = "Quicker.Common.V2.ActionPresentation";

    public const string GlobalSubProgramDataService = "Quicker.ReactiveData.GlobalSubProgramDataService";
    public const string SubProgram = "Quicker.Domain.Actions.X.SubProgram";
    public const string SubProgramHelper = "Quicker.Domain.Actions.X.SubPrograms.SubProgramHelper";
    public const string StorageActionStep = "Quicker.Domain.Actions.X.Storage.ActionStep";
    public const string StorageActionVariable = "Quicker.Domain.Actions.X.Storage.ActionVariable";

    public const string IStepRunnerService = "Quicker.Domain.Actions.X.StepRunners.IStepRunnerService";
    public const string ActionWithLocation = "Quicker.Domain.Services.ActionWithLocation";
    public const string ActionLocation = "Quicker.Domain.Services.ActionLocation";
    public const string IActionSearchService = "Quicker.Domain.Services.IActionSearchService";
    public const string IUserInfoService = "Quicker.Domain.Services.IUserInfoService";
}
