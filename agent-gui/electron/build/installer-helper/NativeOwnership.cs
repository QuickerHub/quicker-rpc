using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32;
using Microsoft.Win32.SafeHandles;

namespace QuickerAgent.Installer
{
    internal static class Win32
    {
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] internal static extern SafeFileHandle CreateFile(string name, uint access, uint share, IntPtr security, uint disposition, uint flags, IntPtr template);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] internal static extern uint GetFinalPathNameByHandle(SafeFileHandle file, StringBuilder path, uint count, uint flags);
        [DllImport("kernel32.dll", SetLastError = true)] internal static extern bool GetFileInformationByHandleEx(SafeFileHandle file, int kind, out uint flags, uint size);
        [StructLayout(LayoutKind.Sequential)] internal struct AttributeTag { public uint Attributes, Tag; }
        [DllImport("kernel32.dll", EntryPoint = "GetFileInformationByHandleEx", SetLastError = true)] internal static extern bool GetAttributeTag(SafeFileHandle file, int kind, out AttributeTag info, uint size);
        [DllImport("kernel32.dll", SetLastError = true)] internal static extern SafeProcessHandle OpenProcess(uint access, bool inherit, int pid);
        [DllImport("kernel32.dll", SetLastError = true)] internal static extern bool GetProcessTimes(SafeProcessHandle process, out long creation, out long exit, out long kernel, out long user);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] internal static extern bool QueryFullProcessImageName(SafeProcessHandle process, uint flags, StringBuilder path, ref uint size);
        [DllImport("kernel32.dll", SetLastError = true)] internal static extern uint WaitForSingleObject(SafeProcessHandle process, uint timeout);
        [DllImport("kernel32.dll", SetLastError = true)] internal static extern SafeFileHandle CreateToolhelp32Snapshot(uint flags, uint pid);
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] internal struct ProcessEntry
        {
            public uint Size, Usage, Pid; public UIntPtr Heap; public uint Module, Threads, Parent; public int Priority; public uint Flags;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string Name;
        }
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] internal static extern bool Process32First(SafeFileHandle snapshot, ref ProcessEntry entry);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] internal static extern bool Process32Next(SafeFileHandle snapshot, ref ProcessEntry entry);
        [DllImport("user32.dll", SetLastError = true)] internal static extern bool EnumWindows(WindowCallback callback, IntPtr argument);
        internal delegate bool WindowCallback(IntPtr window, IntPtr argument);
        [DllImport("user32.dll")] internal static extern uint GetWindowThreadProcessId(IntPtr window, out int pid);
        [DllImport("user32.dll", SetLastError = true)] internal static extern IntPtr SendMessageTimeout(IntPtr window, uint message, IntPtr wParam, IntPtr lParam, uint flags, uint timeout, out UIntPtr result);
    }

    public static class NativeInstallationPaths
    {
        private const uint UnsafeAttributes = 0x400u | 0x1000u | 0x40000u | 0x400000u;
        public static void EnsureLocalPath(string path) { EnsureLocalPath(path, true); }
        public static void EnsureLocalPath(string path, bool directory)
        {
            if (String.IsNullOrWhiteSpace(path) || path.Length < 3 || path[1] != ':' || (path[2] != '\\' && path[2] != '/')) throw new IOException("An absolute local installation path is required.");
            if (PayloadPolicy.IsCloudPath(path, directory)) throw new IOException("Cloud synchronization paths are not an installation/image probe target.");
        }
        private static void CheckHandleMetadata(SafeFileHandle handle)
        {
            Win32.AttributeTag attributes;
            if (!Win32.GetAttributeTag(handle, 9, out attributes, 8) || (attributes.Attributes & UnsafeAttributes) != 0)
                throw new IOException("Reparse/cloud or unverifiable path metadata.");
        }
        private static void CheckParentMetadata(string path)
        {
            string parent = Path.GetDirectoryName(Path.GetFullPath(path));
            if (String.IsNullOrEmpty(parent)) return;
            string current = Path.GetPathRoot(parent);
            foreach (string segment in parent.Substring(current.Length).Split('\\'))
            {
                if (segment.Length == 0) continue;
                current = Path.Combine(current, segment);
                if (((uint)File.GetAttributes(current) & UnsafeAttributes) != 0) throw new IOException("Redirected/cloud image ancestry is not probed.");
            }
        }
        public static string Final(string path, bool directory)
        {
            EnsureLocalPath(path, directory);
            CheckParentMetadata(path);
            if (((uint)File.GetAttributes(path) & UnsafeAttributes) != 0) throw new IOException("Reparse/cloud image paths are unsupported.");
            using (var handle = Win32.CreateFile(path, 0x80, 7, IntPtr.Zero, 3, 0x00200000u | (directory ? 0x02000000u : 0u), IntPtr.Zero))
            {
                if (handle.IsInvalid) throw new IOException("Cannot open an installation path.");
                CheckHandleMetadata(handle);
                var text = new StringBuilder(32768);
                uint length = Win32.GetFinalPathNameByHandle(handle, text, (uint)text.Capacity, 0);
                if (length == 0 || length >= text.Capacity) throw new IOException("Cannot resolve an installation path.");
                string resolved = text.ToString();
                if (!resolved.StartsWith(@"\\?\", StringComparison.Ordinal) || resolved.StartsWith(@"\\?\UNC\", StringComparison.OrdinalIgnoreCase))
                    throw new IOException("A local Windows installation directory is required.");
                resolved = resolved.Substring(4); return resolved.Length > 3 ? resolved.TrimEnd('\\') : resolved;
            }
        }

        public static ResolvedInstallationDirectory DirectoryTarget(string directory)
        {
            EnsureLocalPath(directory);
            string full = Path.GetFullPath(directory).TrimEnd('\\');
            if (full.Length <= 3 || full.StartsWith(@"\\", StringComparison.Ordinal)) throw new IOException("A local non-root installation directory is required.");
            // A fresh target may not exist. Verify its existing parent chain before
            // appending missing components; no directory is created by this probe.
            string existing = Path.GetPathRoot(full); var missing = new List<string>(); bool absent = false;
            foreach (string segment in full.Substring(existing.Length).Split('\\'))
            {
                if (absent) { missing.Add(segment); continue; }
                string next = Path.Combine(existing, segment); uint attributes;
                try { attributes = (uint)File.GetAttributes(next); }
                catch (FileNotFoundException) { absent = true; missing.Add(segment); continue; }
                catch (DirectoryNotFoundException) { absent = true; missing.Add(segment); continue; }
                if ((attributes & UnsafeAttributes) != 0 || (attributes & 0x10u) == 0) throw new IOException("Reparse/cloud or invalid installation ancestry.");
                existing = next;
            }
            string final = Final(existing, true);
            string ancestor = final;
            while (!String.IsNullOrEmpty(ancestor))
            {
                using (var handle = Win32.CreateFile(ancestor, 0x80, 7, IntPtr.Zero, 3, 0x02200000, IntPtr.Zero))
                {
                    uint flags;
                    // FILE_CASE_SENSITIVE_INFO is supported by the Windows baseline
                    // required by the bundled runtime. Unknown is not 'insensitive'.
                    if (handle.IsInvalid || !Win32.GetFileInformationByHandleEx(handle, 23, out flags, 4) || (flags & 1) != 0)
                        throw new IOException("Case-sensitive or unverifiable installation ancestry.");
                    CheckHandleMetadata(handle);
                }
                ancestor = Path.GetDirectoryName(ancestor);
            }
            foreach (string segment in missing) final = Path.Combine(final, segment);
            return new ResolvedInstallationDirectory(final, true);
        }
    }

    public sealed class InstallationRecord
    {
        public bool InstallKeyExists, UninstallKeyExists, ForeignRootExists;
        public string Directory, DisplayName, UninstallCommand;
    }

    public static class InstallationRegistration
    {
        private static void VerifyProgramResources(string target)
        {
            // These are packaged resource roots, not the colocated local/plugins/
            // cache profile directories. Never follow a link while inspecting them.
            foreach (string path in Directory.EnumerateFileSystemEntries(target))
            {
                string name = Path.GetFileName(path);
                if (!PayloadPolicy.IsDirectory(name) && !PayloadPolicy.IsRootFile(name)) continue;
                bool directory = ((uint)File.GetAttributes(path) & 0x10u) != 0;
                if (directory != PayloadPolicy.IsDirectory(name)) throw new IOException("Unexpected program file/directory type.");
                VerifyProgramEntry(path);
            }
        }
        private static void VerifyProgramEntry(string path)
        {
            NativeInstallationPaths.EnsureLocalPath(Path.GetDirectoryName(path));
            uint attributes = (uint)File.GetAttributes(path);
            if ((attributes & (0x400u | 0x1000u | 0x40000u | 0x400000u)) != 0) throw new IOException("Linked or cloud program resources are not an owned overlay target.");
            if ((attributes & 0x10u) != 0) { NativeInstallationPaths.EnsureLocalPath(path); foreach (string child in Directory.EnumerateFileSystemEntries(path)) VerifyProgramEntry(child); }
        }
        public static InstallationRecord Read(string installKey, string uninstallKey)
        {
            if (!installKey.StartsWith("Software\\", StringComparison.OrdinalIgnoreCase) || !uninstallKey.StartsWith("Software\\", StringComparison.OrdinalIgnoreCase))
                throw new IOException("Unsupported registration namespace.");
            var result = new InstallationRecord();
            using (var current = RegistryKey.OpenBaseKey(RegistryHive.CurrentUser, RegistryView.Registry64))
            using (var install = current.OpenSubKey(installKey, false))
            using (var uninstall = current.OpenSubKey(uninstallKey, false))
            {
                result.InstallKeyExists = install != null; result.UninstallKeyExists = uninstall != null;
                result.Directory = install == null ? null : install.GetValue("InstallLocation") as string;
                result.DisplayName = uninstall == null ? null : uninstall.GetValue("DisplayName") as string;
                result.UninstallCommand = uninstall == null ? null : uninstall.GetValue("UninstallString") as string;
            }
            using (var machine = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, RegistryView.Registry64))
            using (var install = machine.OpenSubKey(installKey, false))
            using (var uninstall = machine.OpenSubKey(uninstallKey, false)) result.ForeignRootExists = install != null || uninstall != null;
            using (var current32 = RegistryKey.OpenBaseKey(RegistryHive.CurrentUser, RegistryView.Registry32))
            using (var install = current32.OpenSubKey(installKey, false))
            using (var uninstall = current32.OpenSubKey(uninstallKey, false))
            {
                // Some HKCU keys are shared between WOW64 views. Identical facts
                // describe one registration; conflicting views are never migrated.
                if (install != null || uninstall != null)
                    result.ForeignRootExists |= (install != null) != result.InstallKeyExists || (uninstall != null) != result.UninstallKeyExists
                        || (install == null ? null : install.GetValue("InstallLocation") as string) != result.Directory
                        || (uninstall == null ? null : uninstall.GetValue("DisplayName") as string) != result.DisplayName
                        || (uninstall == null ? null : uninstall.GetValue("UninstallString") as string) != result.UninstallCommand;
            }
            return result;
        }

        // This is passive parsing, never an executable command or shell argument.
        private static string UninstallPath(string command)
        {
            if (String.IsNullOrWhiteSpace(command) || command[0] != '"') throw new IOException("Unverified uninstall record.");
            int quote = command.IndexOf('"', 1);
            if (quote < 2 || command.Substring(quote + 1).Trim() != "/currentuser") throw new IOException("Unverified uninstall record.");
            return command.Substring(1, quote - 1);
        }

        public static ResolvedInstallationDirectory Verify(string directory, InstallationRecord record, string product, string executable)
        {
            if (String.IsNullOrWhiteSpace(product) || Path.GetFileName(executable) != executable) throw new IOException("Invalid product identity.");
            var target = NativeInstallationPaths.DirectoryTarget(directory);
            if (record.ForeignRootExists) throw new IOException("Conflicting installation roots.");
            if (!record.InstallKeyExists && !record.UninstallKeyExists)
            {
                if (System.IO.Directory.Exists(target.FinalPath)) using (var entries = System.IO.Directory.EnumerateFileSystemEntries(target.FinalPath).GetEnumerator())
                    if (entries.MoveNext()) throw new IOException("A nonempty unregistered target is not a fresh installation.");
                return target;
            }
            if (!record.InstallKeyExists || !record.UninstallKeyExists || record.DisplayName != product || String.IsNullOrWhiteSpace(record.Directory))
                throw new IOException("Partial or unknown product registration.");
            var installed = NativeInstallationPaths.DirectoryTarget(record.Directory);
            if (!String.Equals(target.FinalPath, installed.FinalPath, StringComparison.OrdinalIgnoreCase)) throw new IOException("Installation directory changed.");
            string appPath = NativeInstallationPaths.Final(Path.Combine(installed.FinalPath, executable), false);
            if (!String.Equals(appPath, Path.Combine(target.FinalPath, executable), StringComparison.OrdinalIgnoreCase)
                || FileVersionInfo.GetVersionInfo(appPath).ProductName != product) throw new IOException("Unverified installed product image.");
            string uninstallPath = NativeInstallationPaths.Final(UninstallPath(record.UninstallCommand), false);
            if (!String.Equals(uninstallPath, Path.Combine(target.FinalPath, "Uninstall " + executable), StringComparison.OrdinalIgnoreCase))
                throw new IOException("Unverified uninstall location.");
            VerifyProgramResources(target.FinalPath);
            return target;
        }
    }

    internal sealed class NativeProcessLease : IProcessLease
    {
        private readonly SafeProcessHandle handle;
        private readonly ProcessIdentity identity;
        public NativeProcessLease(int pid)
        {
            handle = Win32.OpenProcess(0x1000 | 0x100000, false, pid);
            try { if (handle.IsInvalid) { if (Marshal.GetLastWin32Error() == 87) throw new ProcessAlreadyExited(); throw new IOException("Cannot query process."); } identity = ReadLive(pid); }
            catch { handle.Dispose(); throw; }
        }
        private ProcessIdentity ReadLive(int pid)
        {
            long creation, exit, kernel, user;
            if (!Win32.GetProcessTimes(handle, out creation, out exit, out kernel, out user) || creation <= 0) throw new IOException("Unknown process creation identity.");
            var path = new StringBuilder(32768); uint count = (uint)path.Capacity;
            if (!Win32.QueryFullProcessImageName(handle, 0, path, ref count)) throw new IOException("Unknown process image.");
            return new ProcessIdentity(pid, creation, NativeInstallationPaths.Final(path.ToString(), false));
        }
        public bool HasExited { get { uint result = Win32.WaitForSingleObject(handle, 0); if (result == 0) return true; if (result == 258) return false; throw new IOException("Unknown process state."); } }
        public ProcessIdentity ReadIdentity()
        {
            long creation, exit, kernel, user;
            if (!Win32.GetProcessTimes(handle, out creation, out exit, out kernel, out user) || creation != identity.CreationTime) throw new IOException("Changed process identity.");
            if (HasExited) return identity;
            var current = ReadLive(identity.Pid); if (!identity.Same(current)) throw new IOException("Changed process image."); return identity;
        }
        public bool RequestWindowClose(int remainingMilliseconds)
        {
            bool found = false, failed = false;
            var budget = Stopwatch.StartNew();
            Win32.WindowCallback callback = delegate(IntPtr window, IntPtr parameter) {
                try {
                int owner; Win32.GetWindowThreadProcessId(window, out owner);
                if (owner != identity.Pid) return true;
                if (budget.ElapsedMilliseconds >= remainingMilliseconds) { failed = true; return false; }
                if (HasExited || !identity.Same(ReadIdentity())) return false;
                int again; Win32.GetWindowThreadProcessId(window, out again); if (again != identity.Pid) return true;
                long remaining = remainingMilliseconds - budget.ElapsedMilliseconds;
                if (remaining <= 0) { failed = true; return false; }
                UIntPtr result; found = true;
                if (Win32.SendMessageTimeout(window, 0x10, IntPtr.Zero, IntPtr.Zero, 0x2 | 0x20, (uint)Math.Min(200, remaining), out result) == IntPtr.Zero && !HasExited) failed = true;
                return !failed;
                } catch { failed = true; return false; }
            };
            bool enumerated = Win32.EnumWindows(callback, IntPtr.Zero);
            GC.KeepAlive(callback);
            return !failed && (HasExited || (enumerated && found));
        }
        public void Dispose() { handle.Dispose(); }
    }

    internal sealed class ProcessAlreadyExited : Exception { }
    internal sealed class ExitedLease : IProcessLease
    {
        public ProcessIdentity ReadIdentity() { return null; }
        public bool HasExited { get { return true; } }
        public bool RequestWindowClose(int remainingMilliseconds) { return false; }
        public void Dispose() { }
    }

    public sealed class NativeInstallationProcessPlatform : IInstallationProcessPlatform
    {
        private readonly Func<ResolvedInstallationDirectory> verify;
        private readonly int[] fixturePids;
        private readonly Stopwatch clock = Stopwatch.StartNew();
        public NativeInstallationProcessPlatform(Func<ResolvedInstallationDirectory> verifyTarget, int[] ownedFixturePids)
        { verify = verifyTarget; fixturePids = ownedFixturePids; }
        public ResolvedInstallationDirectory ResolveFinalDirectory(string directory)
        { var target = verify(); if (!String.Equals(target.FinalPath, NativeInstallationPaths.DirectoryTarget(directory).FinalPath, StringComparison.OrdinalIgnoreCase)) throw new IOException("Changed installation target."); return target; }
        public IEnumerable<ProcessCandidate> CaptureProcesses()
        {
            var candidates = new List<ProcessCandidate>();
            if (fixturePids != null) { foreach (int pid in fixturePids) Add(candidates, pid); }
            else using (var snapshot = Win32.CreateToolhelp32Snapshot(2, 0))
            {
                if (snapshot.IsInvalid) throw new IOException("Cannot capture process candidates.");
                var entry = new Win32.ProcessEntry { Size = (uint)Marshal.SizeOf(typeof(Win32.ProcessEntry)) };
                if (!Win32.Process32First(snapshot, ref entry)) { if (Marshal.GetLastWin32Error() == 18) return candidates; throw new IOException("Cannot enumerate processes."); }
                do { candidates.Add(new ProcessCandidate((int)entry.Pid, entry.Name)); } while (Win32.Process32Next(snapshot, ref entry));
                if (Marshal.GetLastWin32Error() != 18) throw new IOException("Process enumeration incomplete.");
            }
            return candidates;
        }
        private static void Add(List<ProcessCandidate> rows, int pid)
        {
            try { using (var process = Process.GetProcessById(pid)) rows.Add(new ProcessCandidate(pid, process.ProcessName + ".exe")); }
            catch (ArgumentException) { /* This candidate has exited before acquisition. */ }
        }
        public IProcessLease OpenStableProcess(int pid) { try { return new NativeProcessLease(pid); } catch (ProcessAlreadyExited) { return new ExitedLease(); } }
        public long MonotonicMilliseconds { get { return clock.ElapsedMilliseconds; } }
        public void Delay(int milliseconds) { System.Threading.Thread.Sleep(milliseconds); }
    }
}
