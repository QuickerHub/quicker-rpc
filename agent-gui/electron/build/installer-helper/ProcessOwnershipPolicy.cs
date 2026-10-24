using System;
using System.Collections.Generic;

namespace QuickerAgent.Installer
{
    // Pure policy only. Native adapters must resolve directory/image final paths and
    // hold one process handle for the lifetime of each lease; a PID is not a lease.
    public sealed class ProcessIdentity
    {
        public readonly int Pid;
        public readonly long CreationTime;
        public readonly string FinalImagePath;
        public ProcessIdentity(int pid, long creationTime, string finalImagePath)
        { Pid = pid; CreationTime = creationTime; FinalImagePath = finalImagePath; }
        public bool Same(ProcessIdentity other)
        { return other != null && Pid == other.Pid && CreationTime == other.CreationTime && String.Equals(FinalImagePath, other.FinalImagePath, StringComparison.OrdinalIgnoreCase); }
        public string Key { get { return Pid + ":" + CreationTime + ":" + FinalImagePath.ToUpperInvariant(); } }
    }

    public sealed class ProcessCandidate
    {
        public readonly int Pid;
        public readonly string ImageName;
        public ProcessCandidate(int pid, string imageName) { Pid = pid; ImageName = imageName; }
    }

    public interface IProcessLease : IDisposable
    {
        // After exit this must still report the same object's creation identity.
        ProcessIdentity ReadIdentity();
        bool HasExited { get; }
        // The adapter must recheck its held handle and window owner before WM_CLOSE.
        // No TerminateProcess, PID-only signal or process-tree fallback is permitted.
        bool RequestWindowClose();
    }

    public interface IInstallationProcessPlatform
    {
        string ResolveFinalDirectory(string directory);
        IEnumerable<ProcessCandidate> CaptureProcesses();
        IProcessLease OpenStableProcess(int pid);
        long MonotonicMilliseconds { get; }
        void Delay(int milliseconds);
    }

    public sealed class ProcessStopResult
    {
        public readonly bool Success;
        public readonly string Code;
        public readonly int RootCloseRequests;
        public ProcessStopResult(bool success, string code, int requests)
        { Success = success; Code = code; RootCloseRequests = requests; }
    }

    public static class ProcessOwnershipPolicy
    {
        private sealed class Owned
        {
            public readonly IProcessLease Lease;
            public readonly ProcessIdentity Identity;
            public readonly bool Root;
            public bool Requested;
            public Owned(IProcessLease lease, ProcessIdentity identity, bool root)
            { Lease = lease; Identity = identity; Root = root; }
        }
        private static bool Potential(string name)
        {
            foreach (string value in new[] { "quicker-agent.exe", "QuickerAgent.exe", "node.exe", "qkrpc.exe", "rg.exe" })
                if (String.Equals(name, value, StringComparison.OrdinalIgnoreCase)) return true;
            return false;
        }
        private static bool Root(string path, string directory)
        { return String.Equals(path, directory + "\\quicker-agent.exe", StringComparison.OrdinalIgnoreCase)
            || String.Equals(path, directory + "\\QuickerAgent.exe", StringComparison.OrdinalIgnoreCase); }

        // This only requests graceful close of verified root images. Other processes
        // inside the installation are observed blockers, never authorized descendants.
        // Success does not attest that every external browser/terminal child has exited.
        public static ProcessStopResult CloseRoots(IInstallationProcessPlatform platform, string directory, int timeoutMs)
        {
            var held = new Dictionary<string, Owned>(StringComparer.OrdinalIgnoreCase);
            int requests = 0;
            try
            {
                string target = platform.ResolveFinalDirectory(directory);
                if (String.IsNullOrWhiteSpace(target) || timeoutMs <= 0)
                    return new ProcessStopResult(false, "INSTALL_TARGET_UNVERIFIED", requests);
                target = target.TrimEnd('\\');
                long deadline = checked(platform.MonotonicMilliseconds + timeoutMs);
                int quiet = 0;
                while (true)
                {
                    foreach (ProcessCandidate candidate in platform.CaptureProcesses())
                    {
                        IProcessLease lease = platform.OpenStableProcess(candidate.Pid);
                        if (lease == null)
                        {
                            if (Potential(candidate.ImageName)) return new ProcessStopResult(false, "PROCESS_IDENTITY_UNAVAILABLE", requests);
                            continue;
                        }
                        ProcessIdentity identity;
                        try { identity = lease.ReadIdentity(); }
                        catch { lease.Dispose(); throw; }
                        if (identity == null || String.IsNullOrWhiteSpace(identity.FinalImagePath) || identity.Pid != candidate.Pid)
                        {
                            lease.Dispose();
                            if (Potential(candidate.ImageName)) return new ProcessStopResult(false, "PROCESS_IDENTITY_UNAVAILABLE", requests);
                            continue;
                        }
                        if (!identity.FinalImagePath.StartsWith(target + "\\", StringComparison.OrdinalIgnoreCase)) { lease.Dispose(); continue; }
                        if (held.ContainsKey(identity.Key)) { lease.Dispose(); continue; }
                        held.Add(identity.Key, new Owned(lease, identity, Root(identity.FinalImagePath, target)));
                    }
                    bool running = false;
                    foreach (Owned entry in held.Values)
                    {
                        if (!entry.Identity.Same(entry.Lease.ReadIdentity())) return new ProcessStopResult(false, "PROCESS_IDENTITY_CHANGED", requests);
                        if (entry.Lease.HasExited) continue;
                        running = true;
                        if (entry.Root && !entry.Requested)
                        {
                            entry.Requested = true;
                            if (!entry.Lease.RequestWindowClose()) return new ProcessStopResult(false, "ROOT_CLOSE_UNAVAILABLE", requests);
                            requests++;
                        }
                    }
                    // A second capture catches processes that appeared during a root's
                    // close request. No descendant ownership is inferred from parent PID.
                    quiet = running ? 0 : quiet + 1;
                    if (quiet >= 2) return new ProcessStopResult(true, "VERIFIED_ROOTS_CLOSED", requests);
                    if (platform.MonotonicMilliseconds >= deadline) return new ProcessStopResult(false, "PROCESS_STILL_RUNNING", requests);
                    platform.Delay(Math.Min(50, (int)Math.Max(1, deadline - platform.MonotonicMilliseconds)));
                }
            }
            catch { return new ProcessStopResult(false, "OWNERSHIP_CHECK_FAILED", requests); }
            finally { foreach (Owned entry in held.Values) entry.Lease.Dispose(); }
        }
    }

    public enum InstallPlan { Fresh, VerifiedSameDirectoryOverlay, UnverifiedInstallation, TargetChanged, OverlayUnavailable }
    public static class InstallationPolicy
    {
        // No plan invokes a previous executable. The future pinned NSIS adapter must
        // implement overlay explicitly before the production installer consumes this.
        public static InstallPlan Plan(string finalDirectory, string registeredFinalDirectory, bool productIdentityVerified, bool overlayAvailable)
        {
            if (!productIdentityVerified) return InstallPlan.UnverifiedInstallation;
            if (registeredFinalDirectory == null) return InstallPlan.Fresh;
            if (!String.Equals(finalDirectory, registeredFinalDirectory, StringComparison.OrdinalIgnoreCase)) return InstallPlan.TargetChanged;
            return overlayAvailable ? InstallPlan.VerifiedSameDirectoryOverlay : InstallPlan.OverlayUnavailable;
        }
    }
}
