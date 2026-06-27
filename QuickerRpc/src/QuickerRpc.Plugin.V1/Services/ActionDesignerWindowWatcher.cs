using System;
using System.Diagnostics;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Threading;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Hooks <c>ActionDesignerWindow</c> load events and injects QuickerRpc chat/tools tabs.
/// WPF has no <c>UnregisterClassHandler</c>; we gate the handler with <see cref="_active"/>
/// and remove injected tabs on <see cref="StopAsync"/>.
/// </summary>
public sealed class ActionDesignerWindowWatcher : IHostedService
{
    private const int StartupReloadPassCount = 4;
    private const int StartupReloadPumpFrames = 40;

    private readonly ILogger<ActionDesignerWindowWatcher> _logger;

    private static volatile bool _active;
    private static int _handlersRegistered;
    private static readonly RoutedEventHandler LoadedHandler = OnDesignerLoaded;

    public ActionDesignerWindowWatcher(ILogger<ActionDesignerWindowWatcher> logger)
    {
        _logger = logger;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        QuickerDispatcherInvoke.BeginOnUiThreadIfNeeded(StartOnUiThread);
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        _active = false;
        ActionDesignerInjectionGate.Disable(_logger);
        QuickerDispatcherInvoke.OnUiThreadIfNeeded(ActionDesignerUiInjector.RemoveAllInjectedTabs);
        _logger.LogInformation("ActionDesignerWindow watcher stopped; injected tabs removed.");
        return Task.CompletedTask;
    }

    private void StartOnUiThread()
    {
        if (!ActionDesignerInjectionGate.TryEnableWatcher(_logger))
        {
            _active = false;
            return;
        }

        _active = true;

        var designerType = ActionDesignerReflection.DesignerWindowType;
        if (designerType is null)
        {
            _logger.LogDebug("ActionDesignerWindow type not found; designer injection disabled.");
            _active = false;
            return;
        }

        if (!ActionDesignerInjectionGate.CanRegisterService())
        {
            _active = false;
            return;
        }

        if (Interlocked.CompareExchange(ref _handlersRegistered, 1, 0) == 0)
        {
            EventManager.RegisterClassHandler(
                designerType,
                FrameworkElement.LoadedEvent,
                LoadedHandler);
            ActionDesignerGlobalSubProgramReferenceInjector.RegisterClassHandlers();
            _logger.LogInformation("ActionDesignerWindow Loaded handler registered for logged-in users.");
        }

        ReloadExistingDesigners();
        ActionDesignerGlobalSubProgramReferenceInjector.RegisterClassHandlers();
        ScheduleStartupReloadPasses();
    }

    private void ReloadExistingDesigners()
    {
        if (!_active || !CanInjectAnyTab())
        {
            return;
        }

        var count = ActionDesignerUiInjector.ReloadAllOpenDesigners();
        if (count > 0)
        {
            _logger.LogInformation("Reloaded QuickerRpc tab on {Count} open ActionDesigner window(s).", count);
        }
    }

    /// <summary>
    /// ToolTab may not be ready on the first UI tick after RPC host start; retry with dispatcher pumps.
    /// </summary>
    private void ScheduleStartupReloadPasses()
    {
        var dispatcher = QuickerDispatcherInvoke.AppDispatcher;
        if (dispatcher is null)
        {
            return;
        }

        for (var pass = 1; pass <= StartupReloadPassCount; pass++)
        {
            var passIndex = pass;
            _ = dispatcher.BeginInvoke(
                DispatcherPriority.Background,
                new Action(() =>
                {
                    if (!_active)
                    {
                        return;
                    }

                    for (var i = 0; i < StartupReloadPumpFrames; i++)
                    {
                        ActionDesignerUiSave.PumpDispatcherOnce();
                    }

                    if (!CanInjectAnyTab())
                    {
                        _active = false;
                        return;
                    }

                    var count = ActionDesignerUiInjector.ReloadAllOpenDesigners();
                    if (count > 0)
                    {
                        _logger.LogDebug(
                            "Startup reload pass {Pass} applied QuickerRpc tab to {Count} ActionDesigner window(s).",
                            passIndex,
                            count);
                    }
                }));
        }
    }

    private static void OnDesignerLoaded(object sender, RoutedEventArgs e)
    {
        if (!_active || !CanInjectAnyTab())
        {
            return;
        }

        if (sender is not Window designer)
        {
            return;
        }

        TryReloadDesigner(designer);
    }

    private static void TryReloadDesigner(Window designer)
    {
        if (!_active || !ActionDesignerReflection.IsDesignerWindow(designer) || !CanInjectAnyTab())
        {
            return;
        }

        try
        {
            ActionDesignerUiInjector.ReloadInject(
                designer,
                selectTab: ActionDesignerInjectionGate.ShouldAutoSelectToolsTabOnOpen());
        }
        catch (Exception ex)
        {
            Trace.TraceWarning("[QuickerRpc.Plugin] TryReloadDesigner failed: {0}", ex.Message);
        }
    }

    private static bool CanInjectAnyTab() =>
        ActionDesignerInjectionGate.CanInjectChatTab()
        || ActionDesignerInjectionGate.CanInjectToolsTab();
}
