using System;

using System.Diagnostics;

using System.IO;

using System.Threading.Tasks;

using System.Windows;

using System.Windows.Controls;

using System.Windows.Media;

using Microsoft.Extensions.Logging.Abstractions;

using Microsoft.Web.WebView2.Core;

using Microsoft.Web.WebView2.Wpf;

using QuickerRpc.Plugin.Quicker;



namespace QuickerRpc.Plugin.Services;



/// <summary>

/// Content of the injected designer AI tab: probes QuickerAgent availability and

/// either embeds the chat page in a WebView2 or guides the user to launch/install.

/// </summary>

internal sealed class ActionDesignerAgentChatView : ContentControl, IDisposable

{

    private const int LaunchWaitAttempts = 20;

    private const int LaunchWaitDelayMs = 1500;

    private const int WebViewInitTimeoutMs = 45_000;



    private readonly Window _designer;

    private WebView2? _webView;

    private bool _started;

    private bool _disposed;

    private bool _busy;



    public ActionDesignerAgentChatView(Window designer)

    {

        _designer = designer;

        HorizontalContentAlignment = HorizontalAlignment.Stretch;

        VerticalContentAlignment = VerticalAlignment.Stretch;

    }



    /// <summary>Lazy start: probe + WebView2 init only once the tab is first selected.</summary>

    public void EnsureStarted()

    {

        if (_started || _disposed)

        {

            return;

        }



        _started = true;

        _ = RefreshAsync();

    }



    public void Dispose()

    {

        if (_disposed)

        {

            return;

        }



        _disposed = true;

        DisposeWebView();

        Content = null;

    }



    private async Task RefreshAsync()

    {

        if (_disposed || _busy)

        {

            return;

        }



        _busy = true;

        try

        {

            ShowMessage("正在检测 QuickerAgent…");

            var probe = await QuickerAgentUiProbe.ProbeAsync().ConfigureAwait(true);

            if (_disposed)

            {

                return;

            }



            switch (probe.Status)

            {

                case QuickerAgentUiStatus.Reachable:

                    await ShowChatAsync(probe.UiBaseUrl!).ConfigureAwait(true);

                    break;



                case QuickerAgentUiStatus.ProcessRunningNoUi:

                    ShowMessage(

                        "QuickerAgent 正在启动或界面服务未就绪。",

                        ("刷新", () => _ = RefreshAsync()));

                    break;



                case QuickerAgentUiStatus.InstalledNotRunning:

                    ShowMessage(

                        "QuickerAgent 尚未运行。",

                        ("启动 QuickerAgent", () => _ = LaunchAndWaitAsync()),

                        ("刷新", () => _ = RefreshAsync()));

                    break;



                case QuickerAgentUiStatus.NotInstalled:

                default:

                    ShowMessage(

                        "未检测到 QuickerAgent 桌面版。\n安装后即可在设计器中直接与 AI 对话编辑动作。",

                        ("下载安装 QuickerAgent", OnDownloadClick),

                        ("刷新", () => _ = RefreshAsync()));

                    break;

            }

        }

        finally

        {

            _busy = false;

        }

    }



    private async Task LaunchAndWaitAsync()

    {

        if (_disposed || _busy)

        {

            return;

        }



        _busy = true;

        try

        {

            ShowMessage("正在启动 QuickerAgent…");

            var outcome = await Task.Run(

                () => QuickerAgentLaunchService.TryLaunchOrActivate(NullLogger.Instance))

                .ConfigureAwait(true);



            if (outcome is QuickerAgentLaunchOutcome.NotInstalled or QuickerAgentLaunchOutcome.Failed)

            {

                _busy = false;

                _ = RefreshAsync();

                return;

            }



            for (var i = 0; i < LaunchWaitAttempts && !_disposed; i++)

            {

                var probe = await QuickerAgentUiProbe.ProbeAsync().ConfigureAwait(true);

                if (probe.Status == QuickerAgentUiStatus.Reachable)

                {

                    await ShowChatAsync(probe.UiBaseUrl!).ConfigureAwait(true);

                    return;

                }



                ShowMessage($"等待 QuickerAgent 界面就绪…（{i + 1}/{LaunchWaitAttempts}）");

                await Task.Delay(LaunchWaitDelayMs).ConfigureAwait(true);

            }



            ShowMessage(

                "QuickerAgent 已启动，但界面服务未在预期时间内就绪。",

                ("刷新", () => _ = RefreshAsync()));

        }

        finally

        {

            _busy = false;

        }

    }



    private void OnDownloadClick()

