using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Host;

/// <summary>Quicker settings catalog read/write and settings UI navigation.</summary>
public interface IQuickerRpcSettingsHost
{
    Task<QuickerRpcSearchSettingsResult> SearchAsync(
        string? query,
        int maxResults = 30,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcListSettingsResult> ListAsync(
        string? scope = null,
        int maxResults = 100,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcGetSettingResult> GetAsync(
        string key,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcSetSettingResult> SetAsync(
        string key,
        string value,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcApplySettingsResult> ApplyAsync(
        IList<QuickerRpcSettingChangeItem> changes,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcListSettingsPagesResult> ListPagesAsync(
        CancellationToken cancellationToken = default);

    Task<QuickerRpcListSettingsDirectLinksResult> ListDirectLinksAsync(
        CancellationToken cancellationToken = default);

    Task<QuickerRpcOpenSettingsUiResult> OpenUiAsync(
        string? target,
        string? exeFile = null,
        string? searchText = null,
        string? query = null,
        string? settingKey = null,
        string? preset = null,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcResolveSettingsIntentResult> ResolveIntentAsync(
        string? query = null,
        string? settingKey = null,
        string? preset = null,
        CancellationToken cancellationToken = default);
}
