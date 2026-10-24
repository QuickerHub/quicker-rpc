using System;
using System.IO;
using System.Reflection;
using System.Windows.Forms;
[assembly: AssemblyProduct("QuickerAgent")]
// Test executable only; never included in the shipped helper or application.
internal sealed class OwnedWindowFixture : Form
{
    private readonly string ready;
    public OwnedWindowFixture(string path)
    { ready = path; ShowInTaskbar = false; Opacity = 0; Width = 1; Height = 1; }
    protected override void OnShown(EventArgs args)
    { base.OnShown(args); Hide(); File.WriteAllText(ready, System.Diagnostics.Process.GetCurrentProcess().Id.ToString()); }
    [STAThread] public static void Main(string[] args)
    {
        var timer = new Timer { Interval = 60000 }; timer.Tick += delegate { Environment.Exit(0); }; timer.Start();
        Application.Run(new OwnedWindowFixture(args[0]));
    }
}
