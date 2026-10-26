using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

namespace QuickerAgent.Smoke
{
    // The suspended root joins the job before it can spawn children. Closing the job
    // also terminates descendants after an early root exit, without PID enumeration.
    public sealed class OwnedJob : IDisposable
    {
        private IntPtr job;
        private IntPtr process;
        public int RootProcessId { get; private set; }
        public bool HasExited { get { return process == IntPtr.Zero || WaitForSingleObject(process, 0) == 0; } }

        public static OwnedJob Start(string executable, string arguments, string cwd, IDictionary<string, string> environment)
        {
            var owner = new OwnedJob();
            IntPtr block = IntPtr.Zero;
            IntPtr limits = IntPtr.Zero;
            PROCESS_INFORMATION child = new PROCESS_INFORMATION();
            try
            {
                owner.job = CreateJobObjectW(IntPtr.Zero, null);
                if (owner.job == IntPtr.Zero) throw new Win32Exception();
                var settings = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
                settings.BasicLimitInformation.LimitFlags = 0x2000; // KILL_ON_JOB_CLOSE
                int size = Marshal.SizeOf(settings);
                limits = Marshal.AllocHGlobal(size);
                Marshal.StructureToPtr(settings, limits, false);
                if (!SetInformationJobObject(owner.job, 9, limits, (uint)size)) throw new Win32Exception();
                var entries = new List<string>();
                foreach (var pair in environment) entries.Add(pair.Key + "=" + pair.Value);
                entries.Sort(StringComparer.OrdinalIgnoreCase);
                block = Marshal.StringToHGlobalUni(String.Join("\0", entries) + "\0");
                var startup = new STARTUPINFO();
                startup.cb = Marshal.SizeOf(startup);
                startup.dwFlags = 1;
                startup.wShowWindow = 0;
                var command = new StringBuilder("\"" + executable + "\" " + arguments);
                if (!CreateProcessW(executable, command, IntPtr.Zero, IntPtr.Zero, false,
                    0x00000004 | 0x00000400 | 0x08000000, block, cwd, ref startup, out child)) throw new Win32Exception();
                owner.process = child.hProcess;
                owner.RootProcessId = unchecked((int)child.dwProcessId);
                if (!AssignProcessToJobObject(owner.job, child.hProcess)) throw new Win32Exception();
                if (ResumeThread(child.hThread) == UInt32.MaxValue) throw new Win32Exception();
                return owner;
            }
            catch
            {
                if (child.hProcess != IntPtr.Zero) TerminateProcess(child.hProcess, 1);
                owner.Dispose();
                throw;
            }
            finally
            {
                if (child.hThread != IntPtr.Zero) CloseHandle(child.hThread);
                if (block != IntPtr.Zero) Marshal.FreeHGlobal(block);
                if (limits != IntPtr.Zero) Marshal.FreeHGlobal(limits);
            }
        }

        public bool ContainsProcess(int pid)
        {
            if (job == IntPtr.Zero || pid <= 0) return false;
            IntPtr handle = OpenProcess(0x1000, false, pid);
            if (handle == IntPtr.Zero) return false;
            try { bool belongs; return IsProcessInJob(handle, job, out belongs) && belongs; }
            finally { CloseHandle(handle); }
        }

        public int ActiveProcessCount { get { return GetProcessSnapshot().ActiveProcessCount; } }

        public int[] GetProcessIds()
        {
            return GetProcessSnapshot().ProcessIds;
        }

