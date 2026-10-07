---
id: termine
title: Spieltermine & RSVP
sidebar_label: Spieltermine
---

# Spieltermine & RSVP

Der **Termine**-Bereich ermöglicht es, zukünftige Spielabende vorab zu planen und die Zu- oder Absagen der Mitglieder zu erfassen.

Navigiere zu **Termine** (📅) in der Navigation.

## Termin anlegen *(Admin)*

1. Tippe auf **+ Termin**
2. Fülle das Formular aus:

| Feld | Beschreibung |
|------|-------------|
| **Datum** | Datum des geplanten Abends |
| **Spiellokal** | Optional: Abweichendes Spiellokal |
| **Notiz** | Freitext-Hinweis (z. B. "Vereinsausflug") |

3. Tippe auf **Speichern**

## RSVP — Zu- oder Absage

Jedes Mitglied kann seine Teilnahme direkt am Termin angeben:

| Status | Bedeutung |
|--------|-----------|
| ✅ Zusage | Ich bin dabei |
| ❌ Absage | Ich kann nicht |
| *(keine Angabe)* | Noch unentschieden |

Tippe auf den Termin und wähle deinen Status über die Schaltflächen.

### RSVP für andere Mitglieder setzen *(Admin)*

Admins können den RSVP-Status auch für reguläre Mitglieder setzen — z. B. wenn jemand telefonisch Bescheid gegeben hat.

## Erinnerungen versenden *(Admin)*

Tippe bei einem Termin auf **Erinnerung senden**. Alle Mitglieder ohne RSVP-Status erhalten eine Push-Benachrichtigung.

:::info
Erinnerungen werden nur versendet, wenn Push-Benachrichtigungen konfiguriert sind und das jeweilige Mitglied Push abonniert hat.
:::

## Gäste eintragen *(Admin)*

Bekannte Gäste (aus der Stammspieler-Liste als Gast markiert) können dem Termin vorab zugeordnet werden:

1. Tippe auf **+ Gast**
2. Wähle den Gast aus der Liste oder gib einen Namen ein

## Abend aus Termin starten *(Admin)*

Wenn der Spieltag kommt, kann direkt aus dem Termin ein echter Abend gestartet werden:

1. Tippe auf **Abend starten**
2. Wähle, ob alle **Zusagen** automatisch als Spieler importiert werden sollen
3. Der neue Abend wird angelegt und ist sofort aktiv

:::tip
Mit **Zusagen importieren** entfällt das manuelle Hinzufügen der Spieler — alle, die zugesagt haben, sind automatisch dabei.
:::

## iCal-Kalender abonnieren

Alle geplanten Termine können als **iCal-Feed** in externe Kalender-Apps importiert werden (Apple Kalender, Google Calendar, Outlook).

1. Tippe oben rechts auf das Kalender-Symbol 📆
2. Kopiere den angezeigten Link
3. Füge ihn in deiner Kalender-App als neuen Kalender ein (Abonnieren / Subscribe)

:::info
Der Link enthält einen geheimen Token — er ist nur für dich bestimmt. Teile ihn nicht öffentlich. Über **„Im Kalender öffnen"** wird die App-Auswahl direkt gestartet.
:::

:::tip
Admins können die Standard-Uhrzeit für Termine in den Einstellungen festlegen. Termine ohne individuelle Uhrzeit verwenden diese als Startzeit im Kalender.
:::

## Öffentliche Termine (z. B. für die Vereins-Homepage) *(Admin)*

Unter **Verein → Einstellungen → Öffentliche Termine** kann ein Admin die kommenden Termine ohne Login abrufbar machen. Die Einstellung ist standardmäßig **aus**. Ist sie aktiv, zeigt die Karte die Adresse an:

```
https://<deine-instanz>/api/v1/public/clubs/<vereins-kürzel>/schedule
```

Die Antwort ist JSON mit den kommenden, nicht abgesagten Terminen (`?limit=` 1–100, Standard 20):

```json
{"club": "KC Beispiel", "evenings": [{
  "id": 42, "scheduled_at": "2026-11-14T19:00:00Z",
  "venue": "Altes Schalthaus", "note": "Weihnachtskegeln",
  "attendees": {"members": 9, "guests": 2, "total": 11}
}]}
```

`scheduled_at` ist der echte Zeitpunkt in UTC (eingegeben 20:00 Uhr deutscher Zeit → `19:00:00Z` im Winter). `attendees` zählt wie die App: alle aktiven Mitglieder, die nicht abgesagt haben, plus geplante Gäste.

:::info
Öffentlich sind **Datum, Uhrzeit, Ort, Notiz und die Anzahl der Anmeldungen** — Namen und einzelne Zu-/Absagen bleiben privat. Notizen eines Termins sind damit für alle sichtbar. Solange die Einstellung aus ist, antwortet die Adresse genauso wie für einen unbekannten Verein (404). Die Antwort darf von jeder Website direkt im Browser abgerufen werden (CORS) und wird 5 Minuten gecacht.
:::

## Termin bearbeiten & löschen *(Admin)*

Tippe auf das Bearbeiten-Symbol neben einem Termin, um Datum, Lokal oder Notiz zu ändern, oder lösche den Termin endgültig.
