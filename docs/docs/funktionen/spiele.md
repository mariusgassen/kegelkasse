---
id: spiele
title: Spiele
sidebar_label: Spiele
---

# Spiele

Spiele sind das Herzstück eines Kegelabends. Jedes Spiel hat einen Gewinner, optional Punktzahlen und kann automatisch Verliererstrafen vergeben.

## Spiel anlegen

1. Tippe auf **Spiele** im Abend
2. Tippe auf **Spiel hinzufügen**
3. Wähle eine **Vorlage** oder erstelle ein freies Spiel
4. Trage den **Gewinner** ein (Spieler oder Team)
5. Optional: **Punktzahlen** je Spieler/Team eintragen
6. Tippe auf **Speichern**

## Spielstatus

Jedes Spiel durchläuft drei Zustände:

```
Offen  →  Läuft  →  Beendet
```

| Status | Beschreibung |
|--------|-------------|
| **Offen** | Spiel angelegt, noch nicht gestartet |
| **Läuft** | Startzeit wird aufgezeichnet |
| **Beendet** | Ergebnis eingetragen, Verliererstrafen vergeben |

:::info Spielzeit
Die Dauer eines Spiels wird automatisch aus `started_at` und `finished_at` berechnet.
:::

## Eröffnungsspiel & König

Das **Eröffnungsspiel** (erkennbar am Kronensymbol 👑) bestimmt den **König** des Abends:

- Nur ein Spiel pro Abend kann als Eröffnungsspiel markiert sein
- Der Gewinner des Eröffnungsspiels erhält die Königsauszeichnung
- Die Königsmarkierung ist in der Spielerliste sichtbar

## 🎉 Feier-Effekte

Zwei Momente lösen einen kurzen Konfetti-Effekt inklusive Sound aus: die **Königskrönung** (Eröffnungsspiel mit Spieler-Sieger) und ein Wurf mit **Alle Neune** (alle neun Kegel auf einen Wurf) — egal ob in der normalen Spiele-Ansicht, der Tablet-Schnellerfassung oder am Kamera-Kiosk erfasst.

- Kann in **Profil → Einstellungen → 🎉 Feier-Effekte** komplett deaktiviert werden
- Respektiert die Systemeinstellung „Bewegung reduzieren" (`prefers-reduced-motion`) — dann bleibt nur der Ton, ohne Konfetti-Animation

## Verliererstrafen

Wenn eine Vorlage eine **Standard-Verliererstrafe** hat, werden beim Beenden des Spiels automatisch Strafeneinträge für alle Nicht-Gewinner erstellt.

- Die Strafen sind im Strafenprotokoll mit dem **Spielkontext** gekennzeichnet
- Beim nachträglichen Bearbeiten des Spiels werden alte Strafen gelöscht und neu erstellt — der Zeitstempel der neuen Strafen bleibt dabei der **Spielende-Zeitpunkt** (`finished_at`), nicht der Zeitpunkt der Bearbeitung
- Sobald beim Beenden ein Gewinner ausgewählt ist, zeigt eine **Vorschau** direkt im Beenden-Dialog, welche Strafe jeder Verlierer bekommt — unabhängig davon, ob die Vorlage eine punktebasierte Zusatzstrafe hat oder nur eine feste Verliererstrafe. Verfügbar sowohl in der normalen Spiele-Ansicht als auch in der Tablet-Schnellerfassung.

## Spiel bearbeiten

Tippe auf ein beendetes Spiel → **Bearbeiten**:

- Gewinner ändern
- Punktzahlen anpassen
- Verliererstrafen werden automatisch neu berechnet

## Start-/Endzeit nachträglich korrigieren

Falls beim Kegeln vergessen wurde, ein Spiel zu starten oder zu beenden, können Admins die Zeiten nachträglich eintragen oder korrigieren:

1. Tippe bei einem **laufenden** oder **beendeten** Spiel auf 🕐
2. Trage **Startzeit** (und bei beendeten Spielen zusätzlich **Endzeit**) ein
3. Tippe auf **Speichern**

:::info Nur für Admins
Diese Funktion ist Vereinsadmins vorbehalten, da sie den offiziellen Zeitverlauf des Abends nachträglich verändert. Die Endzeit darf nicht vor der Startzeit liegen.
:::

Wird bei einem bereits beendeten Spiel nur die **Endzeit korrigiert** (ohne die Strafhöhe zu ändern), verschieben sich die bereits erstellten Verliererstrafen automatisch mit auf den neuen Zeitstempel — die Einträge im Strafenprotokoll bleiben dieselben, nur ihre Uhrzeit wird angepasst.

## Spiel löschen

Tippe auf ein Spiel → **Löschen**

Gelöschte Spiele sind **weich gelöscht** (Soft-Delete) — die zugehörigen Verliererstrafen werden ebenfalls entfernt, aber alle Daten bleiben in der Datenbank erhalten.

## Gewinner-Typen

| Typ | Beschreibung |
|-----|-------------|
| `individual` | Ein einzelner Spieler gewinnt |
| `team` | Ein Team gewinnt |
| `either` | Entweder ein Spieler oder ein Team kann gewinnen |

## Kamera-Wurf-Erkennung (optional pro Verein)

Die kamerabasierte Live-Wurf-Erfassung (Kegel, Punkte, „Alle Neune") ist eine **optionale**
Funktion. Vereine, deren Kegelbahn keine Wurfdaten liefert, können sie unter
**Verein → Einstellungen → Wurf-Erfassung** ausschalten (Standard: aktiviert).

Ist die Erfassung deaktiviert, werden alle wurfbezogenen Ansichten und Statistiken ausgeblendet:
der Kamera-Knopf (📷) im Spiele-Tab, die Live-Wurf-Leiste in der Tablet-Schnellerfassung, die
Wurf-Anzeige in der Live-Ansicht, die Wurf-Performance-Karten (Profil, Jahresranking), die
Wurf-Kennzahl auf dem Start-Dashboard, die Wurf-Statistiken in Abend-/Jahres-Auswertungen sowie
die „Schwächster Wurf-Schnitt"-Auszeichnung der Halle der Schande. Strafen, Getränke, Spiele und
Sieger-Auswahl bleiben unverändert nutzbar.
