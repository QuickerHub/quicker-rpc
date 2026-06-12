; Align Electron NSIS layout with QuickerAgent (per-user):
;   %LOCALAPPDATA%\QuickerAgent\quicker-agent.exe
; User data (plugins, local/, cache) stays under %LOCALAPPDATA%\QuickerAgent — unchanged.

!include "nsDialogs.nsh"

; Crisp UI on HiDPI displays; show file copy progress on assisted installer.
!macro customHeader
  ManifestDPIAware true
  ManifestDPIAwareness PerMonitorV2
  ShowInstDetails show
  ShowUninstDetails show
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

Var QA_WantDesktopShortcut
Var QA_WantStartMenuShortcut
Var QA_ShortcutDialog
Var QA_CB_Desktop
Var QA_CB_StartMenu

!macro InitQuickerAgentShortcutChoices
  StrCpy $QA_WantDesktopShortcut "1"
  StrCpy $QA_WantStartMenuShortcut "1"
!macroend

!macro NormalizeQuickerAgentInstallDir
  ; electron-builder may append \${APP_FILENAME} under the chosen folder — keep flat layout.
  StrCpy $R9 "${APP_FILENAME}"
  StrLen $R8 $R9
  IntOp $R1 $R8 + 1
  StrCpy $R5 $INSTDIR $R1 -$R1
  StrCpy $R6 "\${APP_FILENAME}"
  StrCmp $R5 $R6 0 +2
  StrCpy $INSTDIR $INSTDIR -$R1
!macroend

Function QuickerAgentShortcutsPageCreate
  ; PageEx Caption sets the wizard step title (no MUI header macro in electron-builder NSIS).
  nsDialogs::Create 1018
  Pop $QA_ShortcutDialog
  ${If} $QA_ShortcutDialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 24u "请选择在开始菜单或桌面创建 QuickerAgent 快捷方式："
  Pop $0

  ${NSD_CreateCheckbox} 0 36u 100% 12u "创建桌面快捷方式 (&D)"
  Pop $QA_CB_Desktop
  ${NSD_CreateCheckbox} 0 56u 100% 12u "创建开始菜单快捷方式 (&S)"
  Pop $QA_CB_StartMenu

  ${If} $QA_WantDesktopShortcut == "1"
    ${NSD_Check} $QA_CB_Desktop
  ${EndIf}
  ${If} $QA_WantStartMenuShortcut == "1"
    ${NSD_Check} $QA_CB_StartMenu
  ${EndIf}

  nsDialogs::Show
FunctionEnd

Function QuickerAgentShortcutsPageLeave
  !insertmacro NormalizeQuickerAgentInstallDir

  ${NSD_GetState} $QA_CB_Desktop $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $QA_WantDesktopShortcut "1"
  ${Else}
    StrCpy $QA_WantDesktopShortcut "0"
  ${EndIf}

  ${NSD_GetState} $QA_CB_StartMenu $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $QA_WantStartMenuShortcut "1"
  ${Else}
    StrCpy $QA_WantStartMenuShortcut "0"
  ${EndIf}
FunctionEnd

!macro customWelcomePage
  !insertmacro MUI_PAGE_WELCOME
!macroend

; Shown on every install (fresh + upgrade); not subject to skipPageIfUpdated.
!macro customPageAfterChangeDir
  PageEx custom
    PageCallbacks QuickerAgentShortcutsPageCreate QuickerAgentShortcutsPageLeave
    Caption "快捷方式"
  PageExEnd
!macroend

!macro CreateQuickerAgentStartMenuShortcut
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
!macroend

!macro RemoveQuickerAgentStartMenuShortcut
  !ifdef MENU_FILENAME
    Delete "$SMPROGRAMS\${MENU_FILENAME}\${SHORTCUT_NAME}.lnk"
    RMDir "$SMPROGRAMS\${MENU_FILENAME}"
  !else
    Delete "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"
  !endif
!macroend

!macro ApplyQuickerAgentShortcutChoices
  ${If} $QA_WantDesktopShortcut == "1"
    CreateShortCut "$DESKTOP\${SHORTCUT_NAME}.lnk" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
    ClearErrors
    WinShell::SetLnkAUMI "$DESKTOP\${SHORTCUT_NAME}.lnk" "${APP_ID}"
  ${Else}
    Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
    ClearErrors
  ${EndIf}

  ${If} $QA_WantStartMenuShortcut == "1"
    !insertmacro CreateQuickerAgentStartMenuShortcut
  ${Else}
    !insertmacro RemoveQuickerAgentStartMenuShortcut
  ${EndIf}

  ; Legacy Tauri start-menu folder (QuickerAgentTest era).
  Delete "$SMPROGRAMS\QuickerAgent\QuickerAgent.lnk"
  RMDir "$SMPROGRAMS\QuickerAgent"
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend

!macro RemoveQuickerAgentShortcuts
  Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
  !insertmacro RemoveQuickerAgentStartMenuShortcut
  Delete "$SMPROGRAMS\QuickerAgent\QuickerAgent.lnk"
  RMDir "$SMPROGRAMS\QuickerAgent"
!macroend

!macro customInit
  ; Default install dir — same as Tauri NSIS (currentUser mode).
  StrCpy $INSTDIR "$LOCALAPPDATA\QuickerAgent"
  !insertmacro InitQuickerAgentShortcutChoices
  ; Never reuse prior shortcut choices from registry (user re-selects each run).
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
  !insertmacro ApplyQuickerAgentShortcutChoices
!macroend

!macro customUnInstall
  !insertmacro StopQuickerAgentInstallTree
  !insertmacro RemoveQuickerAgentShortcuts
!macroend
