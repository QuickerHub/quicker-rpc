using System;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using Quicker.Common.Vm;
using Quicker.Domain;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Resolves obfuscated <c>WebConnector.ShareActionAsync(SharedActionVm)</c> by signature (Release-safe).
/// </summary>
internal sealed class WebConnectorAccessor
{
    private readonly MethodInfo _shareActionAsync;

    private WebConnectorAccessor(MethodInfo shareActionAsync)
    {
        _shareActionAsync = shareActionAsync;
    }

    public async Task<(bool Ok, string? Message, SharedActionDto? Data)> ShareActionAsync(SharedActionVm vm)
    {
        try
        {
            var pending = _shareActionAsync.Invoke(null, new object[] { vm });
            if (pending is not Task task)
            {
                return (false, "ShareActionAsync did not return Task.", null);
            }

            await task.ConfigureAwait(true);
            return ReadApiResult(task);
        }
        catch (TargetInvocationException ex) when (ex.InnerException is not null)
        {
            return (false, ex.InnerException.Message, null);
        }
        catch (Exception ex)
        {
            return (false, ex.Message, null);
        }
    }

    public static WebConnectorAccessor? TryCreate()
    {
        if (!QuickerHost.IsRunningInQuicker())
        {
            return null;
        }

        try
        {
            var vmType = typeof(SharedActionVm);
            var dtoType = typeof(SharedActionDto);
            var apiResultType = typeof(ApiResult<>).MakeGenericType(dtoType);
            var taskType = typeof(Task<>).MakeGenericType(apiResultType);

            var candidates = typeof(AppState).Assembly
                .GetTypes()
                .SelectMany(t => t.GetMethods(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static))
                .Where(m =>
                    m.GetParameters().Length == 1
                    && m.GetParameters()[0].ParameterType == vmType
                    && m.ReturnType == taskType)
                .ToList();

            if (candidates.Count == 0)
            {
                return null;
            }

            var method = candidates.Count == 1
                ? candidates[0]
                : candidates.FirstOrDefault(m => m.DeclaringType?.GetFields(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static)
                    .Any(f => f.FieldType == typeof(System.Net.Http.HttpClient)) == true)
                  ?? candidates[0];

            return new WebConnectorAccessor(method);
        }
        catch
        {
            return null;
        }
    }

    private static (bool Ok, string? Message, SharedActionDto? Data) ReadApiResult(Task completedTask)
    {
        var resultProperty = completedTask.GetType().GetProperty("Result");
        if (resultProperty?.GetValue(completedTask) is not { } apiResult)
        {
            return (false, "ShareActionAsync returned null.", null);
        }

        var resultType = apiResult.GetType();
        var isSuccess = resultType.GetProperty("IsSuccess")?.GetValue(apiResult) is true;
        var message = resultType.GetProperty("Message")?.GetValue(apiResult) as string;
        var data = resultType.GetProperty("Data")?.GetValue(apiResult) as SharedActionDto;
        return (isSuccess, message, data);
    }
}
