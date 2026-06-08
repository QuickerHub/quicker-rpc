; Stop child processes before copying resources/ so in-place QuickerAgent updates succeed.
; User data (WebView ai.quicker.agent, %LOCALAPPDATA%/QuickerAgent/plugins + /local) lives outside $INSTDIR — not removed by in-place NSIS.
; Old builds may leave qkrpc serve running after exit (external serve reuse, no job object).
; Bundled node.exe must be released too; NSIS default only kills quicker-agent.exe.

!macro KillBundledNodeOnce
  StrCpy $R0 'powershell -NoProfile -WindowStyle Hidden -Command "& { param($$d) Get-CimInstance Win32_Process -Filter \"Name=''node.exe''\" -EA 0 | Where-Object { $$_.ExecutablePath -and $$_.ExecutablePath.StartsWith($$d, [StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force -EA 0 } } -d ''$9''"'
  ExecWait $R0 $8
  Sleep 1500
!macroend

!macro KillBundledNodeUnderInstDir
  StrCpy $9 "$INSTDIR\resources\node"
  DetailPrint "Ensuring bundled node is not running under $9..."
  !insertmacro KillBundledNodeOnce
  !insertmacro KillBundledNodeOnce
  !insertmacro KillBundledNodeOnce
!macroend

!macro KillQkrpcBeforeInstall
  DetailPrint "Stopping qkrpc processes before install..."
  !insertmacro CheckIfAppIsRunning "qkrpc.exe" "qkrpc"
!macroend

!macro KillQuickerAgentBeforeInstall
  DetailPrint "Stopping QuickerAgent before install..."
  !insertmacro CheckIfAppIsRunning "quicker-agent.exe" "QuickerAgent"
  Sleep 2000
  !insertmacro KillBundledNodeUnderInstDir
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro KillQkrpcBeforeInstall
  !insertmacro KillQuickerAgentBeforeInstall
  ; Skip locked files (e.g. bundled node.exe) instead of Abort/Retry/Ignore dialog.
  SetOverwrite try
  DetailPrint "Overwrite mode: try (locked files are skipped silently)"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro KillQkrpcBeforeInstall
  !insertmacro KillQuickerAgentBeforeInstall
  SetOverwrite try
!macroend
