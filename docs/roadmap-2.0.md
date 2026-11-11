# Roadmap 2.0 (Community-Driven Roadmap)

Kegelkasse 2.0 wird gemeinsam mit den Mitgliedern und Vereinen gestaltet. Statt einer statischen Liste lebt die Roadmap jetzt interaktiv direkt in der App unter **`/roadmap`** (erreichbar über *Profil → Einstellungen → 🗺️ Roadmap 2.0*).

## Ziele von 2.0

- **Ein neues Erscheinungsbild**, das sich in der ganzen App gleich anfühlt und für Mitglieder jeden Alters gut lesbar bleibt.
- **Weniger Wege bis zur Aktion**: Strafe erfassen, Zu-/Absage geben, Kontostand sehen.
- **Mitglieder reden mit**: Rückmeldungen und Ideen kommen direkt aus der App via Community-Voting und landen live in der Roadmap.
- **Nichts geht kaputt**: Bestehende Vereine, Deep-Links, Push-Links und Offline-Warteschlange funktionieren nach dem Update weiter.

## Redesign: Umfang und Prinzipien

- **Schrittweise statt Big Bang.** Seite für Seite, jede Änderung ein eigener PR mit `feat:`/`refactor:`-Titel.
- **Hinter einem Schalter, wo es geht.** Neue Oberflächen laufen zuerst optional (Profil → Einstellungen oder Vereins-Schalter), das alte Layout bleibt Standard, bis das neue getestet ist. Erst danach wird der Schalter zum Standard und der alte Code entfernt.
- **Bestehendes Fundament nutzen.** Semantische Tokens (#70), Typo-Boden 12 px (#71), Motion-System (#72), geteilte `ui/`-Komponenten (#69). Keine Hex-Literale, keine neuen Einzelkomponenten.
- **Verträge bleiben stabil.** Routen, `?tab=`/`?item=`-Parameter, Push-URLs und API-Pfade ändern sich nicht ohne Übergang.
- **Jede Stufe mit Tests und Doku**, wie in CLAUDE.md.
- **Kiosk-Ansichten** (Tablet, Kamera, TV) bleiben dunkel und eigenständig.

Mögliche Reihenfolge: Start und Navigation, Kasse, Abend (Live), Termine und Verein, zuletzt Profil und Verwaltung.

## Interaktive Community-Roadmap in der App

Unter **`/roadmap`** können Mitglieder:
1. **Alle geplanten Features und Ideen einsehen:** Filterbar nach Phasen (*Geplant*, *In Arbeit*, *Ideenpool*, *Abgeschlossen*).
2. **Mit einem Klick abstimmen (Upvote):** Jedes Mitglied kann für seine Lieblingsfeatures voten.
3. **Eigene Ideen einreichen:** Über den Button *„Idee vorschlagen"* direkt aus der App mit Titel, Beschreibung und Kategorie. Vorschläge starten im Ideenpool und können sofort von der Community hochgevotet werden.
4. **Admin-Moderation:** Vereinsadmins und Superadmins können den Status von Vorschlägen pflegen (*In Arbeit*, *Geplant*, *Abgeschlossen*).

## Aktuelle Kern-Meilensteine

| Meilenstein | Phase | Notiz |
|---|---|---|
| In-App Community-Roadmap & Feedback | In Arbeit | Live unter `/roadmap` mit Upvoting & Vorschlägen |
| Desktop-Master-Detail | Geplant | Zweispaltige Ansicht für große Bildschirme (#75) |
| Onboarding, App-Shortcuts, Sprach-Schnellerfassung | Geplant | Geführter Einstieg und Schnellerfassung (#76) |
| Königs-Tippspiel | Ideenpool | Vor dem Eröffnungsspiel auf den König tippen |
| Geburtstage und Jubiläen | Ideenpool | Erinnerung, Banner, optionale Geburtstagsrunde |
| Admin-Audit-Log | Ideenpool | Revisionssicheres Änderungsprotokoll für Kassenwarte |
| Bank-Import (CSV/CAMT) | Ideenpool | Aufwendig, nach Community-Bedarf |
| Sticker-Wand | Abgeschlossen | Vereins-Sticker auf der Weltkarte (#563) |
| Zeugwart-Inventar | Abgeschlossen | Materialverwaltung mit Zu- und Abgängen (#548) |
| KI-Suche & Schnellsuche | Abgeschlossen | Natürlichsprachige Fragen und Volltextsuche (#546) |
