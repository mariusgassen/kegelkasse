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

Während der Berechnung zeigt der Knopf einen Ladezustand; danach meldet ein **Hinweis-Toast**,
wie viele Abwesende eingetragen wurden und wie hoch die Ø-Strafe ist — bzw. dass **niemand
gefehlt hat** und deshalb nichts eingetragen wurde. Das gilt auch beim *Neuberechnen*, wo sich
im Protokoll selbst oft nichts sichtbar ändert. Die Mitglieder- und Gästekonten werden
anschließend automatisch neu geladen.

## Strafe bearbeiten

1. Tippe auf das **⋮**-Menü der Strafe → **Bearbeiten**
2. Wähle den Reiter **Schnell** (Strafentyp aus der Liste) oder **Individuell** (eigenes **Icon** und **Name** frei editierbar — z. B. für Freitext-Strafen, die keinem Strafentyp entsprechen)
3. Ändere **Betrag**, **Modus** oder **Spieler**
4. Admins können zusätzlich das **Datum** ändern — die Uhrzeit wird in lokaler Zeit eingegeben und angezeigt
5. Speichern

## Strafe löschen

Tippe auf das **⋮**-Menü der Strafe → **Löschen** (rot) und bestätige im Sicherheits-Dialog.

Strafen werden **weich gelöscht** (Soft-Delete) — der Eintrag bleibt in der Datenbank, wird aber aus der Ansicht entfernt. Dies ermöglicht ein Rückgängigmachen.

## Audio-Ansagen 🔊

Jedem Strafentyp kann in der Vereinsverwaltung optional ein **Sound** zugeordnet werden — beim
Eintragen dieser Strafe wird der Ton auf dem erfassenden Gerät abgespielt. Zur Auswahl stehen
13 Presets:

| Sound | | Sound | |
|---|---|---|---|
| ⚽ Schiedsrichterpfiff | Der klassische Pfiff samt rasselnder Erbse | 😩 Gestöhne | Ein Raum, der kollektiv „ohhh" macht |
| 🚨 Buzzer | Falsche-Antwort-Summen aus der Quizshow | 👏 Applaus | Ironischer Beifall |
| 📣 Drucklufthorn | Stadion-Tröte | 🥁 Trommelschlag | Kurzer, trockener Schlag |
| 🔔 Glocke | Angeschlagenes Metall mit langem Nachklang | 💿 Plattenkratzer | Der „ups"-Moment |
| 💰 Kasse | „Ka-ching" samt Schubladenschlag | 🪀 Boing | Cartoon-Sprungfeder |
| 🪙 Münze fällt | Eine Münze, die austrudelt | 🔫 Laser | Kurzer Zap |
| 📉 Pleiten-Fanfare | „Wah-wah-wah-waaah" | | |

- Sound-Auswahl beim Anlegen/Bearbeiten eines Strafentyps, mit Anhör-Vorschau je Option
- Club-weit ein-/ausschaltbar unter **Verein → Einstellungen → Audio-Ansagen** (Standard: an)
- Zusätzlich vom persönlichen **🎉 Feier-Effekte**-Schalter im Profil abhängig
- Es gibt keinen separaten, fest verdrahteten 0-Kegel-Ton mehr — wer einen Ton für einen Nuller
  möchte, weist den 🚨-Buzzer dem entsprechenden Strafentyp zu; der spielt dann automatisch beim
  Eintragen dieser Strafe (auch die 0-Kegel-Situation ist ja immer schon konfigurationsgesteuert)
- Alle Töne werden live per Web Audio synthetisiert (keine Audio-Dateien, kein Download) und laufen
  über einen gemeinsamen Bus mit Kompressor und kurzem Hall, damit sie bei **einer** Lautstärke-
  Einstellung des Tablets alle brauchbar laut sind

## Strafenprotokoll filtern

Im Strafenprotokoll können Einträge nach **Spieler** und/oder **Spiel** gefiltert werden:

- Tippe auf einen **Spieler-Chip** bzw. **Spiel-Chip** in der Filterliste
- Nur passende Strafen werden angezeigt
- Die Zahl in der Überschrift „⚠️ Strafen (N)" zeigt die Anzahl der **gefilterten** Einträge
- Sobald ein Filter aktiv ist, erscheint zusätzlich eine **Summen-Vorschau** („Summe (Filter): …") mit dem Gesamtbetrag der gerade sichtbaren Strafen (inkl. Gäste-Deckel)
