; Sicherheitsnetz für den Umstieg von Versionen <= 1.1.0.
;
; Bis 1.1.0 lag die times.json direkt im Installationsordner. Der Uninstaller
; von electron-builder räumt diesen Ordner beim Update mit "RMDir /r" komplett
; ab – die Zeitdaten wären damit weg, bevor die neue Version sie übernehmen
; kann. customInit läuft VOR dem Entfernen der alten Version und rettet die
; Datei nach "Dokumente\Stempeluhr".
;
; Eine dort bereits vorhandene times.json wird NICHT überschrieben.

!macro customInit
  ${if} ${FileExists} "$INSTDIR\times.json"
    CreateDirectory "$DOCUMENTS\Stempeluhr"
    ${ifNot} ${FileExists} "$DOCUMENTS\Stempeluhr\times.json"
      CopyFiles /SILENT "$INSTDIR\times.json" "$DOCUMENTS\Stempeluhr\times.json"
      DetailPrint "Zeitdaten nach Dokumente\Stempeluhr übernommen."
    ${endif}
    ; Zusätzlich eine unveränderte Kopie ablegen, falls am Ziel schon etwas lag
    ${ifNot} ${FileExists} "$DOCUMENTS\Stempeluhr\times.aus-programmordner.json"
      CopyFiles /SILENT "$INSTDIR\times.json" "$DOCUMENTS\Stempeluhr\times.aus-programmordner.json"
    ${endif}
  ${endif}
!macroend
