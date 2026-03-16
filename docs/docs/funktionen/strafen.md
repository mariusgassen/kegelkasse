---
id: strafen
title: Strafen
sidebar_label: Strafen
---

# Strafen

Das Strafensystem erfasst alle Vergehen während eines Kegelabends. Strafen können manuell, per Team oder automatisch durch Spielergebnisse entstehen.

## Strafe vergeben

### Einzelstrafe

1. Im Abend: Tippe auf **Strafen** → **Strafe hinzufügen**
2. Wähle den **Strafentyp** aus der Liste
3. Wähle einen oder **mehrere Spieler**
4. Passe optional den **Betrag** an
5. Tippe auf **Speichern**

### Teamstrafe

1. Wähle beim Hinzufügen **Team** statt einzelner Spieler
2. Wähle das Team
3. Die Strafe wird automatisch für **jeden Spieler des Teams** eingetragen

## Drehtrommel 🎡

Die Drehtrommel wählt zufällig einen Strafentyp aus:

1. Tippe auf das **Drehtrommel-Symbol**
2. Die Trommel dreht sich und landet auf einem Typ
3. Bestätige die Auswahl oder drehe erneut

## Strafen-Modi

| Modus | Beschreibung |
|-------|-------------|
| `euro` | Geldbetrag in Euro |
| `count` | Zählwert (z. B. Anzahl Runden) |

Der Betrag und Modus sind nach der Erfassung unabhängig voneinander editierbar.

:::info Retroaktive Sicherheit
Im `count`-Modus wird der Standardbetrag beim Erfassen eingefroren (`unit_amount`). Spätere Änderungen am Strafentyp verändern bestehende Einträge nicht.
:::

## Automatische Verliererstrafen

Wenn ein Spiel beendet wird und die Spielvorlage eine Verliererstrafe definiert, werden automatisch Strafeneinträge für alle Nicht-Gewinner angelegt.

Diese Strafen:
- sind im Protokoll mit dem **Spielnamen** als Kontext gekennzeichnet
- werden beim erneuten Bearbeiten des Spiels neu berechnet

## Abwesenheitsstrafen

Falls ein Stammspieler fehlt, können Abwesenheitsstrafen berechnet werden:

1. Tippe auf **Strafen** → **Abwesenheitsstrafen berechnen**
2. Wähle die fehlenden Stammspieler
3. Die konfigurierten Abwesenheitsstrafen werden eingetragen

## Strafe bearbeiten

1. Tippe auf eine Strafe in der Liste
2. Ändere **Betrag** oder **Modus**
3. Speichern

## Strafe löschen

Tippe auf eine Strafe → **Löschen**

Strafen werden **weich gelöscht** (Soft-Delete) — der Eintrag bleibt in der Datenbank, wird aber aus der Ansicht entfernt. Dies ermöglicht ein Rückgängigmachen.

## Strafenprotokoll filtern

Im Strafenprotokoll können Einträge nach **Spieler** gefiltert werden:

- Tippe auf einen **Spieler-Chip** in der Filterliste
- Nur Strafen des ausgewählten Spielers werden angezeigt
