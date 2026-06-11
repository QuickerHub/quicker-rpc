using System.ComponentModel;
using System.Threading;
using System.Threading.Tasks;
using ModelContextProtocol.Server;

namespace QuickerRpc.Console.Mcp;

[McpServerToolType]
public sealed class QkrpcMcpChromeTools
{
    private readonly QkrpcMcpRuntime _runtime;

    public QkrpcMcpChromeTools(QkrpcMcpRuntime runtime) => _runtime = runtime;

    [McpServerTool(Name = "qkrpc_chrome_control")]
    [Description(
        "Control the user's real browser (Chrome/Edge/Firefox with Quicker Connector extension). "
        + "Preserves login cookies — NOT the agent Playwright browser tool. "
        + "Operations match sys:chromecontrol: OpenUrl, RunScript, GetTabInfo, ActivateTab, GetElementInfo, … "
        + "Use qkrpc_step_runner_get key=sys:chromecontrol for parameter schema. "
        + "Reuse sessionId across calls; tabId from OpenUrl is auto-carried when omitted.")]
    public Task<string> QkrpcChromeControl(
        [Description("Operation name, e.g. OpenUrl, RunScript, GetTabInfo, ActivateTab, CloseTab, WaitTabComplete.")]
        string operation,
        [Description("JSON object of inputParams (operation may be omitted if passed here).")]
        string? parametersJson = null,
        [Description("Session id for browser/tab context reuse (default: default).")]
        string? sessionId = null,
        CancellationToken cancellationToken = default) =>
        _runtime.InvokeOpAsync(
            "chrome.run",
            QkrpcMcpJson.ToElement(new
            {
                operation = operation.Trim(),
                parametersJson,
                sessionId,
            }),
            cancellationToken);

    [McpServerTool(Name = "qkrpc_chrome_tabs")]
    [Description(
        "List open tabs in browsers connected to Quicker (Quicker Connector extension). "
        + "Use before chrome_control when you need tabId/url.")]
    public Task<string> QkrpcChromeTabs(CancellationToken cancellationToken = default) =>
        _runtime.InvokeOpAsync("chrome.tabs", default, cancellationToken);
}
