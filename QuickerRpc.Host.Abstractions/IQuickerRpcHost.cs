namespace QuickerRpc.Host;

/// <summary>
/// Root host surface for QuickerRpc plugin adapters.
/// One implementation is registered per Quicker process (V1 or V2, never both).
/// Required ports are always non-null; optional ports may be null — check <see cref="Capabilities"/> first.
/// </summary>
public interface IQuickerRpcHost
{
    QuickerRpcHostInfo Info { get; }

    IQuickerRpcHostCapabilities Capabilities { get; }

    IQuickerRpcSessionHost Session { get; }

    IQuickerRpcActionProgramHost ActionPrograms { get; }

    IQuickerRpcActionSharingHost ActionSharing { get; }

    IQuickerRpcSubProgramHost SubPrograms { get; }

    IQuickerRpcActionRunHost ActionRuns { get; }

    IQuickerRpcActionCatalogHost ActionCatalog { get; }

    IQuickerRpcSearchHost Search { get; }

    IQuickerRpcSettingsHost Settings { get; }

    IQuickerRpcActionDocHost ActionDocs { get; }

    IQuickerRpcStepRunnerHost StepRunners { get; }

    IQuickerRpcExpressionHost Expressions { get; }

    IQuickerRpcChromeControlHost? ChromeControl { get; }

    IQuickerRpcTriggerHost? Triggers { get; }

    IQuickerRpcDesignerHost? Designer { get; }

    IQuickerRpcLauncherHost? Launcher { get; }
}
