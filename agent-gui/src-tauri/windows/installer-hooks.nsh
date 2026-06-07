; Stop child processes before copying resources/ so in-place QuickerAgent updates succeed.
; User data (WebView ai.quicker.agent, %LOCALAPPDATA%/QuickerAgent/plugins + /local) lives outside $INSTDIR — not removed by in-place NSIS.
; Old builds may leave qkrpc serve running after exit (external serve reuse, no job object).
; Bundled node.exe must be released too; NSIS default only kills quicker-agent.exe.

!macro KillBundledNodeUnderInstDir
  DetailPrint "Ensuring bundled node.exe is not running under $INSTDIR..."
  StrCpy $9 "$INSTDIR\resources\node\node.exe"
  ExecWait 'powershell -NoProfile -WindowStyle Hidden -Command "Get-CimInstance Win32_Process -Filter \"Name=''node.exe''\" -ErrorAction SilentlyContinue | Where-Object { $$_.ExecutablePath -ieq ''$9'' } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue }"' $8
  Sleep 1000
!macroend

!macro KillQkrpcBeforeInstall
  DetailPrint "Stopping qkrpc processes before install..."
  !insertmacro CheckIfAppIsRunning "qkrpc.exe" "qkrpc"
!macroend

!macro KillQuickerAgentBeforeInstall
  DetailPrint "Stopping QuickerAgent before install..."
  !insertmacro CheckIfAppIsRunning "quicker-agent.exe" "QuickerAgent"
  !insertmacro KillBundledNodeUnderInstDir
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro KillQkrpcBeforeInstall
  !insertmacro KillQuickerAgentBeforeInstall
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro KillQkrpcBeforeInstall
  !insertmacro KillQuickerAgentBeforeInstall
!macroend
