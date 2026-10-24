using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.Versioning;

[assembly: TargetFramework(".NETFramework,Version=v4.7.2")]
namespace QuickerAgent.Installer
{
    public static class InstallerOwnership
    {
        public static int Main(string[] args)
        {
            try
            {
                var options = new Dictionary<string, string>(StringComparer.Ordinal);
                for (int index = 0; index < args.Length; index += 2)
                {
                    if (index + 1 >= args.Length || !args[index].StartsWith("--", StringComparison.Ordinal) || options.ContainsKey(args[index]))
                        throw new IOException("Invalid ownership arguments.");
                    options.Add(args[index], args[index + 1]);
                }
                foreach (string name in new[] { "--directory", "--install-key", "--uninstall-key", "--product", "--executable", "--mode" })
                    if (!options.ContainsKey(name)) throw new IOException("Incomplete ownership arguments.");
                if (options.Count != 6 || (options["--mode"] != "close" && options["--mode"] != "verify")) throw new IOException("Unsupported ownership mode.");
                Func<ResolvedInstallationDirectory> verify = delegate {
                    return InstallationRegistration.Verify(options["--directory"], InstallationRegistration.Read(options["--install-key"], options["--uninstall-key"]), options["--product"], options["--executable"]);
                };
                // A product's registration and final path are checked before the
                // process platform exists; unknown products receive zero WM_CLOSE.
                verify();
                var platform = new NativeInstallationProcessPlatform(verify, null);
                var result = options["--mode"] == "close" ? ProcessOwnershipPolicy.CloseRoots(platform, options["--directory"], 5000)
                    : ProcessOwnershipPolicy.VerifyClosed(platform, options["--directory"], 5000);
                Console.WriteLine(result.Code + "; rootCloseRequests=" + result.RootCloseRequests);
                if (!result.Success) return 2;
                verify();
                Console.WriteLine("INSTALLATION_TARGET_VERIFIED"); return 0;
            }
            catch (Exception error) { Console.Error.WriteLine("INSTALLATION_OWNERSHIP_REJECTED: " + error.Message); return 2; }
        }
    }
}
