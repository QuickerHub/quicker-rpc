using System;
using Quicker.Domain;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Plugin.Services;

/// <summary>Opens the Quicker action editor via <see cref="AppState.AppServer"/>.</summary>
public sealed class ActionEditService
{
    public QuickerRpcActionUpdateResult EditAction(string actionId)
    {
        var id = (actionId ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(id))
        {
            return new QuickerRpcActionUpdateResult
            {
                Ok = false,
                Message = "actionId is required.",
            };
        }

        if (!QuickerHost.IsRunningInQuicker())
        {
            return new QuickerRpcActionUpdateResult
            {
                Ok = false,
                ActionId = id,
                Message = "Not running inside Quicker (EditActionById unavailable).",
            };
        }

        try
        {
            QuickerDispatcherInvoke.BeginOnUiThreadIfNeeded(() =>
            {
                try
                {
                    AppState.AppServer.EditActionById(id);
                }
                catch (Exception ex)
                {
                    System.Diagnostics.Trace.TraceWarning(
                        "[QuickerRpc.Plugin] EditAction UI failed: {0}",
                        ex.Message);
                }
            });

            return new QuickerRpcActionUpdateResult
            {
                Ok = true,
                ActionId = id,
                Message = "动作编辑窗口正在打开。",
            };
        }
        catch (Exception ex)
        {
            return new QuickerRpcActionUpdateResult
            {
                Ok = false,
                ActionId = id,
                Message = ex.Message,
            };
        }
    }
}
