using Newtonsoft.Json.Linq;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Persists global subprogram bodies via <see cref="SubProgramDesignerProgramAccess"/>.
/// </summary>
internal static class SubProgramProgramPersistence
{
    public static bool TrySave(
        string subProgramIdOrName,
        JArray steps,
        JArray variables,
        out string? error) =>
        SubProgramDesignerProgramAccess.TrySave(subProgramIdOrName, steps, variables, out error);

    public static bool TrySave(
        string subProgramIdOrName,
        JArray steps,
        JArray variables,
        string? name,
        string? description,
        string? icon,
        out string? error) =>
        SubProgramDesignerProgramAccess.TrySave(
            subProgramIdOrName,
            steps,
            variables,
            name,
            description,
            icon,
            out error);

    public static bool TryUpdatePresentation(
        string subProgramIdOrName,
        string? name,
        string? description,
        string? icon,
        out string? error) =>
        SubProgramDesignerProgramAccess.TryUpdatePresentation(
            subProgramIdOrName,
            name,
            description,
            icon,
            out error);
}
