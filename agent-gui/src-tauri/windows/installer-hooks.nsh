; Stop child processes before copying resources/ so in-place QuickerAgent updates succeed.
; User data (WebView ai.quicker.agent, %LOCALAPPDATA%/QuickerAgent/plugins + /local) lives outside $INSTDIR — not removed by in-place NSIS.
; Old builds may leave qkrpc serve running after exit (external serve reuse, no job object).
; Bundled node.exe must be released too; NSIS default only kills quicker-agent.exe.

!macro StageKillBundledNodeVbs
  InitPluginsDir
  ; Tauri stages installer-hooks.nsh under target/release/nsis/x64; source vbs stays in src-tauri/windows.
  File "/oname=$PLUGINSDIR\kill-bundled-node.vbs" "${__FILEDIR__}..\..\..\..\windows\kill-bundled-node.vbs"
!macroend

!macro KillBundledNodeUnderInstDir
  StrCpy $9 "$INSTDIR\resources\node"
  DetailPrint "Ensuring bundled node is not running under $9..."
  !insertmacro StageKillBundledNodeVbs
  ; wscript //B runs without a console; ExecWait + powershell flashes even with -WindowStyle Hidden.
  ExecShellWait "" "wscript.exe" '//B //Nologo "$PLUGINSDIR\kill-bundled-node.vbs" "$9"' SW_HIDE
  Sleep 500
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
