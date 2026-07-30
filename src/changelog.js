// Änderungsliste für das Fenster unter „Einstellungen → Updates".
//
// Aufgeführt sind die tatsächlich veröffentlichten Versionen. Zwischen 1.2.1
// und 1.7.0 lagen Entwicklungsstände, die nie ein Release wurden – deren
// Neuerungen stehen deshalb gesammelt bei 1.7.0, denn dort haben sie die
// Nutzer erreicht.
//
// Eine neue Version ergänzt einen Eintrag OBEN. Die Texte liegen hier statt in
// i18n.js, damit die Übersetzungstabelle nicht mit jeder Version länger wird.

const CHANGELOG = [
  {
    version: '1.10.0',
    datum: '2026-07-31',
    punkte: {
      de: [
        'Das Fenster lässt sich schließen, ohne die App zu beenden: sie läuft dann mit einem Symbol im Infobereich der Taskleiste weiter, neben Uhr und WLAN. Einzuschalten unter „Einstellungen → Schnellzugriff → Beim Schließen".',
        'Eine laufende Erfassung zählt dabei weiter. Ein Klick auf das Symbol holt das Fenster zurück, das Menü der rechten Maustaste beendet die App wirklich.',
        'Das Mini-Bedienfeld hat jetzt ein X. Läuft die App im Infobereich weiter, blendet es nur aus – sonst fragt es vorher, ob die laufende Erfassung noch gestempelt und gespeichert werden soll.',
      ],
      en: [
        'The window can be closed without quitting the app: it keeps running with an icon in the notification area of the taskbar, next to the clock and Wi-Fi. Switch it on under “Settings → Quick access → When closing”.',
        'A running entry keeps counting. Click the icon to bring the window back; the right-click menu quits for real.',
        'The mini panel now has an X. If the app keeps running in the notification area, it only hides – otherwise it asks first whether the running entry should be clocked out and saved.',
      ],
      fr: [
        'La fenêtre peut être fermée sans quitter l’application : elle continue avec une icône dans la zone de notification de la barre des tâches, à côté de l’horloge et du Wi-Fi. À activer sous « Réglages → Accès rapide → À la fermeture ».',
        'Un pointage en cours continue de compter. Un clic sur l’icône ramène la fenêtre ; le menu du clic droit quitte vraiment.',
        'Le mini-panneau a maintenant une croix. Si l’application continue dans la zone de notification, elle ne fait que masquer – sinon elle demande d’abord si le pointage en cours doit être clôturé et enregistré.',
      ],
      es: [
        'La ventana se puede cerrar sin terminar la aplicación: sigue funcionando con un icono en el área de notificación de la barra de tareas, junto al reloj y el wifi. Se activa en «Ajustes → Acceso rápido → Al cerrar».',
        'Un fichaje en curso sigue contando. Un clic en el icono devuelve la ventana; el menú del botón derecho la cierra de verdad.',
        'El mini panel ahora tiene una X. Si la aplicación sigue en el área de notificación, solo se oculta; si no, pregunta antes si el fichaje en curso debe cerrarse y guardarse.',
      ],
      ja: [
        'ウィンドウを閉じてもアプリを終了しないようにできます。時計や Wi-Fi の隣、タスクバーの通知領域にアイコンが残って動き続けます。「設定 → クイックアクセス → 閉じたとき」で有効にします。',
        '記録中の時間はそのまま進みます。アイコンをクリックするとウィンドウが戻り、右クリックのメニューから本当に終了できます。',
        'ミニ操作パネルに × が付きました。通知領域で動き続ける設定なら隠すだけ、そうでなければ記録を打刻して保存するかを先に確認します。',
      ],
      zh: [
        '现在可以关闭窗口而不退出程序：它会在任务栏通知区域（时钟和无线网络旁边）留下一个图标继续运行。在“设置 → 快捷操作 → 关闭时”开启。',
        '正在进行的记录会继续计时。点击图标可以把窗口找回来，右键菜单才是真正退出。',
        '迷你面板多了一个 ×。如果程序在通知区域继续运行，它只是隐藏；否则会先询问是否要为正在进行的记录打卡下班并保存。',
      ],
    },
  },
  {
    version: '1.9.0',
    datum: '2026-07-30',
    punkte: {
      de: [
        'Automatische Updates lassen sich abschalten – unter „Einstellungen → Updates".',
        'Abgeschaltet nimmt das Programm von sich aus keine Verbindung auf: Du suchst selbst und entscheidest, wann geladen und installiert wird.',
        'Wird dabei eine neuere Version gefunden, erscheint ein Knopf „Herunterladen" statt eines Downloads im Hintergrund.',
      ],
      en: [
        'Automatic updates can be switched off – under “Settings → Updates”.',
        'Switched off, the program makes no connection on its own: you search yourself and decide when to download and install.',
        'If a newer version is found that way, a “Download” button appears instead of a background download.',
      ],
      fr: [
        'Les mises à jour automatiques peuvent être désactivées – sous « Réglages → Mises à jour ».',
        'Désactivées, le programme n’établit aucune connexion de lui-même : vous cherchez vous-même et décidez du moment.',
        'Si une version plus récente est trouvée, un bouton « Télécharger » apparaît au lieu d’un téléchargement en arrière-plan.',
      ],
      es: [
        'Las actualizaciones automáticas se pueden desactivar – en «Ajustes → Actualizaciones».',
        'Desactivadas, el programa no establece ninguna conexión por su cuenta: buscas tú mismo y decides cuándo.',
        'Si se encuentra una versión más nueva, aparece un botón «Descargar» en vez de una descarga en segundo plano.',
      ],
      ja: [
        '自動更新を無効にできます（「設定 → 更新」）。',
        '無効にすると、プログラムは自分から通信しません。確認も、取得と適用のタイミングも、あなたが決めます。',
        '新しいバージョンが見つかった場合は、背後での取得ではなく「ダウンロード」ボタンが表示されます。',
      ],
      zh: [
        '可以关闭自动更新 – 在“设置 → 更新”中。',
        '关闭后，程序不会自行联网：由你自己检查，并决定何时下载与安装。',
        '若发现新版本，会显示“下载”按钮，而不是在后台下载。',
      ],
    },
  },
  {
    version: '1.8.1',
    datum: '2026-07-30',
    punkte: {
      de: [
        'Die Einstellungen unter „Schnellzugriff" sind jetzt in Tastenkürzel, Mini-Bedienfeld und Erinnerungen unterteilt – vorher liefen die drei Bereiche ohne Trennung ineinander.',
      ],
      en: [
        'The settings under “Quick access” are now split into keyboard shortcut, mini panel and reminders – the three areas used to run together without separation.',
      ],
      fr: [
        'Les réglages sous « Accès rapide » sont désormais séparés en raccourci clavier, mini-panneau et rappels – les trois zones se confondaient auparavant.',
      ],
      es: [
        'Los ajustes en «Acceso rápido» ahora se dividen en atajo de teclado, panel reducido y recordatorios – antes las tres áreas se mezclaban sin separación.',
      ],
      ja: [
        '「クイックアクセス」の設定をショートカット・ミニパネル・リマインダーに区切りました。これまでは三つの領域が区切りなく続いていました。',
      ],
      zh: [
        '“快速访问”中的设置现已分为快捷键、迷你面板与提醒三部分 – 此前三个区域之间没有分隔。',
      ],
    },
  },
  {
    version: '1.8.0',
    datum: '2026-07-30',
    punkte: {
      de: [
        'Diese Liste: unter „Einstellungen → Updates" zeigt „Was ist neu?" die Änderungen der letzten Versionen.',
        'Windows schrieb über jede Benachrichtigung eine interne Kennung statt „Desk Tracking" – behoben.',
        'Erinnerungen sprechen die eingestellte Sprache; bisher blieben Zusätze wie „heute" deutsch.',
        'Im Kalender dehnte ein langer Termin-Titel seine Spalte, wodurch Samstag und Sonntag gequetscht wurden.',
      ],
      en: [
        'This list: under “Settings → Updates”, “What’s new?” shows the changes of recent versions.',
        'Windows put an internal identifier above every notification instead of “Desk Tracking” – fixed.',
        'Reminders now follow the selected language; additions like “today” stayed German before.',
        'In the calendar a long event title stretched its column, squeezing Saturday and Sunday.',
      ],
      fr: [
        'Cette liste : sous « Réglages → Mises à jour », « Quoi de neuf ? » montre les changements récents.',
        'Windows affichait un identifiant interne au-dessus de chaque notification au lieu de « Desk Tracking » – corrigé.',
        'Les rappels suivent la langue choisie ; des ajouts comme « aujourd’hui » restaient en allemand.',
        'Dans le calendrier, un titre d’événement long élargissait sa colonne et comprimait le samedi et le dimanche.',
      ],
      es: [
        'Esta lista: en «Ajustes → Actualizaciones», «¿Qué hay de nuevo?» muestra los cambios recientes.',
        'Windows escribía un identificador interno sobre cada notificación en vez de «Desk Tracking» – corregido.',
        'Los recordatorios siguen el idioma elegido; añadidos como «hoy» seguían en alemán.',
        'En el calendario, un título de evento largo ensanchaba su columna y estrechaba el sábado y el domingo.',
      ],
      ja: [
        'この一覧：「設定 → 更新」の「新機能」で、最近のバージョンの変更点を確認できます。',
        '通知の上部に「Desk Tracking」ではなく内部識別子が表示される問題を修正しました。',
        'リマインダーが選択した言語に従います。これまで「今日」などはドイツ語のままでした。',
        'カレンダーで予定名が長いとその列が広がり、土曜と日曜が狭くなる問題を修正しました。',
      ],
      zh: [
        '此列表：在“设置 → 更新”中，“新增内容”会显示最近版本的变化。',
        '修复通知上方显示内部标识而非“Desk Tracking”的问题。',
        '提醒会使用所选语言；此前“今天”等字样仍为德语。',
        '修复日历中较长的日程标题会撑宽所在列、挤压周六与周日的问题。',
      ],
    },
  },
  {
    version: '1.7.1',
    datum: '2026-07-30',
    punkte: {
      de: [
        'Datumsformat und „Jahr abkürzen" ließen sich nicht umstellen – behoben.',
        'Ist das Tastenkürzel belegt, steht es jetzt lesbar in der Meldung („Strg + Umschalt + T").',
        'Die Update-Prüfung nennt die Version, die sie auf GitHub gefunden hat.',
      ],
      en: [
        'Date format and “short year” could not be changed – fixed.',
        'If the keyboard shortcut is taken, the message now spells it out (“Ctrl + Shift + T”).',
        'The update check now names the version it found on GitHub.',
      ],
      fr: [
        'Le format de date et « année abrégée » ne changeaient pas – corrigé.',
        'Si le raccourci est occupé, le message l’écrit lisiblement (« Ctrl + Maj + T »).',
        'La recherche de mise à jour indique la version trouvée sur GitHub.',
      ],
      es: [
        'El formato de fecha y «año abreviado» no se podían cambiar – corregido.',
        'Si el atajo está ocupado, el mensaje ahora lo escribe legible («Ctrl + Mayús + T»).',
        'La búsqueda de actualizaciones indica la versión encontrada en GitHub.',
      ],
      ja: [
        '日付形式と「年を短縮」が切り替えられない問題を修正しました。',
        'ショートカットが使用中の場合、読みやすい表記で知らせます（「Ctrl + Shift + T」）。',
        '更新の確認で、GitHub 上に見つかったバージョンを表示します。',
      ],
      zh: [
        '修复日期格式与“缩写年份”无法切换的问题。',
        '快捷键被占用时，提示会以易读的形式显示（“Ctrl + Shift + T”）。',
        '检查更新时会显示在 GitHub 上找到的版本。',
      ],
    },
  },
  {
    version: '1.7.0',
    datum: '2026-07-30',
    punkte: {
      de: [
        'Neuer Name: aus „Stempeluhr" wird Desk Tracking.',
        'Oberfläche in sechs Sprachen – Deutsch, Englisch, Französisch, Spanisch, Japanisch, Chinesisch.',
        'Datumsformat frei wählbar, das Jahr lässt sich auf zwei Stellen kürzen.',
        'Kalender mit Terminen und Notizen, dazu Erinnerungen über Windows.',
        'Tastenkürzel und Mini-Bedienfeld zum Stempeln ohne offenes Fenster.',
        'Nachtschichten über Mitternacht sind ein Eintrag statt zwei.',
        'Helles und dunkles Design, Fensterleiste in den Farben der App.',
        'Deine Zeiten liegen jetzt in „Dokumente\\Desk Tracking" – sie werden beim ersten Start übernommen.',
      ],
      en: [
        'New name: “Stempeluhr” becomes Desk Tracking.',
        'Interface in six languages – German, English, French, Spanish, Japanese, Chinese.',
        'Freely selectable date format, with the option to shorten the year to two digits.',
        'Calendar with events and notes, plus reminders through Windows.',
        'Keyboard shortcut and mini panel for clocking without opening the window.',
        'Night shifts across midnight are one entry instead of two.',
        'Light and dark appearance, window bar in the app’s colours.',
        'Your times now live in “Documents\\Desk Tracking” – they are carried over on first start.',
      ],
      fr: [
        'Nouveau nom : « Stempeluhr » devient Desk Tracking.',
        'Interface en six langues – allemand, anglais, français, espagnol, japonais, chinois.',
        'Format de date au choix, avec possibilité d’abréger l’année à deux chiffres.',
        'Calendrier avec événements et notes, ainsi que des rappels via Windows.',
        'Raccourci clavier et mini-panneau pour pointer sans ouvrir la fenêtre.',
        'Les postes de nuit à cheval sur minuit forment une seule entrée.',
        'Apparence claire et sombre, barre de fenêtre aux couleurs de l’application.',
        'Vos temps se trouvent désormais dans « Documents\\Desk Tracking » – ils sont repris au premier démarrage.',
      ],
      es: [
        'Nuevo nombre: «Stempeluhr» pasa a ser Desk Tracking.',
        'Interfaz en seis idiomas – alemán, inglés, francés, español, japonés y chino.',
        'Formato de fecha a elección, con opción de abreviar el año a dos cifras.',
        'Calendario con eventos y notas, además de recordatorios mediante Windows.',
        'Atajo de teclado y panel reducido para fichar sin abrir la ventana.',
        'Los turnos de noche que cruzan medianoche son un solo registro.',
        'Apariencia clara y oscura, barra de ventana en los colores de la aplicación.',
        'Tus tiempos están ahora en «Documentos\\Desk Tracking» – se trasladan al primer inicio.',
      ],
      ja: [
        '名称を変更しました。「Stempeluhr」から Desk Tracking へ。',
        '6 言語に対応 – ドイツ語・英語・フランス語・スペイン語・日本語・中国語。',
        '日付形式を自由に選べ、年を 2 桁に短縮できます。',
        '予定とメモを扱えるカレンダー、Windows 通知によるリマインダー付き。',
        'ウィンドウを開かずに打刻できるショートカットとミニパネル。',
        '日付をまたぐ夜勤を 1 件の記録として扱います。',
        'ライトとダークの外観、ウィンドウ枠をアプリの配色に合わせました。',
        '記録の保存先が「ドキュメント\\Desk Tracking」になりました（初回起動時に引き継がれます）。',
      ],
      zh: [
        '更名：“Stempeluhr”改为 Desk Tracking。',
        '界面支持六种语言 – 德语、英语、法语、西班牙语、日语、中文。',
        '日期格式可自由选择，年份可缩写为两位。',
        '日历支持日程与备注，并通过 Windows 提醒。',
        '快捷键与迷你面板，无需打开窗口即可打卡。',
        '跨越午夜的夜班记为一条记录，而不是两条。',
        '浅色与深色外观，窗口栏采用应用配色。',
        '记录现保存在“文档\\Desk Tracking”中 – 首次启动时自动接管。',
      ],
    },
  },
  {
    version: '1.2.1',
    datum: '2026-07-29',
    punkte: {
      de: [
        'Der CSV-Export enthält alle Arbeitsblöcke eines Tages, nicht nur den ersten.',
        'Der PDF-Export funktioniert ohne installierten Drucker.',
      ],
      en: [
        'The CSV export contains every work block of a day, not just the first one.',
        'The PDF export works without an installed printer.',
      ],
      fr: [
        'L’export CSV contient tous les blocs de travail d’une journée, pas seulement le premier.',
        'L’export PDF fonctionne sans imprimante installée.',
      ],
      es: [
        'La exportación CSV incluye todos los bloques de trabajo del día, no solo el primero.',
        'La exportación PDF funciona sin impresora instalada.',
      ],
      ja: [
        'CSV 書き出しに、その日のすべての勤務ブロックが含まれます（最初の 1 件だけではありません）。',
        'プリンターが未設定でも PDF を書き出せます。',
      ],
      zh: [
        'CSV 导出包含当天所有工作时段，而不只是第一段。',
        '未安装打印机也能导出 PDF。',
      ],
    },
  },
  {
    version: '1.2.0',
    datum: '2026-07-29',
    punkte: {
      de: [
        'Automatische Updates: neue Versionen werden im Hintergrund geladen.',
        'Einzelne Projekte lassen sich mit allen Zeiten exportieren.',
        'Das Datum eines Eintrags ist nachträglich änderbar.',
      ],
      en: [
        'Automatic updates: new versions download in the background.',
        'Individual projects can be exported with all their times.',
        'The date of an entry can be changed afterwards.',
      ],
      fr: [
        'Mises à jour automatiques : les nouvelles versions se téléchargent en arrière-plan.',
        'Les projets peuvent être exportés individuellement avec tous leurs temps.',
        'La date d’une entrée peut être modifiée après coup.',
      ],
      es: [
        'Actualizaciones automáticas: las versiones nuevas se descargan en segundo plano.',
        'Los proyectos pueden exportarse por separado con todos sus tiempos.',
        'La fecha de un registro se puede cambiar después.',
      ],
      ja: [
        '自動更新：新しいバージョンをバックグラウンドで取得します。',
        'プロジェクトごとに、すべての時間を書き出せます。',
        '記録の日付を後から変更できます。',
      ],
      zh: [
        '自动更新：新版本在后台下载。',
        '可按项目单独导出其全部时间。',
        '记录的日期可以事后修改。',
      ],
    },
  },
];

if (typeof module !== 'undefined') {
  module.exports = { CHANGELOG };
}
