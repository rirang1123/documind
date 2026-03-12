; DocuMind NSIS Installer Hooks
; Customizes uninstall behavior to also remove user data folders

!macro NSIS_HOOK_POSTUNINSTALL
    ; $DeleteAppDataCheckboxState = 1 when "애플리케이션 데이터 삭제하기" is checked
    ; $UpdateMode = 1 during auto-update (should NOT delete data)
    ${If} $DeleteAppDataCheckboxState = 1
    ${AndIf} $UpdateMode <> 1
        ; Delete the DocuMind user data folder (Documents/DocuMind)
        SetShellVarContext current
        IfFileExists "$DOCUMENTS\DocuMind\*.*" 0 +2
            RmDir /r "$DOCUMENTS\DocuMind"
    ${EndIf}
!macroend
