using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.Adapters;

internal sealed class V1DesignerHost : IQuickerRpcDesignerHost
{
    private readonly ActionEditService _actionEdit;
    private readonly HeadlessSubProgramProgramService _subPrograms;
    private readonly HeadlessActionProgramService _programs;
    private readonly TextToolRunService _textTool;
    private readonly FontAwesomeIconSearchService _icons;

    public V1DesignerHost(
        ActionEditService actionEdit,
        HeadlessSubProgramProgramService subPrograms,
        HeadlessActionProgramService programs,
        TextToolRunService textTool,
        FontAwesomeIconSearchService icons)
    {
        _actionEdit = actionEdit;
        _subPrograms = subPrograms;
        _programs = programs;
        _textTool = textTool;
        _icons = icons;
    }

    public Task<QuickerRpcActionUpdateResult> OpenActionEditorAsync(
        string actionId,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_actionEdit.EditAction(actionId));
    }

    public Task<QuickerRpcActionUpdateResult> OpenSubProgramEditorAsync(
        string idOrName,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_subPrograms.EditSubProgram(idOrName));
    }

    public Task<QuickerRpcClipboardSpecialFormatReadResult> ReadClipboardFormatAsync(
        string format,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(
            QuickerDispatcherInvoke.OnUiThreadIfNeeded(() => ClipboardSpecialFormatService.Read(format))
            ?? new QuickerRpcClipboardSpecialFormatReadResult
            {
                Success = false,
                ErrorMessage = "Clipboard read unavailable.",
            });
    }

    public Task<QuickerRpcClipboardSpecialFormatWriteResult> WriteClipboardFormatAsync(
        string format,
        string text,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(
            QuickerDispatcherInvoke.OnUiThreadIfNeeded(() => ClipboardSpecialFormatService.Write(format, text))
            ?? new QuickerRpcClipboardSpecialFormatWriteResult
            {
                Success = false,
                ErrorMessage = "Clipboard write unavailable.",
            });
    }

    public Task<QuickerRpcDesignerSearchPageResult> SearchStepQuickInsertAsync(
        string? keyword,
        int skip,
        IList<QuickerRpcQuickInsertSubProgramInput>? subPrograms,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_programs.SearchStepQuickInsert(keyword, skip, subPrograms));
    }

    public Task<QuickerRpcDesignerSearchPageResult> SearchToolboxModulesAsync(
        string? keyword,
        int skip,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_programs.SearchToolboxModules(keyword, skip));
    }

    public Task<QuickerRpcDesignerContextResult> GetDesignerContextAsync(
        bool includeXAction = false,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(
            QuickerDispatcherInvoke.OnUiThreadIfNeeded(
                () => ActionDesignerContextSnapshot.Collect(includeXAction))
            ?? new QuickerRpcDesignerContextResult
            {
                Ok = false,
                Message = "Designer context unavailable.",
            });
    }

    public Task<QuickerRpcTextToolRunResult> RunTextToolAsync(
        string toolId,
        string? currentValue = null,
        int timeoutSeconds = 300,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var timeoutMs = timeoutSeconds > 0 ? timeoutSeconds * 1000 : 300_000;
        return Task.FromResult(_textTool.Run(toolId, currentValue, timeoutMs));
    }

    public Task<QuickerRpcSearchFontAwesomeIconsResult> SearchFontAwesomeIconsAsync(
        string? query,
        int maxResults = 40,
        bool expand = false,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_icons.Search(query, maxResults, expand));
    }

    public Task<QuickerRpcResolveFontAwesomeIconsResult> ResolveFontAwesomeIconsAsync(
        IList<string> specs,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_icons.ResolveMany(specs));
    }
}
