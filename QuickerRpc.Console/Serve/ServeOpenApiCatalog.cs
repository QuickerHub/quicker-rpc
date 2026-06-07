namespace QuickerRpc.Console.Serve;

/// <summary>Known <c>/v1/invoke</c> op names (subset documented for OpenAPI; full set in ServeInvokeDispatcher).</summary>
internal static class ServeOpenApiCatalog
{
    internal static readonly string[] InvokeOps =
    [
        "ping",
        "wait",
        "guide.get",
        "guide.search",
        "action.list",
        "action.search",
        "action.get",
        "action.create",
        "action.patch",
        "action.replace",
        "action.set-metadata",
        "action.update",
        "action.publish",
        "action.move",
        "action.delete",
        "action.run",
        "action.float",
        "action.edit",
        "action.edit-var",
        "action.extract",
        "action.validate",
        "action.apply",
        "subprogram.search",
        "subprogram.list",
        "subprogram.get",
        "subprogram.create",
        "subprogram.patch",
        "subprogram.replace",
        "subprogram.delete",
        "subprogram.export",
        "subprogram.import",
        "step-runner.search",
        "step-runner.get",
        "fa.search",
        "fa.resolve",
        "settings.search",
        "settings.get",
        "settings.set",
        "launcher.resolve",
        "project.diagnostics.get",
    ];
}
