using System;
using System.Reflection;
using System.Threading.Tasks;
using Quicker.Common.Vm;
using Quicker.Domain;
using QuickerRpc.Plugin.Reflection;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Resolves obfuscated <c>WebConnector.ShareActionAsync(SharedActionVm)</c> by signature (Release-safe).
/// </summary>
internal sealed class WebConnectorAccessor
{
    private static readonly Lazy<WebConnectorAccessor?> LazyInstance =
        new(CreateOnce, System.Threading.LazyThreadSafetyMode.ExecutionAndPublication);

    private readonly MethodInfo _shareActionAsync;
    private readonly MethodInfo? _shareSubProgramAsync;

    private WebConnectorAccessor(MethodInfo shareActionAsync, MethodInfo? shareSubProgramAsync)
    {
        _shareActionAsync = shareActionAsync;
        _shareSubProgramAsync = shareSubProgramAsync;
    }

    public async Task<(bool Ok, string? Message, SharedActionDto? Data)> ShareActionAsync(SharedActionVm vm)
    {
        try
        {
            var pending = _shareActionAsync.Invoke(null, new[] { SharedActionHostReflection.ConvertToHostVm(vm) });
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

    public async Task<(bool Ok, string? Message, SharedActionDto? Data)> ShareSubProgramAsync(
        SharedActionVm vm,
        bool overwrite)
    {
        if (_shareSubProgramAsync is null)
        {
            return (false, "ShareSubProgramAsync unavailable on WebConnector.", null);
        }

        try
        {
            var pending = _shareSubProgramAsync.Invoke(
                null,
                new[] { SharedActionHostReflection.ConvertToHostVm(vm), overwrite });
            if (pending is not Task task)
            {
                return (false, "ShareSubProgramAsync did not return Task.", null);
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

    public static WebConnectorAccessor? TryCreate() => LazyInstance.Value;

    private static WebConnectorAccessor? CreateOnce()
    {
        if (!QuickerHost.IsRunningInQuicker())
        {
            return null;
        }

        try
        {
            if (!SharedActionHostReflection.TryGetResolvedWebConnectorMethods(
                    out var shareAction,
                    out var shareSubProgram)
                || shareAction is null)
            {
                return null;
            }

            return new WebConnectorAccessor(shareAction, shareSubProgram);
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
        var data = SharedActionHostReflection.ReadSharedActionDto(resultType.GetProperty("Data")?.GetValue(apiResult));
        return (isSuccess, message, data);
    }
}