        public OwnedJobProcessSnapshot GetProcessSnapshot()
        {
            IntPtr currentJob = job;
            if (currentJob == IntPtr.Zero) throw new ObjectDisposedException("OwnedJob");
            const int maximumProcesses = 65536;
            int capacity = 16;
            for (int attempt = 0; attempt < 16; attempt++)
            {
                int size = checked(8 + capacity * IntPtr.Size);
                IntPtr buffer = Marshal.AllocHGlobal(size);
                try
                {
                    uint returned;
                    bool success = QueryInformationJobObject(currentJob, 3, buffer, (uint)size, out returned);
                    int error = success ? 0 : Marshal.GetLastWin32Error();
                    if (!success && error != 234) throw new Win32Exception(error);
                    uint assigned = unchecked((uint)Marshal.ReadInt32(buffer, 0));
                    uint listed = unchecked((uint)Marshal.ReadInt32(buffer, 4));
                    if (assigned > maximumProcesses || listed > capacity || listed > assigned)
                        throw new InvalidOperationException("Invalid or excessive owned job process count.");
                    if (success && assigned == listed)
                    {
                        var ids = new int[listed];
                        var seen = new HashSet<int>();
                        for (int index = 0; index < ids.Length; index++)
                        {
                            long value = Marshal.ReadIntPtr(buffer, 8 + index * IntPtr.Size).ToInt64();
                            if (value <= 0 || value > Int32.MaxValue || !seen.Add((int)value))
                                throw new InvalidOperationException("Invalid or duplicate owned job process ID.");
                            ids[index] = (int)value;
                        }
                        return new OwnedJobProcessSnapshot(ids);
                    }
                    if (capacity == maximumProcesses)
                        throw new InvalidOperationException("Owned job process list exceeded its bounded buffer.");
                    capacity = (int)Math.Min(maximumProcesses, Math.Max((long)capacity * 2, assigned));
                }
                finally { Marshal.FreeHGlobal(buffer); }
            }
            throw new InvalidOperationException("Owned job process list did not stabilize within bounded retries.");
        }

        public OwnedProcessSnapshot RetainProcess(int pid)
        {
            IntPtr currentJob = job;
            if (currentJob == IntPtr.Zero) throw new ObjectDisposedException("OwnedJob");
            if (Array.IndexOf(GetProcessIds(), pid) < 0)
                throw new InvalidOperationException("Process is not currently assigned to this owned job.");
            IntPtr handle = OpenProcess(0x00100000 | 0x1000, false, pid); // SYNCHRONIZE | QUERY_LIMITED_INFORMATION
            if (handle == IntPtr.Zero) throw new Win32Exception();
            try
            {
                bool belongs;
                if (!IsProcessInJob(handle, currentJob, out belongs)) throw new Win32Exception();
                if (!belongs) throw new InvalidOperationException("Retained process does not belong to this owned job.");
                var retained = new OwnedProcessSnapshot(pid, handle);
                handle = IntPtr.Zero;
                return retained;
            }
            finally { if (handle != IntPtr.Zero) CloseHandle(handle); }
        }

        public void Dispose()
        {
            if (job != IntPtr.Zero) { CloseHandle(job); job = IntPtr.Zero; }
            if (process != IntPtr.Zero) { CloseHandle(process); process = IntPtr.Zero; }
        }

