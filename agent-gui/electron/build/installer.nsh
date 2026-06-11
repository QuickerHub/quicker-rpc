; Align Electron NSIS layout with QuickerAgent (per-user):
;   %LOCALAPPDATA%\QuickerAgent\quicker-agent.exe
; User data (plugins, local/, cache) stays under %LOCALAPPDATA%\QuickerAgent — unchanged.

; Crisp UI on HiDPI displays.
!macro customHeader
  ManifestDPIAware true
  ManifestDPIAwareness PerMonitorV2
!macroend

; Per-user only — skip the "install for all users / me" wizard page.
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

!macro _KillImage IMAGE
  nsExec::ExecToLog 'taskkill /F /IM "${IMAGE}" /T'
  Pop $0
!macroend

!macro StopQuickerAgentInstallTree
  DetailPrint "Stopping QuickerAgent / bundled backends before install..."
  !insertmacro _KillImage "quicker-agent.exe"
  !insertmacro _KillImage "QuickerAgent.exe"
  Sleep 1500
!macroend

!macro customInit
  ; Default install dir — same as Tauri NSIS (currentUser mode).
  StrCpy $INSTDIR "$LOCALAPPDATA\QuickerAgent"
  !insertmacro StopQuickerAgentInstallTree
!macroend

!macro customInstall
  ; Legacy Electron trial builds used QuickerAgent.exe in Programs\QuickerAgent.
  Delete "$INSTDIR\QuickerAgent.exe"
  ; Orphan WebView2 user-data from Tauri (Electron uses Chromium embedded-browser profile).
  RMDir /r "$LOCALAPPDATA\ai.quicker.agent"
!macroend

!macro customUnInstall
  !insertmacro StopQuickerAgentInstallTree
!macroend
