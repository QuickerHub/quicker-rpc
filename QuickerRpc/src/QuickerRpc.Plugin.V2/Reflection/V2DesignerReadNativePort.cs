using System.Reflection;
using System.Runtime.ExceptionServices;
using System.Windows;
using System.Windows.Threading;
using Newtonsoft.Json;

namespace QuickerRpc.Plugin.V2.Reflection;

internal sealed record V2DesignerNativeFaVector(string Icon, string Path, double Width, double Height, string Fill);

internal interface IV2DesignerReadNativePort
{
    bool IsQuickInsertAvailable { get; }
    bool IsToolboxAvailable { get; }
    bool IsFaGeometryAvailable { get; }
    Task<string> SearchQuickInsertJsonAsync(string requestJson, CancellationToken token);
    Task<string> SearchToolboxJsonAsync(string requestJson, CancellationToken token);
    Task<V2DesignerNativeFaVector?> ResolveFaGeometryAsync(string spec, CancellationToken token);
}

/// <summary>Owns only an in-memory search snapshot and exact readonly native leaves.</summary>
internal sealed class V2DesignerReadNativePort : IV2DesignerReadNativePort
{
    private const string CatalogDataType = "Quicker.Modules.Headless.HostAdapter.QuickerDesignerPluginDataService";
    private const string CatalogDtoType = "Quicker.Designer.Grpc.V1.GetStepRunnersResponse";
    private const string SearchType = "Quicker.Designer.Search.DesignerStepRunnerSearchService";
    private const string FaResolverType = "Quicker.Designer.Plugin.QuickerPluginFontAwesomePathResolver";
    private const string FaDtoType = "Quicker.Designer.Contracts.Rpc.DesignerFaIconVectorRpcDto";
    private readonly Func<CatalogBinding?> _catalog;
    private readonly Func<FaBinding?> _fa;
    private readonly Func<bool> _hasDispatcher;
    private readonly Func<Func<Task<string>>, CancellationToken, Task<string>> _dispatch;
    private readonly object _catalogGate = new();
    private (CatalogBinding Binding, object Search)? _loadedCatalog;

    internal V2DesignerReadNativePort() : this(
        () => QuickerV2Runtime.IsRunningInQuicker ? CatalogBinding.TryCreate(
            QuickerV2Runtime.ResolveType(CatalogDataType), QuickerV2Runtime.ResolveType(CatalogDtoType), QuickerV2Runtime.ResolveType(SearchType)) : null,
        () => QuickerV2Runtime.IsRunningInQuicker ? FaBinding.TryCreate(
            QuickerV2Runtime.ResolveType(FaResolverType), QuickerV2Runtime.ResolveType(FaDtoType)) : null,
        () => Application.Current?.Dispatcher is { HasShutdownStarted: false, HasShutdownFinished: false }, DispatchAsync) { }

    internal V2DesignerReadNativePort(Func<CatalogBinding?> catalog, Func<FaBinding?> fa, Func<bool> hasDispatcher,
        Func<Func<Task<string>>, CancellationToken, Task<string>> dispatch)
    { _catalog = catalog; _fa = fa; _hasDispatcher = hasDispatcher; _dispatch = dispatch; }

    public bool IsQuickInsertAvailable => Probe(() => _catalog()?.QuickInsert is not null);
    public bool IsToolboxAvailable => Probe(() => _catalog()?.Toolbox is not null);
    public bool IsFaGeometryAvailable => Probe(() => _fa() is not null);

    private bool Probe(Func<bool> read)
    {
        try { return _hasDispatcher() && read(); }
        catch { return false; }
    }

    public Task<string> SearchQuickInsertJsonAsync(string requestJson, CancellationToken token) => SearchAsync(requestJson, quickInsert: true, token);
    public Task<string> SearchToolboxJsonAsync(string requestJson, CancellationToken token) => SearchAsync(requestJson, quickInsert: false, token);

