---
id: ki
title: KI-Funktionen (Claude)
sidebar_label: KI-Funktionen ✨
---

# KI-Funktionen mit Claude

Die Kegelkasse kann optional die Claude-API von Anthropic nutzen. Alle KI-Knöpfe (✨) erscheinen
**nur**, wenn der Server einen API-Schlüssel hat. Ohne Schlüssel bleibt alles wie gewohnt.

## Einrichtung (Admin/Betreiber)

Den Schlüssel als Umgebungsvariable setzen und den Container neu starten:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Optional wählt `ANTHROPIC_MODEL` ein anderes Modell (Standard: `claude-opus-5-5`). Pro Verein sind
höchstens 30 KI-Anfragen pro Stunde möglich, damit die Kosten im Rahmen bleiben.

## ✨ KI-Rückblick

- **Abend:** In der Historie (📅 Termine → aufgeklappter Abend) schreibt „KI-Rückblick“ einen
  lustigen Stammtisch-Bericht über König, Spielsieger, Strafen, Getränke und Highlights.
- **Saison:** Im Statistik-Tab „Jahr“ fasst „KI-Saisonrückblick“ das ganze Jahr zusammen und vergibt
  augenzwinkernde Titel.

Der Text erscheint in einem Fenster, in dem du ihn anpassen, kopieren oder neu schreiben lassen
kannst. Mitglieder des Vergnügungsausschusses und Admins können ihn direkt als **Neuigkeit** posten.
Nichts wird ohne deinen Klick veröffentlicht.

## ✨ Vorschläge

- **Strafenarten** (Verein → Strafen): Claude schaut, welche Strafen ihr oft von Hand eintragt, und
  schlägt fehlende Katalog-Einträge mit Betrag vor. Ein Tipp übernimmt den Vorschlag ins Formular,
  gespeichert wird erst mit „Hinzufügen“.
- **Kegelname** (Mitglied bearbeiten): drei Spitznamen-Ideen aus Statistik und Vorname. Ein Tipp
  trägt den Namen ins Feld ein.

## 🔍 Buchungs-Check (Kassenprüfung)

Im Tab **🔍 Prüfung** der Kasse (für Admins und Kassenprüfer) prüft der Buchungs-Check einen
Zeitraum vor der Kassenprüfung auf. Im Detail einer Prüfung ist der Zeitraum schon vorbelegt:

- mögliche **Doppelbuchungen** (gleiche Person, gleicher Betrag, höchstens 3 Tage auseinander;
  bewusst verknüpfte Buchungspaare zählen nicht),
- **ungewöhnliche Beträge** (mindestens 4× der übliche Betrag und mindestens 50 €),
- **Auszahlungen ohne Notiz**, Buchungen mit **Datum in der Zukunft** und **nachträglich bearbeitete**
  Buchungen.

Diese Regeln laufen auch **ohne** KI. Mit Schlüssel ergänzt Claude zu jedem Treffer eine kurze
Einschätzung, was die Prüfer nachfragen sollten, und eine Zusammenfassung.

## Datenschutz

An Claude geht nur, was die jeweilige Funktion braucht:

- Mitglieder erscheinen mit **Kegelname**, sonst nur mit **Vorname**; Gäste nur mit Vorname.
- Keine E-Mail-Adressen, keine Kontostände.
- Beim Buchungs-Check gehen **nur die auffälligen Buchungen** raus (Kegelname/Beschreibung, Betrag,
  Datum, Notiz) plus die Mediane des Zeitraums, nicht das ganze Kassenbuch.
