# Roadmap 2.0

Entwurf zur Abstimmung. Dieses Dokument sammelt, was Kegelkasse 2.0 werden soll. Es ändert noch keinen App-Code.

## Ziele von 2.0

- **Ein neues Erscheinungsbild**, das sich in der ganzen App gleich anfühlt und für Mitglieder jeden Alters gut lesbar bleibt.
- **Weniger Wege bis zur Aktion**: Strafe erfassen, Zu-/Absage geben, Kontostand sehen.
- **Mitglieder reden mit**: Rückmeldungen und Ideen kommen direkt aus der App und landen in dieser Roadmap.
- **Nichts geht kaputt**: Bestehende Vereine, Deep-Links, Push-Links und Offline-Warteschlange funktionieren nach dem Update weiter.

## Redesign: Umfang und Prinzipien

- **Schrittweise statt Big Bang.** Seite für Seite, jede Änderung ein eigener PR mit `feat:`/`refactor:`-Titel.
- **Hinter einem Schalter, wo es geht.** Neue Oberflächen laufen zuerst optional (Profil → Einstellungen oder Vereins-Schalter), das alte Layout bleibt Standard, bis das neue getestet ist. Erst danach wird der Schalter zum Standard und der alte Code entfernt.
- **Bestehendes Fundament nutzen.** Semantische Tokens (#70), Typo-Boden 12 px (#71), Motion-System (#72), geteilte `ui/`-Komponenten (#69). Keine Hex-Literale, keine neuen Einzelkomponenten.
- **Verträge bleiben stabil.** Routen, `?tab=`/`?item=`-Parameter, Push-URLs und API-Pfade ändern sich nicht ohne Übergang.
- **Jede Stufe mit Tests und Doku**, wie in CLAUDE.md.
- **Kiosk-Ansichten** (Tablet, Kamera, TV) bleiben dunkel und eigenständig.

Mögliche Reihenfolge: Start und Navigation, Kasse, Abend (Live), Termine und Verein, zuletzt Profil und Verwaltung. Reihenfolge ist offen.

## Ideen und Stand

| Idee | Stand | Notiz |
|---|---|---|
| In-App-Feedback und Ideen | geplant | Kleiner erster PR nach Review dieser Roadmap, siehe unten |
| KI-Suche (Fragen zu Verein und App) | umgesetzt | #103 |
| Push bei neuen Versionen | umgesetzt | #101, vom Server beim Start gesendet |
| Vereinslogo als App-Icon | umgesetzt | #104, dynamisches Icon pro Verein |
| Kassenprüfung | umgesetzt | #97 |
| Kegelfahrt-Ausgaben | umgesetzt | #98 |
| Was ist neu in der App | umgesetzt | #100 |
| Desktop-Master-Detail | offen | #75 |
| Onboarding, App-Shortcuts, Sprach-Schnellerfassung | offen | #76 |
| Admin-Audit-Log | Idee | Wer hat welche Buchung, Strafe oder Einstellung geändert; Teile über `updated_by`/`deleted_by` vorhanden |
| Königs-Tippspiel | Idee | Vor dem Eröffnungsspiel auf den König tippen, Punkte in Wrapped und Auszeichnungen |
| Geburtstage und Jubiläen | Idee | Erinnerung, Banner, optionale Geburtstagsrunde |
| Bank-Import (CSV/CAMT) | Idee | Aufwendig, nur falls der Bedarf klar ist |
| Sticker-Wand | Idee, noch nicht beschrieben | Marius ergänzt die Details |
| Zeugwart-Inventar | Idee, noch nicht beschrieben | Marius ergänzt die Details |
| Beitragsautomatik, Abendkosten teilen | verworfen | Kein Anwendungsfall im Verein |
| Telegram-Gruppenposting | verworfen | Verein nutzt WhatsApp |

## Feedback aus der App

Idee: Mitglieder können in der App (Profil → Einstellungen) eine Rückmeldung oder Idee senden, optional mit Kategorie (Fehler, Wunsch, Lob). Admins sehen die Liste im Verein-Bereich, markieren den Stand, und übernehmen Ideen in diese Roadmap. Datenschutz: Absender sichtbar nur für Admins, keine Daten außer Text und Kategorie.

Dazu kommt erst ein eigener PR (`feat:`), wenn diese Roadmap abgenommen ist.

## Offen: Rückmeldungen der Mitglieder

Hier sammeln wir Rückmeldungen, bis es die In-App-Funktion gibt.

| Von | Rückmeldung | Stand |
|---|---|---|
| | | |