        [StructLayout(LayoutKind.Sequential)] private struct IO_COUNTERS
        { public ulong ReadOperationCount, WriteOperationCount, OtherOperationCount, ReadTransferCount, WriteTransferCount, OtherTransferCount; }
        [StructLayout(LayoutKind.Sequential)] private struct JOBOBJECT_BASIC_LIMIT_INFORMATION
        {
            public long PerProcessUserTimeLimit, PerJobUserTimeLimit;
            public uint LimitFlags;
            public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize;
            public uint ActiveProcessLimit;
            public UIntPtr Affinity;
            public uint PriorityClass, SchedulingClass;
        }
        [StructLayout(LayoutKind.Sequential)] private struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
        {
            public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
            public IO_COUNTERS IoInfo;
            public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed;
        }
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] private struct STARTUPINFO
        {
            public int cb;
            public string lpReserved, lpDesktop, lpTitle;
            public uint dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
            public short wShowWindow, cbReserved2;
            public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError;
        }
        [StructLayout(LayoutKind.Sequential)] private struct PROCESS_INFORMATION
        { public IntPtr hProcess, hThread; public uint dwProcessId, dwThreadId; }
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern IntPtr CreateJobObjectW(IntPtr attributes, string name);
        [DllImport("kernel32.dll", SetLastError = true)] private static extern bool SetInformationJobObject(IntPtr job, int kind, IntPtr info, uint size);
        [DllImport("kernel32.dll", SetLastError = true)] private static extern bool QueryInformationJobObject(IntPtr job, int kind, IntPtr info, uint size, out uint returned);
        [DllImport("kernel32.dll", SetLastError = true)] private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
        [DllImport("kernel32.dll", SetLastError = true)] private static extern bool IsProcessInJob(IntPtr process, IntPtr job, out bool result);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern bool CreateProcessW(string application, StringBuilder command, IntPtr processAttributes, IntPtr threadAttributes, bool inherit, uint flags, IntPtr environment, string cwd, ref STARTUPINFO startup, out PROCESS_INFORMATION process);
        [DllImport("kernel32.dll", SetLastError = true)] private static extern uint ResumeThread(IntPtr thread);
        [DllImport("kernel32.dll", SetLastError = true)] private static extern bool TerminateProcess(IntPtr process, uint code);
        [DllImport("kernel32.dll", SetLastError = true)] private static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
        [DllImport("kernel32.dll")] private static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
        [DllImport("kernel32.dll")] private static extern bool CloseHandle(IntPtr handle);
    }

    public sealed class OwnedJobProcessSnapshot
    {
        private readonly int[] processIds;
        internal OwnedJobProcessSnapshot(int[] ids) { processIds = ids; }
        public int[] ProcessIds { get { return (int[])processIds.Clone(); } }
        public int ActiveProcessCount { get { return processIds.Length; } }
    }

    // Retained handles keep process identity stable after exit and PID reuse. They
    // only observe; disposing this snapshot never terminates the process or job.
    public sealed class OwnedProcessSnapshot : IDisposable
    {
        private IntPtr process;
        public int Pid { get; private set; }
        public string ImagePath { get; private set; }
        public DateTime CreationTimeUtc { get; private set; }

        internal OwnedProcessSnapshot(int pid, IntPtr handle)
        {
            Pid = pid;
            var path = new StringBuilder(32768);
            uint length = (uint)path.Capacity;
            if (!QueryFullProcessImageNameW(handle, 0, path, ref length)) throw new Win32Exception();
            ImagePath = path.ToString();
            FILETIME creation, exit, kernel, user;
            if (!GetProcessTimes(handle, out creation, out exit, out kernel, out user)) throw new Win32Exception();
            CreationTimeUtc = creation.ToDateTimeUtc();
            process = handle;
        }

        public bool HasExited
        {
            get
            {
                uint result = WaitForSingleObject(GetHandle(), 0);
                if (result == 0) return true;
                if (result == 258) return false;
                if (result == UInt32.MaxValue) throw new Win32Exception();
                throw new InvalidOperationException("Unexpected process wait result.");
            }
        }

        public int? ExitCode
        {
            get
            {
                if (!HasExited) return null;
                uint code;
                if (!GetExitCodeProcess(GetHandle(), out code)) throw new Win32Exception();
                return unchecked((int)code);
            }
        }

        public DateTime? ExitTimeUtc
        {
            get
            {
                if (!HasExited) return null;
                FILETIME creation, exit, kernel, user;
                if (!GetProcessTimes(GetHandle(), out creation, out exit, out kernel, out user)) throw new Win32Exception();
                if (exit.Low == 0 && exit.High == 0) throw new InvalidOperationException("Exited process has no exit time.");
                return exit.ToDateTimeUtc();
            }
        }

        private IntPtr GetHandle()
        {
            if (process == IntPtr.Zero) throw new ObjectDisposedException("OwnedProcessSnapshot");
            return process;
        }

        public void Dispose()
        {
            if (process != IntPtr.Zero) { CloseHandle(process); process = IntPtr.Zero; }
        }

        [StructLayout(LayoutKind.Sequential)] private struct FILETIME
        {
            public uint Low, High;
            public DateTime ToDateTimeUtc() { return DateTime.FromFileTimeUtc(((long)High << 32) | Low); }
        }
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern bool QueryFullProcessImageNameW(IntPtr process, uint flags, StringBuilder name, ref uint size);
        [DllImport("kernel32.dll", SetLastError = true)] private static extern bool GetProcessTimes(IntPtr process, out FILETIME creation, out FILETIME exit, out FILETIME kernel, out FILETIME user);
        [DllImport("kernel32.dll", SetLastError = true)] private static extern bool GetExitCodeProcess(IntPtr process, out uint code);
        [DllImport("kernel32.dll", SetLastError = true)] private static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
        [DllImport("kernel32.dll")] private static extern bool CloseHandle(IntPtr handle);
    }
}
