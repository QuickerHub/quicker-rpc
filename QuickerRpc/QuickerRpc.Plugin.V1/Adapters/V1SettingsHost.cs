using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.Adapters;

internal sealed class V1SettingsHost : IQuickerRpcSettingsHost
{
    private readonly QuickerSettingsService _settings;
    private readonly QuickerSettingsUiService _ui;

    public V1SettingsHost(QuickerSettingsService settings, QuickerSettingsUiService ui)
    {
        _settings = settings;
        _ui = ui;
    }

    public Task<QuickerRpcSearchSettingsResult> SearchAsync(
        string? query,
        int maxResults = 30,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_settings.Search(query, maxResults));
    }

    public Task<QuickerRpcListSettingsResult> ListAsync(
        string? scope = null,
        int maxResults = 100,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_settings.List(scope, maxResults));
    }

    public Task<QuickerRpcGetSettingResult> GetAsync(
        string key,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_settings.Get(key));
    }

    public Task<QuickerRpcSetSettingResult> SetAsync(
        string key,
        string value,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_settings.Set(key, value));
    }

    public Task<QuickerRpcApplySettingsResult> ApplyAsync(
        IList<QuickerRpcSettingChangeItem> changes,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_settings.Apply(changes));
    }

    public Task<QuickerRpcListSettingsPagesResult> ListPagesAsync(
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_ui.ListPages());
    }

    public Task<QuickerRpcListSettingsDirectLinksResult> ListDirectLinksAsync(
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_ui.ListDirectLinks());
    }

    public Task<QuickerRpcOpenSettingsUiResult> OpenUiAsync(
        string? target,
        string? exeFile = null,
        string? searchText = null,
        string? query = null,
        string? settingKey = null,
        string? preset = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_ui.Open(target, query, settingKey, exeFile, searchText, preset));
    }

    public Task<QuickerRpcResolveSettingsIntentResult> ResolveIntentAsync(
        string? query = null,
        string? settingKey = null,
        string? preset = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_ui.ResolveIntent(query, settingKey, preset));
    }
}
