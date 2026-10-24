using System;
using System.Diagnostics;
using System.IO;
using Microsoft.Win32;
using QuickerAgent.Installer;

internal static class NativeTests
{
    private static void Check(bool condition, string message) { if (!condition) throw new Exception(message); }
    public static int Main(string[] args)
    {
        string target = args[0], foreign = args[1], token = args[2];
        int rootPid = Int32.Parse(args[3]), foreignPid = Int32.Parse(args[4]), backendPid = Int32.Parse(args[5]);
        Guid parsed;
        if (!Guid.TryParse(token, out parsed) || !Path.GetFullPath(target).Contains("installer-native-" + token)) return 3;
        string ownedDirectory = Path.GetFullPath(AppDomain.CurrentDomain.BaseDirectory);
        if (Path.GetFullPath(target) != Path.Combine(ownedDirectory, "target") || Path.GetFullPath(foreign) != Path.Combine(ownedDirectory, "foreign")) return 3;
        var rootProcess = Process.GetProcessById(rootPid); var ownedRootHandle = rootProcess.Handle;
        string prefix = @"Software\QuickerAgent\InstallerTests\" + token, install = prefix + @"\Install", uninstall = prefix + @"\Uninstall";
        bool created = false;
        try
        {
            var targetPath = NativeInstallationPaths.DirectoryTarget(target);
            Check(targetPath.CaseInsensitiveAncestorsVerified, "Native case ancestry not verified");
            foreach (string file in new[] { "libEGL.dll", "ffmpeg.dll", "vk_swiftshader_icd.json", "uninstallerIcon.ico", "quicker-agent.exe" })
                Check(PayloadPolicy.IsRootFile(file), "A root program file escaped native metadata checks");
            Check(!PayloadPolicy.IsDirectory("local") && !PayloadPolicy.IsRootFile("llm-config.json"), "User data became payload");
            foreach (string cloud in new[] { "OneDrive-fixture", "Dropbox", "iCloudDrive" })
            {
                bool cloudRejected = false;
                try { NativeInstallationPaths.EnsureLocalPath(Path.Combine(target, "resources", cloud, "not-read.exe")); } catch (IOException) { cloudRejected = true; }
                Check(cloudRejected, "Cloud resource names must be rejected before filesystem traversal");
            }
            NativeInstallationPaths.EnsureLocalPath(Path.Combine(target, "resources", "OneDrive.svg"), false);
            Check(NativeInstallationPaths.Final(Path.Combine(target, "quicker-agent.exe"), false) == Path.Combine(targetPath.FinalPath, "quicker-agent.exe"), "Final image path mismatch");
            using (var current = RegistryKey.OpenBaseKey(RegistryHive.CurrentUser, RegistryView.Registry64))
            {
                using (var prior = current.OpenSubKey(prefix, false)) if (prior != null) throw new IOException("Fresh owned registry namespace required.");
                using (var owned = current.CreateSubKey(prefix)) created = true;
                using (var key = current.CreateSubKey(install)) key.SetValue("InstallLocation", target);
                using (var key = current.CreateSubKey(uninstall)) { key.SetValue("DisplayName", "Foreign product"); key.SetValue("UninstallString", "\"" + Path.Combine(target, "Uninstall quicker-agent.exe") + "\" /currentuser"); }
            }
            bool rejected = false;
            try { InstallationRegistration.Verify(target, InstallationRegistration.Read(install, uninstall), "QuickerAgent", "quicker-agent.exe"); }
            catch (IOException) { rejected = true; }
            Check(rejected && !Process.GetProcessById(rootPid).HasExited, "Unknown product was signalled");
            using (var current = RegistryKey.OpenBaseKey(RegistryHive.CurrentUser, RegistryView.Registry64))
            using (var key = current.OpenSubKey(uninstall, true)) key.SetValue("DisplayName", "QuickerAgent");
            Func<ResolvedInstallationDirectory> verify = delegate { return InstallationRegistration.Verify(target, InstallationRegistration.Read(install, uninstall), "QuickerAgent", "quicker-agent.exe"); };
            verify();
            rejected = false;
            try { InstallationRegistration.Verify(foreign, InstallationRegistration.Read(install, uninstall), "QuickerAgent", "quicker-agent.exe"); } catch (IOException) { rejected = true; }
            Check(rejected, "A changed target was accepted");
            var observed = ProcessOwnershipPolicy.VerifyClosed(new NativeInstallationProcessPlatform(verify, new[] { rootPid, foreignPid, backendPid }), target, 1500);
            Check(!observed.Success && observed.RootCloseRequests == 0 && !rootProcess.HasExited, "Read-only pre-copy verification closed or ignored an active root");
            var result = ProcessOwnershipPolicy.CloseRoots(new NativeInstallationProcessPlatform(verify, new[] { rootPid, foreignPid, backendPid }), target, 1500);
            Check(!result.Success && result.RootCloseRequests == 1, "Remaining backend was ignored or root close failed: " + result.Code);
            Check(rootProcess.WaitForExit(2000), "Owned root did not close");
            using (var other = Process.GetProcessById(foreignPid)) Check(!other.HasExited, "Foreign same-name instance was closed");
            using (var backend = Process.GetProcessById(backendPid)) Check(!backend.HasExited, "Non-root was closed without ownership");
            Console.WriteLine("PASS native final paths/case ancestry, owned HKCU product identity, changed-target rejection, exact root WM_CLOSE, foreign isolation, backend blocker");
            return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error); return 1; }
        finally
        {
            rootProcess.Dispose();
            // The random test namespace is the only registry subtree we own.
            if (created && prefix.StartsWith(@"Software\QuickerAgent\InstallerTests\", StringComparison.Ordinal))
                using (var current = RegistryKey.OpenBaseKey(RegistryHive.CurrentUser, RegistryView.Registry64)) current.DeleteSubKeyTree(prefix, false);
        }
    }
}
