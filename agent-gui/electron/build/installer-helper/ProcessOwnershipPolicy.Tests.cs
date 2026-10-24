using System;
using System.Collections.Generic;
using QuickerAgent.Installer;

internal static class Tests
{
    private sealed class Process
    {
        public int Pid;
        public long Created = 1;
        public string Path;
        public bool Exited, Unknown, Changed;
        public int Requests, Opens, Disposals, Reads;
        public Action Close;
        public Process(int pid, string path) { Pid = pid; Path = path; }
    }
    private sealed class Lease : IProcessLease
    {
        private readonly Process process;
        public Lease(Process process) { this.process = process; process.Opens++; }
        public ProcessIdentity ReadIdentity()
        {
            process.Reads++;
            return new ProcessIdentity(process.Pid, process.Created + (process.Changed && process.Reads > 1 ? 1 : 0), process.Path);
        }
        public bool HasExited { get { return process.Exited; } }
        public bool RequestWindowClose() { process.Requests++; if (process.Close != null) process.Close(); return true; }
        public void Dispose() { process.Disposals++; }
    }
    private sealed class Platform : IInstallationProcessPlatform
    {
        public readonly List<Process> Processes = new List<Process>();
        public Action<int> OnCapture;
        public int Captures;
        public bool InvalidDirectory;
        public string ResolveFinalDirectory(string path) { return InvalidDirectory ? null : path; }
        public IEnumerable<ProcessCandidate> CaptureProcesses()
        {
            Captures++; if (OnCapture != null) OnCapture(Captures);
            var rows = new List<ProcessCandidate>();
            foreach (Process process in Processes) if (!process.Exited) rows.Add(new ProcessCandidate(process.Pid, System.IO.Path.GetFileName(process.Path)));
            return rows;
        }
        public IProcessLease OpenStableProcess(int pid)
        {
            foreach (Process process in Processes) if (process.Pid == pid && !process.Exited) return process.Unknown ? null : new Lease(process);
            return null;
        }
        public long MonotonicMilliseconds { get; private set; }
        public void Delay(int milliseconds) { MonotonicMilliseconds += milliseconds; }
    }
    private static int passed;
    private static void Check(bool expected, string message) { if (!expected) throw new Exception(message); }
    private static void Run(string name, Action body) { body(); passed++; Console.WriteLine("PASS " + name); }
    private static ProcessStopResult Stop(Platform platform) { return ProcessOwnershipPolicy.CloseRoots(platform, @"C:\App", 200); }
    public static int Main()
    {
        try
        {
            Run("foreign same names and path prefixes receive no close request", delegate {
                var platform = new Platform(); var foreign = new Process(1, @"C:\App-other\quicker-agent.exe"); platform.Processes.Add(foreign);
                Check(Stop(platform).Success && foreign.Requests == 0 && foreign.Disposals == foreign.Opens, "foreign ownership or handle leak");
            });
            Run("verified roots close gracefully while observed backends are never signalled", delegate {
                var platform = new Platform(); var root = new Process(1, @"c:\app\quicker-agent.exe"); var backend = new Process(2, @"C:\App\resources\node\node.exe");
                root.Close = delegate { root.Exited = true; backend.Exited = true; }; platform.Processes.Add(root); platform.Processes.Add(backend);
                var result = Stop(platform); Check(result.Success && result.RootCloseRequests == 1 && root.Requests == 1 && backend.Requests == 0, "close boundary");
                Check(root.Disposals == root.Opens && backend.Disposals == backend.Opens, "handle leak");
            });
            Run("root exit does not imply backend exit", delegate {
                var platform = new Platform(); var root = new Process(1, @"C:\App\quicker-agent.exe"); var backend = new Process(2, @"C:\App\resources\node\node.exe");
                root.Close = delegate { root.Exited = true; }; platform.Processes.Add(root); platform.Processes.Add(backend);
                var result = Stop(platform); Check(!result.Success && result.Code == "PROCESS_STILL_RUNNING" && backend.Requests == 0, "orphan was ignored or killed");
                Check(platform.MonotonicMilliseconds == 200, "unbounded wait");
            });
            Run("unqueryable relevant candidate fails before root signalling", delegate {
                var platform = new Platform(); var root = new Process(1, @"C:\App\quicker-agent.exe"); platform.Processes.Add(root); platform.Processes.Add(new Process(2, @"C:\unknown\node.exe") { Unknown = true });
                var result = Stop(platform); Check(!result.Success && result.Code == "PROCESS_IDENTITY_UNAVAILABLE" && root.Requests == 0, "unknown identity authorized close");
            });
            Run("creation identity changes invalidate a process lease", delegate {
                var platform = new Platform(); var root = new Process(1, @"C:\App\quicker-agent.exe") { Changed = true }; platform.Processes.Add(root);
                var result = Stop(platform); Check(!result.Success && result.Code == "PROCESS_IDENTITY_CHANGED" && root.Requests == 0, "changed identity used");
            });
            Run("PID reuse never transfers an old root lease to another image", delegate {
                var platform = new Platform(); var root = new Process(1, @"C:\App\quicker-agent.exe"); var reused = new Process(1, @"C:\Other\quicker-agent.exe") { Created = 2 };
                root.Close = delegate { root.Exited = true; platform.Processes.Add(reused); }; platform.Processes.Add(root);
                Check(Stop(platform).Success && root.Requests == 1 && reused.Requests == 0, "PID-only signalling");
            });
            Run("late scoped processes block continuation without tree-kill authority", delegate {
                var platform = new Platform(); var root = new Process(1, @"C:\App\QuickerAgent.exe"); var late = new Process(3, @"C:\App\resources\qkrpc\qkrpc.exe");
                root.Close = delegate { root.Exited = true; }; platform.Processes.Add(root); platform.OnCapture = delegate(int pass) { if (pass == 2) platform.Processes.Add(late); };
                var result = Stop(platform); Check(!result.Success && result.Code == "PROCESS_STILL_RUNNING" && late.Requests == 0, "late child assumed stopped");
            });
            Run("unresolved final directory refuses enumeration or signalling", delegate {
                var platform = new Platform { InvalidDirectory = true }; Check(!Stop(platform).Success && platform.Captures == 0, "default path fallback");
            });
            Run("fresh and same-directory overlay plans never execute legacy uninstallers", delegate {
                Check(InstallationPolicy.Plan(@"C:\App", null, true, false) == InstallPlan.Fresh, "fresh plan");
                Check(InstallationPolicy.Plan(@"C:\App", @"c:\app", true, true) == InstallPlan.VerifiedSameDirectoryOverlay, "overlay plan");
                Check(InstallationPolicy.Plan(@"C:\App", @"C:\Other", true, true) == InstallPlan.TargetChanged, "target changed");
                Check(InstallationPolicy.Plan(@"C:\App", @"C:\App", false, true) == InstallPlan.UnverifiedInstallation, "unknown product accepted");
                Check(InstallationPolicy.Plan(@"C:\App", @"C:\App", true, false) == InstallPlan.OverlayUnavailable, "missing overlay pretended safe");
            });
            Console.WriteLine("Policy fixtures passed: " + passed); return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error); return 1; }
    }
}