    private Task<string> SearchAsync(string requestJson, bool quickInsert, CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        var binding = _catalog();
        var method = quickInsert ? binding?.QuickInsert : binding?.Toolbox;
        token.ThrowIfCancellationRequested();
        if (binding is null || method is null) throw new NotSupportedException("The native Designer catalog read API is unavailable.");
        return RunAsync(async () =>
        {
            object search;
            lock (_catalogGate)
            {
                token.ThrowIfCancellationRequested();
                if (_loadedCatalog is { } loaded && loaded.Binding.Matches(binding)) search = loaded.Search;
                else
                {
                    var catalog = binding.BuildCatalog();
                    token.ThrowIfCancellationRequested();
                    search = binding.CreateSearch();
                    binding.Replace(search, catalog);
                    token.ThrowIfCancellationRequested();
                    _loadedCatalog = (binding, search);
                }
            }
            token.ThrowIfCancellationRequested();
            var result = await binding.SearchAsync(method, search, requestJson, token).ConfigureAwait(true);
            token.ThrowIfCancellationRequested();
            return result;
        }, token);
    }

    public async Task<V2DesignerNativeFaVector?> ResolveFaGeometryAsync(string spec, CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        var binding = _fa();
        token.ThrowIfCancellationRequested();
        if (binding is null) throw new NotSupportedException("The native Font Awesome geometry API is unavailable.");
        var json = await RunAsync(() => Task.FromResult(JsonConvert.SerializeObject(binding.Resolve(spec))), token).ConfigureAwait(false);
        token.ThrowIfCancellationRequested();
        var vector = JsonConvert.DeserializeObject<V2DesignerNativeFaVector>(json);
        token.ThrowIfCancellationRequested();
        return vector;
    }

    private async Task<string> RunAsync(Func<Task<string>> work, CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        var available = _hasDispatcher();
        token.ThrowIfCancellationRequested();
        if (!available) throw new NotSupportedException("The Quicker UI dispatcher is unavailable.");
        var pending = _dispatch(async () =>
        {
            token.ThrowIfCancellationRequested();
            var value = await work().ConfigureAwait(true);
            token.ThrowIfCancellationRequested();
            return value;
        }, token);
        _ = pending.ContinueWith(task => { _ = task.Exception; }, CancellationToken.None,
            TaskContinuationOptions.OnlyOnFaulted | TaskContinuationOptions.ExecuteSynchronously, TaskScheduler.Default);
        var result = await pending.WaitAsync(token).ConfigureAwait(false);
        token.ThrowIfCancellationRequested();
        return result;
    }

    private static Task<string> DispatchAsync(Func<Task<string>> work, CancellationToken token) =>
        DispatchOnAsync(Application.Current?.Dispatcher, work, token);

    internal static Task<string> DispatchOnAsync(Dispatcher? dispatcher, Func<Task<string>> work, CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        if (dispatcher is null || dispatcher.HasShutdownStarted || dispatcher.HasShutdownFinished)
            throw new NotSupportedException("The Quicker UI dispatcher is unavailable.");
        return dispatcher.CheckAccess() ? work() : dispatcher.InvokeAsync(work, DispatcherPriority.Normal, token).Task.Unwrap();
    }

    private static object? Invoke(MethodInfo method, object? target, params object?[] args)
    {
        try { return method.Invoke(target, args); }
        catch (TargetInvocationException error) when (error.InnerException is not null)
        { ExceptionDispatchInfo.Capture(error.InnerException).Throw(); throw; }
    }

    internal sealed class CatalogBinding
    {
        private readonly Type _dto;
        private readonly MethodInfo _build, _replace;
        private readonly ConstructorInfo _constructor;
        private readonly PropertyInfo _items, _count;
        internal MethodInfo? QuickInsert { get; }
        internal MethodInfo? Toolbox { get; }

        private CatalogBinding(Type dto, MethodInfo build, ConstructorInfo constructor, MethodInfo replace, PropertyInfo items, PropertyInfo count,
            MethodInfo? quickInsert, MethodInfo? toolbox)
        { _dto = dto; _build = build; _constructor = constructor; _replace = replace; _items = items; _count = count; QuickInsert = quickInsert; Toolbox = toolbox; }

