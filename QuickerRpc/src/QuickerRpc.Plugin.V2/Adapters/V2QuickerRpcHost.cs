using QuickerRpc.Host;
using QuickerRpc.Plugin.V2.Reflection;

namespace QuickerRpc.Plugin.V2.Adapters;

internal sealed class V2QuickerRpcHost : IQuickerRpcHost
{
    public V2QuickerRpcHost(
        V2SessionHost session,
        V2ActionProgramHost actionPrograms,
        V2ActionSharingHost actionSharing,
        V2SubProgramHost subPrograms,
        V2ActionRunHost actionRuns,
        V2ActionCatalogHost actionCatalog,
        V2SearchHost search,
        V2SettingsHost settings,
        V2ActionDocHost actionDocs,
        V2StepRunnerHost stepRunners,
        V2ExpressionHost expressions)
    {
        Info = new QuickerRpcHostInfo
        {
            Kind = QuickerHostKind.V2,
            QuickerVersion = QuickerV2Runtime.TryGetQuickerVersion(),
            AdapterAssembly = typeof(V2QuickerRpcHost).Assembly.GetName().Name ?? "QuickerRpc.Plugin.V2",
        };
        Capabilities = V2QuickerRpcHostCapabilities.Instance;
        Session = session;
        ActionPrograms = actionPrograms;
        ActionSharing = actionSharing;
        SubPrograms = subPrograms;
        ActionRuns = actionRuns;
        ActionCatalog = actionCatalog;
        Search = search;
        Settings = settings;
        ActionDocs = actionDocs;
        StepRunners = stepRunners;
        Expressions = expressions;
        ChromeControl = null;
        Triggers = null;
        Designer = null;
        Launcher = null;
    }

    public QuickerRpcHostInfo Info { get; }

    public IQuickerRpcHostCapabilities Capabilities { get; }

    public IQuickerRpcSessionHost Session { get; }

    public IQuickerRpcActionProgramHost ActionPrograms { get; }

    public IQuickerRpcActionSharingHost ActionSharing { get; }

    public IQuickerRpcSubProgramHost SubPrograms { get; }

    public IQuickerRpcActionRunHost ActionRuns { get; }

    public IQuickerRpcActionCatalogHost ActionCatalog { get; }

    public IQuickerRpcSearchHost Search { get; }

    public IQuickerRpcSettingsHost Settings { get; }

    public IQuickerRpcActionDocHost ActionDocs { get; }

    public IQuickerRpcStepRunnerHost StepRunners { get; }

    public IQuickerRpcExpressionHost Expressions { get; }

    public IQuickerRpcChromeControlHost? ChromeControl { get; }

    public IQuickerRpcTriggerHost? Triggers { get; }

    public IQuickerRpcDesignerHost? Designer { get; }

    public IQuickerRpcLauncherHost? Launcher { get; }
}
