; Keepvidya Flows — custom NSIS installer/uninstaller hooks.
; Same pattern as Knovex (desktop/assets/installer.nsh): before an upgrade,
; kill any running instance and force-clear the old install dir ourselves with
; a retry loop, so electron-builder's uninstaller never aborts on a transiently
; busy file ("Failed to uninstall old application files ... : 2"). Flows has no
; separate backend process, so we only need to close the app itself.

!macro killFlowsProcesses
  DetailPrint "Closing Keepvidya Flows…"
  nsExec::Exec 'taskkill /F /T /IM "Keepvidya Flows.exe"'
  Pop $0
  Sleep 1200
!macroend

!macro forceRemoveOldInstall
  IfFileExists "$INSTDIR\Keepvidya Flows.exe" 0 kvf_rm_done
  StrCpy $R8 0
  kvf_rm_loop:
    RMDir /r "$INSTDIR"
    IfFileExists "$INSTDIR\Keepvidya Flows.exe" 0 kvf_rm_done
    IntOp $R8 $R8 + 1
    IntCmp $R8 20 kvf_rm_done
    Sleep 1000
    Goto kvf_rm_loop
  kvf_rm_done:
    DetailPrint "Old version cleared."
!macroend

!macro customInit
  !insertmacro killFlowsProcesses
  !insertmacro forceRemoveOldInstall
!macroend

!macro customUnInstall
  !insertmacro killFlowsProcesses
!macroend
