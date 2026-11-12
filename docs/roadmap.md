# Community-Driven Roadmap

Kegelkasse wird gemeinsam mit den Mitgliedern und Vereinen gestaltet. Statt einer statischen Liste lebt die Roadmap jetzt interaktiv direkt in der App unter **`/roadmap`** (erreichbar über *Profil → Einstellungen → 🗺️ Roadmap*).

## Interaktive Community-Roadmap in der App

Unter **`/roadmap`** können Mitglieder und Admins:
1. **Alle Features und Ideen einsehen:** Filterbar nach Status (*Geplant*, *In Arbeit*, *Ideenpool*, *Abgeschlossen*, *Duplikat*) sowie nach Kategorien und Tags.
2. **Mit einem Klick abstimmen (Upvote):** Jedes Mitglied kann für seine Lieblingsfeatures voten.
3. **Kommentieren & Diskutieren:** Direkt neben dem Upvote-Button können Mitglieder und Admins Ideen diskutieren, Fragen stellen und Feedback austauschen (mit Bildern, Antworten und Reaktionen).
4. **Eigene Ideen einreichen:** Über den Button *„Idee vorschlagen"* direkt aus der App mit Titel, Beschreibung, Kategorie und Tags. Vorschläge starten im Ideenpool und können sofort von der Community hochgevotet werden.
5. **Admin- und Produktmanager-Moderation:** 
   - Status verschieben (*In Arbeit*, *Geplant*, *Abgeschlossen*, *Duplikat*, *Verworfen*)
   - Ideen mit Tags versehen und Kategorien verwalten
   - Wichtige Meilensteine oben anpinnen (`is_pinned`)
   - Duplikate verknüpfen (`duplicate_of_id`) mit Verweis auf das Hauptfeature
   - Entwicklungs- und Admin-Notizen für die Community hinterlegen
6. **Rollenmanagement:** Superadmins können direkt über die Roadmap oder die Vereinsverwaltung neue Produktmanager (`product_manager`) oder weitere Superadmins ernennen.

## Regeln

- **Sichtbarkeit:** Offizielle Einträge sehen alle, Ideen eines Vereins nur dessen Mitglieder. Produktmanager und Superadmins sehen alle Vereine.
- **Moderation:** Status, Pin, Duplikat, Notizen und Zielversion ändern Produktmanager, Superadmins und Admins des eigenen Vereins (bei dessen Ideen). Offizielle Einträge nur Produktmanager und Superadmins.
- **Eigene Ideen** bearbeitet der Einreicher, solange sie im Ideenpool stehen. Danach nur noch die Moderation.
- **Abstimmen** geht nicht bei verworfenen Ideen und Duplikaten (die Stimme zurücknehmen schon). Stimmen von Duplikaten zählen für das Hauptfeature, jede Person nur einmal.
- **Grenzen:** Titel 200, Beschreibung 4000 Zeichen, bis zu 8 Tags (je 30 Zeichen), höchstens 10 neue Ideen pro Stunde und Person.
- **Rückmeldung:** Ändert sich Status oder Notiz einer Idee, bekommt der Einreicher eine Benachrichtigung (Profil → Einstellungen → „Meine Roadmap-Ideen").
- Beim Löschen einer Idee verschwinden auch ihre Kommentare.

## Aktuelle Kern-Meilensteine

| Meilenstein | Phase | Notiz |
|---|---|---|
| In-App Community-Roadmap & Feedback | In Arbeit | Live unter `/roadmap` mit Upvoting, Kommentaren & Tagging |
| Desktop-Master-Detail | Geplant | Zweispaltige Ansicht für große Bildschirme (#75) |
| Onboarding, App-Shortcuts, Sprach-Schnellerfassung | Geplant | Geführter Einstieg und Schnellerfassung (#76) |
| Königs-Tippspiel | Ideenpool | Vor dem Eröffnungsspiel auf den König tippen |
| Geburtstage und Jubiläen | Ideenpool | Erinnerung, Banner, optionale Geburtstagsrunde |
| Admin-Audit-Log | Ideenpool | Revisionssicheres Änderungsprotokoll für Kassenwarte |
| Bank-Import (CSV/CAMT) | Ideenpool | Kontoauszüge einlesen |
| Sticker-Wand | Abgeschlossen | Vereins-Sticker auf der Weltkarte (#563) |
| Zeugwart-Inventar | Abgeschlossen | Materialverwaltung mit Zu- und Abgängen (#548) |
| KI-Suche & Schnellsuche | Abgeschlossen | Natürlichsprachige Fragen und Volltextsuche (#546) |