        internal static CatalogBinding? TryCreate(Type? dataType, Type? dtoType, Type? searchType)
        {
            if (dataType is null || dtoType is null || searchType is null) return null;
            var build = Exact(dataType, "BuildStepRunnersResponse", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static, [], dtoType);
            var constructor = searchType.GetConstructor(Type.EmptyTypes);
            var replace = Exact(searchType, "ReplaceCatalog", BindingFlags.Public | BindingFlags.Instance, [dtoType], typeof(void));
            var items = dtoType.GetProperty("Items", BindingFlags.Public | BindingFlags.Instance);
            var count = items?.PropertyType.GetProperty("Count", BindingFlags.Public | BindingFlags.Instance);
            if (build is null || constructor is null || replace is null || items?.GetMethod is null || count?.GetMethod is null || count.PropertyType != typeof(int)) return null;
            var quick = Exact(searchType, "PostStepQuickInsertSearchJsonAsync", BindingFlags.Public | BindingFlags.Instance, [typeof(string), typeof(CancellationToken)], typeof(Task<string>));
            var toolbox = Exact(searchType, "PostToolboxSearchJsonAsync", BindingFlags.Public | BindingFlags.Instance, [typeof(string), typeof(CancellationToken)], typeof(Task<string>));
            return new(dtoType, build, constructor, replace, items, count, quick, toolbox);
        }

        internal bool Matches(CatalogBinding other) => _build.Equals(other._build) && _constructor.Equals(other._constructor);
        internal object BuildCatalog()
        {
            var dto = Invoke(_build, null);
            if (dto is null || !_dto.IsInstanceOfType(dto) || _items.GetValue(dto) is not { } items || _count.GetValue(items) is not int count || count <= 0)
                throw new InvalidDataException("Native step-runner catalog is empty or has an invalid DTO.");
            return dto;
        }
        internal object CreateSearch() => _constructor.Invoke(null);
        internal void Replace(object search, object catalog) => Invoke(_replace, search, catalog);
        internal Task<string> SearchAsync(MethodInfo method, object search, string json, CancellationToken token) =>
            Invoke(method, search, json, token) as Task<string> ?? throw new InvalidDataException("Native search did not return Task<string>.");
    }

    internal sealed class FaBinding
    {
        private readonly Type _dto;
        private readonly MethodInfo _resolve;
        private readonly PropertyInfo _icon, _path, _width, _height, _fill;
        private FaBinding(Type dto, MethodInfo resolve, PropertyInfo icon, PropertyInfo path, PropertyInfo width, PropertyInfo height, PropertyInfo fill)
        { _dto = dto; _resolve = resolve; _icon = icon; _path = path; _width = width; _height = height; _fill = fill; }

        internal static FaBinding? TryCreate(Type? resolver, Type? dto)
        {
            if (resolver is null || dto is null) return null;
            var method = Exact(resolver, "TryResolveVector", BindingFlags.Public | BindingFlags.Static, [typeof(string)], dto);
            var properties = new[] { "Icon", "Path", "Width", "Height", "Fill" }.Select(key => dto.GetProperty(key, BindingFlags.Public | BindingFlags.Instance)).ToArray();
            var types = new[] { typeof(string), typeof(string), typeof(double), typeof(double), typeof(string) };
            if (method is null || properties.Where((property, index) => property?.GetMethod is null || property.PropertyType != types[index]).Any()) return null;
            return new(dto, method, properties[0]!, properties[1]!, properties[2]!, properties[3]!, properties[4]!);
        }
        internal V2DesignerNativeFaVector? Resolve(string spec)
        {
            var value = Invoke(_resolve, null, spec);
            if (value is null) return null;
            if (!_dto.IsInstanceOfType(value)) throw new InvalidDataException("Native Font Awesome geometry returned an invalid DTO.");
            return new((string?)_icon.GetValue(value) ?? "", (string?)_path.GetValue(value) ?? "", (double)_width.GetValue(value)!,
                (double)_height.GetValue(value)!, (string?)_fill.GetValue(value) ?? "");
        }
    }

    private static MethodInfo? Exact(Type type, string name, BindingFlags flags, Type[] parameters, Type returnType)
    {
        var methods = type.GetMethods(flags).Where(method => method.Name == name && !method.ContainsGenericParameters && method.ReturnType == returnType
            && method.GetParameters().Select(parameter => parameter.ParameterType).SequenceEqual(parameters)).ToArray();
        return methods.Length == 1 ? methods[0] : null;
    }
}
