using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.Adapters;

internal sealed class V1ChromeControlHost : IQuickerRpcChromeControlHost
{
    private readonly ChromeControlExecuteService _chrome;

    public V1ChromeControlHost(ChromeControlExecuteService chrome) => _chrome = chrome;

    public Task<QuickerRpcChromeControlResult> ExecuteAsync(
        string operation,
        string? parametersJson = null,
        string? sessionId = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_chrome.Execute(operation, parametersJson, sessionId));
    }

    public Task<QuickerRpcChromeControlTabsResult> ListTabsAsync(
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_chrome.ListTabs());
    }
}
