using System;
using Microsoft.Extensions.Logging;
using QuickerRpc.Plugin.Quicker;

namespace QuickerRpc.Plugin.Services;

internal static class QuickerAgentLaunchNotifier
{
    public static void Notify(QuickerAgentLaunchOutcome outcome, ILogger logger)
    {
        switch (outcome)
        {
            case QuickerAgentLaunchOutcome.Activated:
            case QuickerAgentLaunchOutcome.Launched:
            case QuickerAgentLaunchOutcome.DevFrontendOpened:
                return;

            case QuickerAgentLaunchOutcome.NotInstalled:
                logger.LogInformation("QuickerAgent is not installed; showing download prompt.");
                try
                {
                    Launcher.GetService<QuickerAgentUpdateCheckService>().ScheduleCheckAndNotify();
                }
                catch (Exception ex)
                {
                    logger.LogDebug(ex, "QuickerAgent update check unavailable; showing fallback prompt.");
                    PopupMessage.InformationWithClick(
                        "未检测到 QuickerAgent 桌面版。\r\n点击本通知打开下载页。",
                        () => QuickerAppHelperAccess.TryOpenUrlOrFile(
                            QuickerAgentUpdateCheckService.DownloadPrefix));
                }

                return;

            case QuickerAgentLaunchOutcome.RunningButHidden:
                PopupMessage.Warning(
                    "QuickerAgent 进程在运行，但无法显示主窗口。\r\n请检查任务栏或从开始菜单重新打开 QuickerAgent。");
                return;

            case QuickerAgentLaunchOutcome.Failed:
                PopupMessage.Warning("无法启动 QuickerAgent，请从开始菜单或安装目录手动打开。");
                return;
        }
    }
}
