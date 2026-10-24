using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;

namespace QuickerRpc.Plugin.Adapters;

internal sealed class V1QuickerRpcHost : IQuickerRpcHost, IQuickerRpcResourceCatalogPageHost
{
    private readonly V1ResourceCatalogPageHost? _resourceCatalog;
    public V1QuickerRpcHost(
        V1SessionHost session,
        V1ActionProgramHost actionPrograms,
        V1ActionSharingHost actionSharing,
        V1SubProgramHost subPrograms,
        V1ActionRunHost actionRuns,
        V1ActionCatalogHost actionCatalog,
        V1SearchHost search,
        V1SettingsHost settings,
        V1ActionDocHost actionDocs,
        V1StepRunnerHost stepRunners,
        V1ExpressionHost expressions,
        V1ChromeControlHost chromeControl,
        V1TriggerHost triggers,
        V1DesignerHost designer,
        V1LauncherHost launcher,
        V1ResourceCatalogPageHost? resourceCatalog = null)
    {
        Info = new QuickerRpcHostInfo
        {
            Kind = QuickerHostKind.V1,
            QuickerVersion = TryGetQuickerVersion(),
            AdapterAssembly = typeof(V1QuickerRpcHost).Assembly.GetName().Name ?? "QuickerRpc.Plugin",
        };
        Capabilities = V1QuickerRpcHostCapabilities.Instance;
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
        ChromeControl = chromeControl;
        Triggers = triggers;
        Designer = designer;
        Launcher = launcher;
        _resourceCatalog = resourceCatalog;
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

    public bool CanRead(string kind) => _resourceCatalog?.CanRead(kind) ?? false;

    public Task<QuickerRpcResourceCatalogPageResult> GetResourceCatalogPageAsync(string kind,
        QuickerRpcResourceCatalogPageRequest request, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return _resourceCatalog is not null
            ? _resourceCatalog.GetResourceCatalogPageAsync(kind, request, cancellationToken)
            : Task.FromResult(new QuickerRpcResourceCatalogPageResult { Success = false, Kind = kind,
                ErrorCode = "UNSUPPORTED_HOST", ErrorMessage = "This host has no runtime resource catalog adapter." });
    }

    private static string TryGetQuickerVersion()
    {
        try
        {
            var quickerAsm = Assembly.Load("Quicker");
            return quickerAsm.GetName().Version?.ToString() ?? string.Empty;
        }
        catch
        {
            return string.Empty;
        }
    }
}
