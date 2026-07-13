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

## Verliererstrafen

Wenn eine Vorlage eine **Standard-Verliererstrafe** hat, werden beim Beenden des Spiels automatisch Strafeneinträge für alle Nicht-Gewinner erstellt.

- Die Strafen sind im Strafenprotokoll mit dem **Spielkontext** gekennzeichnet
- Beim nachträglichen Bearbeiten des Spiels werden alte Strafen gelöscht und neu erstellt

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

## Spiel löschen

Tippe auf ein Spiel → **Löschen**

Gelöschte Spiele sind **weich gelöscht** (Soft-Delete) — die zugehörigen Verliererstrafen werden ebenfalls entfernt, aber alle Daten bleiben in der Datenbank erhalten.

## Gewinner-Typen

| Typ | Beschreibung |
|-----|-------------|
| `individual` | Ein einzelner Spieler gewinnt |
| `team` | Ein Team gewinnt |
| `either` | Entweder ein Spieler oder ein Team kann gewinnen |
