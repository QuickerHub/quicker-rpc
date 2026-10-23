using Newtonsoft.Json.Linq;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;
using QuickerRpc.Plugin.V2.Reflection;

namespace QuickerRpc.Plugin.V2.Adapters;

internal sealed class V2DesignerReadHost : IQuickerRpcDesignerHost, IQuickerRpcDesignerReadAvailability
{
    private const string UnsupportedMessage = "UNSUPPORTED_HOST: The selected V2 host does not provide this Designer operation.";
    private readonly IV2DesignerReadNativePort _native;
    public V2DesignerReadHost() : this(new V2DesignerReadNativePort()) { }
    internal V2DesignerReadHost(IV2DesignerReadNativePort native) => _native = native;

    public bool IsStepQuickInsertAvailable => _native.IsQuickInsertAvailable;
    public bool IsToolboxModulesAvailable => _native.IsToolboxAvailable;
    public bool IsFontAwesomeGeometryAvailable => _native.IsFaGeometryAvailable;

    public Task<QuickerRpcDesignerSearchPageResult> SearchStepQuickInsertAsync(string? keyword, int skip,
        IList<QuickerRpcQuickInsertSubProgramInput>? subPrograms, CancellationToken cancellationToken = default) =>
        SearchAsync(keyword, skip, subPrograms, quickInsert: true, cancellationToken);

    public Task<QuickerRpcDesignerSearchPageResult> SearchToolboxModulesAsync(string? keyword, int skip, CancellationToken cancellationToken = default) =>
        SearchAsync(keyword, skip, null, quickInsert: false, cancellationToken);

    private async Task<QuickerRpcDesignerSearchPageResult> SearchAsync(string? keyword, int skip,
        IList<QuickerRpcQuickInsertSubProgramInput>? subPrograms, bool quickInsert, CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        try
        {
            var available = quickInsert ? IsStepQuickInsertAvailable : IsToolboxModulesAvailable;
            token.ThrowIfCancellationRequested();
            if (!available) return new() { Success = false, ErrorMessage = UnsupportedMessage };
            var request = new JObject { ["keyword"] = keyword ?? "", ["skip"] = Math.Max(0, skip) };
            if (quickInsert)
                request["subPrograms"] = new JArray((subPrograms ?? []).Select(row => new JObject
                {
                    ["id"] = row.Id, ["name"] = row.Name, ["description"] = row.Description, ["identifier"] = row.Identifier,
                }));
            var json = request.ToString(Newtonsoft.Json.Formatting.None);
            var result = await (quickInsert ? _native.SearchQuickInsertJsonAsync(json, token) : _native.SearchToolboxJsonAsync(json, token)).ConfigureAwait(false);
            token.ThrowIfCancellationRequested();
            var page = JObject.Parse(result);
            if (page["items"] is not JArray items || items.Any(item => item is not JObject)
                || page["totalCount"]?.Type != JTokenType.Integer || page.Value<int>("totalCount") < 0 || page["hasMore"]?.Type != JTokenType.Boolean)
                throw new InvalidDataException("Native Designer search returned an invalid page.");
            token.ThrowIfCancellationRequested();
            return new() { Success = true, Json = result };
        }
        catch (OperationCanceledException) { throw; }
        catch (Exception error)
        {
            token.ThrowIfCancellationRequested();
            return new() { Success = false, ErrorMessage = UnsupportedMessage + " " + error.Message };
        }
    }

    public async Task<QuickerRpcResolveFontAwesomeIconsResult> ResolveFontAwesomeIconsAsync(IList<string> specs, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        try
        {
            var available = IsFontAwesomeGeometryAvailable;
            cancellationToken.ThrowIfCancellationRequested();
            if (!available) return new() { Success = false, ErrorMessage = UnsupportedMessage };
            var result = new QuickerRpcResolveFontAwesomeIconsResult { Success = true };
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var raw in specs)
            {
                cancellationToken.ThrowIfCancellationRequested();
                var spec = (raw ?? "").Trim();
                if (spec.Length == 0 || !seen.Add(spec)) continue;
                if (seen.Count > 80) { result.Errors.Add("Only first 80 unique specs are resolved per call."); break; }
                var vector = await _native.ResolveFaGeometryAsync(spec, cancellationToken).ConfigureAwait(false);
                cancellationToken.ThrowIfCancellationRequested();
                if (vector is null || string.IsNullOrWhiteSpace(vector.Icon) || string.IsNullOrWhiteSpace(vector.Path)
                    || !IsDimension(vector.Width) || !IsDimension(vector.Height))
                { result.Errors.Add(spec + ": Native Font Awesome geometry is missing or invalid."); continue; }
                result.Items.Add(new()
                {
                    Spec = spec, EnumName = vector.Icon, Path = vector.Path, Width = (int)vector.Width, Height = (int)vector.Height, Color = vector.Fill,
                });
            }
            cancellationToken.ThrowIfCancellationRequested();
            return result;
        }
        catch (OperationCanceledException) { throw; }
        catch (Exception error)
        {
            cancellationToken.ThrowIfCancellationRequested();
            return new() { Success = false, ErrorMessage = UnsupportedMessage + " " + error.Message };
        }

        static bool IsDimension(double value) => double.IsFinite(value) && value > 0 && value <= int.MaxValue && Math.Truncate(value) == value;
    }

    public Task<QuickerRpcActionUpdateResult> OpenActionEditorAsync(string actionId, CancellationToken cancellationToken = default) => UnsupportedAsync(new QuickerRpcActionUpdateResult { Message = UnsupportedMessage }, cancellationToken);
    public Task<QuickerRpcActionUpdateResult> OpenSubProgramEditorAsync(string idOrName, CancellationToken cancellationToken = default) => UnsupportedAsync(new QuickerRpcActionUpdateResult { Message = UnsupportedMessage }, cancellationToken);
    public Task<QuickerRpcClipboardSpecialFormatReadResult> ReadClipboardFormatAsync(string format, CancellationToken cancellationToken = default) => UnsupportedAsync(new QuickerRpcClipboardSpecialFormatReadResult { ErrorMessage = UnsupportedMessage }, cancellationToken);
    public Task<QuickerRpcClipboardSpecialFormatWriteResult> WriteClipboardFormatAsync(string format, string text, CancellationToken cancellationToken = default) => UnsupportedAsync(new QuickerRpcClipboardSpecialFormatWriteResult { ErrorMessage = UnsupportedMessage }, cancellationToken);
    public Task<QuickerRpcDesignerContextResult> GetDesignerContextAsync(bool includeXAction = false, CancellationToken cancellationToken = default) => UnsupportedAsync(new QuickerRpcDesignerContextResult { Message = UnsupportedMessage }, cancellationToken);
    public Task<QuickerRpcTextToolRunResult> RunTextToolAsync(string toolId, string? currentValue = null, int timeoutSeconds = 300, CancellationToken cancellationToken = default) => UnsupportedAsync(new QuickerRpcTextToolRunResult { ErrorCode = "UNSUPPORTED_HOST", Message = UnsupportedMessage }, cancellationToken);
    public Task<QuickerRpcSearchFontAwesomeIconsResult> SearchFontAwesomeIconsAsync(string? query, int maxResults = 40, bool expand = false, CancellationToken cancellationToken = default) => UnsupportedAsync(new QuickerRpcSearchFontAwesomeIconsResult { ErrorMessage = UnsupportedMessage }, cancellationToken);

    private static Task<T> UnsupportedAsync<T>(T result, CancellationToken token) { token.ThrowIfCancellationRequested(); return Task.FromResult(result); }
}
