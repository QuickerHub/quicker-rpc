; Align Electron NSIS layout with QuickerAgent (per-user):
;   %LOCALAPPDATA%\QuickerAgent\quicker-agent.exe
; User data (plugins, local/, cache) lives alongside the exe — NSIS must not wipe those on update.

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

; Final-directory process/identity gate shared by installer and uninstaller.
; The pinned build adapter keeps the default $LOCALAPPDATA\QuickerAgent layout,
; respects an existing location or /D, and never executes a previous uninstaller.
!macro QA_RunOwnership MODE
  !ifndef QA_VERIFIED_OVERLAY_BUILD
    !error "Use scripts/build-electron-installer.mjs; raw NSIS builds may execute an unsafe old uninstaller."
  !endif
  !if "${QA_VERIFIED_OVERLAY_BUILD}" != "25.1.8-v1"
    !error "Unknown NSIS overlay adapter revision."
  !endif
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File /oname=qa-installer-helper.exe "${BUILD_RESOURCES_DIR}\installer-helper.exe"
  nsExec::ExecToLog /TIMEOUT=15000 '"$PLUGINSDIR\qa-installer-helper.exe" --mode "${MODE}" --directory "$INSTDIR" --install-key "${INSTALL_REGISTRY_KEY}" --uninstall-key "${UNINSTALL_REGISTRY_KEY}" --product "${PRODUCT_NAME}" --executable "${APP_EXECUTABLE_FILENAME}"'
  Pop $0
  ${If} $0 != 0
    DetailPrint "Installation ownership or process shutdown could not be verified. No old uninstaller was executed."
    SetErrorLevel 2
    Abort "请先退出目标目录中的 QuickerAgent；安装身份、目录或进程无法核验时不会继续覆盖文件。"
  ${EndIf}
  SetOutPath "$INSTDIR"
!macroend

!macro customCheckAppRunning
  !ifndef BUILD_UNINSTALLER
    ${If} $installMode != "CurrentUser"
      SetErrorLevel 2
      Abort "当前安装器只支持已核验的当前用户安装。"
    ${EndIf}
  !endif
  !insertmacro QA_RunOwnership "close"
!macroend

!macro QA_VerifyOverlayInstall ROOT_KEY
  ${If} "${ROOT_KEY}" != "SHELL_CONTEXT"
    SetErrorLevel 2
    Abort "不自动迁移其它用户范围的安装。"
  ${EndIf}
  !insertmacro QA_RunOwnership "verify"
!macroend

!ifndef BUILD_UNINSTALLER
Var QA_WantDesktopShortcut
Var QA_WantStartMenuShortcut
Var QA_ShortcutDialog
Var QA_CB_Desktop
Var QA_CB_StartMenu

!macro InitQuickerAgentShortcutChoices
  StrCpy $QA_WantDesktopShortcut "1"
  StrCpy $QA_WantStartMenuShortcut "1"
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

  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend
!endif

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

!macro RemoveQuickerAgentShortcuts
  Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
  !insertmacro RemoveQuickerAgentStartMenuShortcut
!macroend

!macro customInit
  !ifndef BUILD_UNINSTALLER
  !insertmacro InitQuickerAgentShortcutChoices
  !endif
!macroend

!macro customInstall
  !insertmacro ApplyQuickerAgentShortcutChoices
!macroend

; electron-builder wipes $INSTDIR before updates — skip on in-place upgrade so colocated user data survives migration.
!macro customRemoveFiles
  ${if} ${isUpdated}
    !insertmacro quitSuccess
  ${endif}
!macroend

!macro customUnInstall
  !insertmacro RemoveQuickerAgentShortcuts
!macroend
