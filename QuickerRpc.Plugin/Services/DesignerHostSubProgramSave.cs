using System;
using System.Reflection;
using Quicker.Domain;
using Quicker.Domain.Actions.X;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Headless save via <c>Quicker.DesignerHost.DesignerHostUiSave.TrySaveGlobalSubProgram</c>
/// (same path as Web designer / ActionDesignerWindow DoSaveWithoutClose).
/// </summary>
internal static class DesignerHostSubProgramSave
{
    private const BindingFlags StaticFlags = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static;
    private const string HostTypeFullName = "Quicker.DesignerHost.DesignerHostUiSave";

    private static readonly Lazy<MethodInfo?> TrySaveMethod = new(ResolveTrySaveGlobalSubProgram);

    public static bool TrySave(SubProgram live, XAction x, out string? error)
    {
        error = null;
        var method = TrySaveMethod.Value;
        if (method is null)
        {
            return false;
        }

        try
        {
            var result = method.Invoke(null, new object[] { live, x });
            if (result is bool ok && ok)
            {
                return true;
            }

            error = "DesignerHostUiSave.TrySaveGlobalSubProgram returned false.";
            return false;
        }
        catch (TargetInvocationException ex)
        {
            error = ex.InnerException?.Message ?? ex.Message;
            return false;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return false;
        }
    }

    private static MethodInfo? ResolveTrySaveGlobalSubProgram()
    {
        if (!QuickerHost.IsRunningInQuicker())
        {
            return null;
        }

        var hostType = typeof(AppState).Assembly.GetType(HostTypeFullName, throwOnError: false);
        return hostType?.GetMethod("TrySaveGlobalSubProgram", StaticFlags);
    }
}
