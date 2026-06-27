using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Host;

/// <summary>Action Designer UI, clipboard STA, and authoring helpers (V1 optional port).</summary>
public interface IQuickerRpcDesignerHost
{
    Task<QuickerRpcActionUpdateResult> OpenActionEditorAsync(
        string actionId,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcActionUpdateResult> OpenSubProgramEditorAsync(
        string idOrName,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcClipboardSpecialFormatReadResult> ReadClipboardFormatAsync(
        string format,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcClipboardSpecialFormatWriteResult> WriteClipboardFormatAsync(
        string format,
        string text,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcDesignerSearchPageResult> SearchStepQuickInsertAsync(
        string? keyword,
        int skip,
        IList<QuickerRpcQuickInsertSubProgramInput>? subPrograms,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcDesignerSearchPageResult> SearchToolboxModulesAsync(
        string? keyword,
        int skip,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcDesignerContextResult> GetDesignerContextAsync(
        bool includeXAction = false,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcTextToolRunResult> RunTextToolAsync(
        string toolId,
        string? currentValue = null,
        int timeoutSeconds = 300,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcSearchFontAwesomeIconsResult> SearchFontAwesomeIconsAsync(
        string? query,
        int maxResults = 40,
        bool expand = false,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcResolveFontAwesomeIconsResult> ResolveFontAwesomeIconsAsync(
        IList<string> specs,
        CancellationToken cancellationToken = default);
}
