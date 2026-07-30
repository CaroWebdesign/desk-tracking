; Sicherheitsnetz für den Umstieg von Versionen <= 1.1.0.
;
; Bis 1.1.0 lag die times.json direkt im Installationsordner. Der Uninstaller
; von electron-builder räumt diesen Ordner beim Update mit "RMDir /r" komplett
; ab – die Zeitdaten wären damit weg, bevor die neue Version sie übernehmen
; kann. customInit läuft VOR dem Entfernen der alten Version und rettet die
; Datei nach "Dokumente\Desk Tracking".
;
; Zwei Regeln, damit dabei nie ein neuerer Stand verlorengeht:
;   1. Eine bereits vorhandene "Dokumente\Desk Tracking\times.json" wird nicht
;      überschrieben.
;   2. Gibt es "Dokumente\Stempeluhr\times.json" (so hieß die App in den
;      Versionen 1.2.0 bis 1.6.0), wird hier nichts angelegt. Dieser Stand ist
;      neuer als alles aus dem Programmordner; die App übernimmt ihn beim ersten
;      Start selbst. Würden wir das Ziel jetzt befüllen, überspränge sie diese
;      Übernahme und der Nutzer arbeitete mit veralteten Zeiten weiter.

!macro customInit
  ${if} ${FileExists} "$INSTDIR\times.json"
  ${andIfNot} ${FileExists} "$DOCUMENTS\Stempeluhr\times.json"
    CreateDirectory "$DOCUMENTS\Desk Tracking"
    ${ifNot} ${FileExists} "$DOCUMENTS\Desk Tracking\times.json"
      CopyFiles /SILENT "$INSTDIR\times.json" "$DOCUMENTS\Desk Tracking\times.json"
      DetailPrint "Zeitdaten nach Dokumente\Desk Tracking übernommen."
    ${endif}
    ; Zusätzlich eine unveränderte Kopie ablegen, falls am Ziel schon etwas lag
    ${ifNot} ${FileExists} "$DOCUMENTS\Desk Tracking\times.aus-programmordner.json"
      CopyFiles /SILENT "$INSTDIR\times.json" "$DOCUMENTS\Desk Tracking\times.aus-programmordner.json"
    ${endif}
  ${endif}
!macroend
