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
        [DllImport("kernel32.dll", SetLastError = true)] private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
        [DllImport("kernel32.dll", SetLastError = true)] private static extern bool IsProcessInJob(IntPtr process, IntPtr job, out bool result);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern bool CreateProcessW(string application, StringBuilder command, IntPtr processAttributes, IntPtr threadAttributes, bool inherit, uint flags, IntPtr environment, string cwd, ref STARTUPINFO startup, out PROCESS_INFORMATION process);
        [DllImport("kernel32.dll", SetLastError = true)] private static extern uint ResumeThread(IntPtr thread);
        [DllImport("kernel32.dll", SetLastError = true)] private static extern bool TerminateProcess(IntPtr process, uint code);
        [DllImport("kernel32.dll", SetLastError = true)] private static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
        [DllImport("kernel32.dll")] private static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
        [DllImport("kernel32.dll")] private static extern bool CloseHandle(IntPtr handle);
    }
}
