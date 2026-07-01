using System.Diagnostics;
using System.Text;

namespace QuickerRpc.Plugin;

/// <summary>File diagnostics for V2 plugin startup (MS.Extensions.Logging does not reach quicker.log).</summary>
internal static class PluginV2DiagnosticLog
{
    private static readonly object Gate = new();
    private static string? _logPath;

    internal static void Write(string message, Exception? ex = null)
    {
        try
        {
            var line = new StringBuilder()
                .Append(DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff"))
                .Append(" [")
                .Append(Environment.CurrentManagedThreadId)
                .Append("] ")
                .Append(message);
            if (ex is not null)
            {
                line.Append(" | ").Append(ex);
            }

            var text = line.ToString();
            Trace.WriteLine(text);

            lock (Gate)
            {
                _logPath ??= Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "Quicker",
                    "logs",
                    "qkrpc-plugin-v2.log");
                var dir = Path.GetDirectoryName(_logPath);
                if (!string.IsNullOrEmpty(dir))
                {
                    Directory.CreateDirectory(dir);
                }

                File.AppendAllText(_logPath, text + Environment.NewLine, Encoding.UTF8);
            }
        }
        catch
        {
            // never throw from diagnostics
        }
    }
}
