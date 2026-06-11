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

; electron-builder skips shortcut creation on upgrade when KeepShortcuts=true in registry.
!macro CreateOrRefreshQuickerAgentShortcuts
  CreateShortCut "$DESKTOP\${SHORTCUT_NAME}.lnk" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
  ClearErrors
  !ifdef MENU_FILENAME
    CreateDirectory "$SMPROGRAMS\${MENU_FILENAME}"
    CreateShortCut "$SMPROGRAMS\${MENU_FILENAME}\${SHORTCUT_NAME}.lnk" "$appExe" "" "$appExe"
    ClearErrors
    WinShell::SetLnkAUMI "$SMPROGRAMS\${MENU_FILENAME}\${SHORTCUT_NAME}.lnk" "${APP_ID}"
  !else
    CreateShortCut "$SMPROGRAMS\${SHORTCUT_NAME}.lnk" "$appExe" "" "$appExe"
    ClearErrors
    WinShell::SetLnkAUMI "$SMPROGRAMS\${SHORTCUT_NAME}.lnk" "${APP_ID}"
  !endif
  WinShell::SetLnkAUMI "$DESKTOP\${SHORTCUT_NAME}.lnk" "${APP_ID}"
  ; Legacy Tauri start-menu folder (QuickerAgentTest era).
  Delete "$SMPROGRAMS\QuickerAgent\QuickerAgent.lnk"
  RMDir "$SMPROGRAMS\QuickerAgent"
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend

!macro RemoveQuickerAgentShortcuts
  Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
  !ifdef MENU_FILENAME
    Delete "$SMPROGRAMS\${MENU_FILENAME}\${SHORTCUT_NAME}.lnk"
    RMDir "$SMPROGRAMS\${MENU_FILENAME}"
  !else
    Delete "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"
  !endif
  Delete "$SMPROGRAMS\QuickerAgent\QuickerAgent.lnk"
  RMDir "$SMPROGRAMS\QuickerAgent"
!macroend

!macro customInit
  ; Default install dir — same as Tauri NSIS (currentUser mode).
  StrCpy $INSTDIR "$LOCALAPPDATA\QuickerAgent"
  ; Force shortcut recreation on upgrade (electron-builder KeepShortcuts skips creation).
  DeleteRegValue SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" "KeepShortcuts"
  ; Stale Tauri uninstall entry (points at QuickerAgentTest).
  DeleteRegKey SHELL_CONTEXT "Software\Microsoft\Windows\CurrentVersion\Uninstall\QuickerAgent"
  !insertmacro StopQuickerAgentInstallTree
!macroend

!macro customInstall
  ; Legacy Electron trial builds used QuickerAgent.exe in Programs\QuickerAgent.
  Delete "$INSTDIR\QuickerAgent.exe"
  ; Orphan WebView2 user-data from Tauri (Electron uses Chromium embedded-browser profile).
  RMDir /r "$LOCALAPPDATA\ai.quicker.agent"
  !insertmacro CreateOrRefreshQuickerAgentShortcuts
!macroend

!macro customUnInstall
  !insertmacro StopQuickerAgentInstallTree
  !insertmacro RemoveQuickerAgentShortcuts
!macroend
