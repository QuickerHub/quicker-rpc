using System;
using System.Diagnostics;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class QuickerAgentProductionProcessTests
{
    [TestMethod]
    public void IsLiveProcess_accepts_current_process()
    {
        using var process = Process.GetCurrentProcess();
        Assert.IsTrue(QuickerAgentProductionProcess.IsLiveProcess(process));
    }

    [TestMethod]
    public void IsLiveProcess_rejects_exited_process()
    {
        using var process = Process.Start(
            new ProcessStartInfo
            {
                FileName = "cmd.exe",
                Arguments = "/c exit 0",
                CreateNoWindow = true,
                UseShellExecute = false,
            });
        Assert.IsNotNull(process);
        using (process)
        {
            Assert.IsTrue(process.WaitForExit(5000));
            Assert.IsFalse(QuickerAgentProductionProcess.IsLiveProcess(process));
        }
    }

    [TestMethod]
    public void IsInstalledProductionExecutablePath_accepts_localappdata_install()
    {
        var local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        var path = System.IO.Path.Combine(local, "QuickerAgent", "quicker-agent.exe");
        Assert.IsTrue(QuickerAgentProductionProcess.IsInstalledProductionExecutablePath(path));
    }

    [TestMethod]
    public void IsInstalledProductionExecutablePath_rejects_agent_gui_dev_target()
    {
        var path = @"D:\source\repos\quicker\quicker-rpc\agent-gui\src-tauri\target\debug\quicker-agent.exe";
        Assert.IsFalse(QuickerAgentProductionProcess.IsInstalledProductionExecutablePath(path));
    }

    [TestMethod]
    public void IsInstalledProductionExecutablePath_rejects_agent_gui_repo_path()
    {
        var path = @"D:\source\repos\quicker\quicker-rpc\agent-gui\quicker-agent.exe";
        Assert.IsFalse(QuickerAgentProductionProcess.IsInstalledProductionExecutablePath(path));
    }
}
