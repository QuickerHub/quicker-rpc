; Stop qkrpc before copying resources/ so in-place QuickerAgent updates succeed.
; Old builds may leave qkrpc serve running after exit (external serve reuse, no job object).

!macro KillQkrpcBeforeInstall
  DetailPrint "Stopping qkrpc processes before install..."
  !insertmacro CheckIfAppIsRunning "qkrpc.exe" "qkrpc"
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro KillQkrpcBeforeInstall
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro KillQkrpcBeforeInstall
!macroend
