# VLW-Daten

Der Importdienst benötigt Node.js 22.5 oder neuer. Der Admin importiert die Männerligen von Oberliga bis Bezirksklasse lokal. Die Read-Ansicht lädt den zuletzt veröffentlichten Snapshot von GitHub Pages.

Read-Nutzer melden sich auf der Website an und öffnen **VLW**. Die Suche lädt den zuletzt veröffentlichten Snapshot direkt von GitHub Pages; ein lokaler Dienst oder Zugriffscode ist dafür nicht nötig.

Für einen neuen Import:

1. Der Admin startet im Projektordner `npm run vlw:local`.
2. Das Terminal bleibt geöffnet; den dort ausgegebenen Zugriffscode kopieren.
3. Als Admin auf der Website **VLW** öffnen, den Code eingeben und **Verbinden** wählen.
4. **VLW-Daten aktualisieren** starten. Importiert werden Männerligen von Oberliga bis Bezirksklasse (aktuell 21 Ligen mit 181 Mannschaften).
5. Zum Online-Veröffentlichen `npm run vlw:publish` ausführen, danach `public/vlw.sqlite` und `public/vlw-directory.json` committen und pushen.

Mannschaften und Spieler lassen sich anschließend über den gleichen VLW-Bereich suchen; der direkte Mannschaftslink öffnet die VLW-Seite.

Die Arbeitsdatenbank liegt unter `~/Library/Application Support/TSB Herren 2 Stats/vlw.sqlite`. Ein Import ersetzt sie erst, wenn alle ausgewählten Ligen und Teamseiten erfolgreich gelesen wurden. Namen, die VLW nicht veröffentlicht, werden nicht importiert.

`npm run build` regeneriert den JSON-Suchindex aus der Repository-SQLite-Datei. GitHub Pages veröffentlicht beim Build beide statischen Dateien. Repository, SQLite-Datei und Suchindex sind öffentlich und für jeden abrufbar.

Die GitHub-Pages-Dateien sind öffentliche statische Assets; der Admin-/Read-Login blendet nur die jeweilige Oberfläche ein und schützt diese Dateien nicht. Der lokale Importdienst bindet ausschließlich an `127.0.0.1`, verlangt einen zufälligen Zugriffscode und akzeptiert Browseranfragen nur von der Website und der lokalen Entwicklungswebsite.