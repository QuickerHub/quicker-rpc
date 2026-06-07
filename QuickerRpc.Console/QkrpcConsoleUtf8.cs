using System.Runtime.InteropServices;
using System.Text;

namespace QuickerRpc.Console;

/// <summary>Ensure CLI stdout/stderr emit UTF-8 (including when redirected to a file).</summary>
internal static class QkrpcConsoleUtf8
{
    private static readonly UTF8Encoding Utf8NoBom = new(encoderShouldEmitUTF8Identifier: false);

    public static void Initialize()
    {
        TrySetWindowsConsoleCodePage();

        try
        {
            global::System.Console.OutputEncoding = Utf8NoBom;
            global::System.Console.InputEncoding = Utf8NoBom;

            // Redirected stdout/stderr ignore OutputEncoding; wrap the raw streams explicitly.
            var stdout = new StreamWriter(global::System.Console.OpenStandardOutput(), Utf8NoBom)
            {
                AutoFlush = true,
            };
            global::System.Console.SetOut(stdout);

            var stderr = new StreamWriter(global::System.Console.OpenStandardError(), Utf8NoBom)
            {
                AutoFlush = true,
            };
            global::System.Console.SetError(stderr);
        }
        catch
        {
            // ignore — fall back to default console writers
        }
    }

    private static void TrySetWindowsConsoleCodePage()
    {
        if (!RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            return;
        }

        try
        {
            const uint utf8CodePage = 65001;
            SetConsoleOutputCP(utf8CodePage);
            SetConsoleCP(utf8CodePage);
        }
        catch
        {
            // ignore
        }
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetConsoleOutputCP(uint wCodePageID);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetConsoleCP(uint wCodePageID);
}