    {

        try

        {

            Launcher.GetService<QuickerAgentUpdateCheckService>().ScheduleCheckAndNotify();

        }

        catch (Exception ex)

        {

            Trace.TraceWarning("[QuickerRpc.Plugin] QuickerAgent download prompt failed: {0}", ex.Message);

            QuickerAppHelperAccess.TryOpenUrlOrFile(QuickerAgentUpdateCheckService.DownloadPrefix);

        }

    }



    private async Task ShowChatAsync(string uiBaseUrl)

    {

        var chatUrl = BuildChatUrl(uiBaseUrl);

        try

        {

            if (_webView is null)

            {

                var webView = new WebView2

                {

                    HorizontalAlignment = HorizontalAlignment.Stretch,

                    VerticalAlignment = VerticalAlignment.Stretch,

                    CreationProperties = CreateDesignerWebViewCreationProperties(),

                };



                // WPF WebView2 must be in the visual tree before EnsureCoreWebView2Async (Quicker pattern).

                Content = webView;



                var initTask = webView.EnsureCoreWebView2Async();

                var completed = await Task.WhenAny(

                    initTask,

                    Task.Delay(WebViewInitTimeoutMs)).ConfigureAwait(true);

                if (completed != initTask)

                {

                    throw new TimeoutException("WebView2 初始化超时。");

                }



                await initTask.ConfigureAwait(true);

                if (_disposed)

                {

                    webView.Dispose();

                    return;

                }



                webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = true;

                webView.CoreWebView2.Settings.IsStatusBarEnabled = false;

                _webView = webView;

            }



            _webView.Source = new Uri(chatUrl);

        }

        catch (Exception ex)

        {

            Trace.TraceWarning("[QuickerRpc.Plugin] Designer chat WebView2 init failed: {0}", ex.Message);

            DisposeWebView();

            ShowMessage(

                "内嵌浏览器初始化失败（需要 WebView2 运行时）。\n" + ex.Message,

                ("在浏览器中打开", () => QuickerAppHelperAccess.TryOpenUrlOrFile(chatUrl)),

                ("重试", () => _ = RefreshAsync()));

        }

    }



    private string BuildChatUrl(string uiBaseUrl)

    {

        var entityId = ActionDesignerContext.TryReadDesignerEntityId(_designer) ?? string.Empty;

        var isSubProgram = ActionDesignerContext.IsSubProgramDesigner(_designer) ? "1" : "0";

        return $"{uiBaseUrl}/?embed=action-designer&entityId={Uri.EscapeDataString(entityId)}&isSubProgram={isSubProgram}";

    }



    private static CoreWebView2CreationProperties CreateDesignerWebViewCreationProperties()

    {

        var userDataFolder = Path.Combine(

            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),

            "Programs",

            "qkrpc",

            "designer-agent-webview2");

        Directory.CreateDirectory(userDataFolder);

        return new CoreWebView2CreationProperties

        {

            UserDataFolder = userDataFolder,

        };

    }



    private void DisposeWebView()

    {

        var webView = _webView;

        _webView = null;

        if (webView is null)

        {

            return;

        }



        try

        {

            if (ReferenceEquals(Content, webView))

            {

                Content = null;

            }



            webView.Dispose();

        }

        catch (Exception ex)

        {

            Trace.TraceWarning("[QuickerRpc.Plugin] Designer chat WebView2 dispose failed: {0}", ex.Message);

        }

    }



    private void ShowMessage(string text, params (string Label, Action OnClick)[] buttons)

    {

        var panel = new StackPanel

        {

            Margin = new Thickness(16),

            VerticalAlignment = VerticalAlignment.Center,

            HorizontalAlignment = HorizontalAlignment.Center,

        };



        panel.Children.Add(new TextBlock

        {

            Text = text,

            TextWrapping = TextWrapping.Wrap,

            TextAlignment = TextAlignment.Center,

            Foreground = new SolidColorBrush(Color.FromRgb(0x5C, 0x6B, 0x7A)),

            Margin = new Thickness(0, 0, 0, 12),

            MaxWidth = 320,

        });



        foreach (var (label, onClick) in buttons)

        {

            var button = new Button

            {

                Content = label,

                Margin = new Thickness(0, 0, 0, 8),

                Padding = new Thickness(14, 6, 14, 6),

                HorizontalAlignment = HorizontalAlignment.Center,

                MinWidth = 180,

            };

            button.Click += (_, _) => onClick();

            panel.Children.Add(button);

        }



        Content = panel;

    }

}


