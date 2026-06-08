' Terminate node.exe processes whose image path is under the bundled node directory.
' Invoked by NSIS installer hooks via wscript.exe (no console window).

Option Explicit

Dim prefix, attempt, wmi, procs, proc, path, killer

prefix = WScript.Arguments(0)
If prefix = "" Then WScript.Quit 0

Set wmi = GetObject("winmgmts:\\.\root\cimv2")

For attempt = 1 To 3
  Set procs = wmi.ExecQuery("SELECT ProcessId, ExecutablePath FROM Win32_Process WHERE Name='node.exe'")
  For Each proc In procs
    path = ""
    On Error Resume Next
    path = proc.ExecutablePath
    On Error GoTo 0
    If path <> "" Then
      If StrComp(Left(path, Len(prefix)), prefix, 1) = 0 Then
        Set killer = wmi.Get("Win32_Process.Handle='" & proc.ProcessId & "'")
        killer.Terminate
      End If
    End If
  Next
  WScript.Sleep 500
Next
