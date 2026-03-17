---
id: push
title: Push-Benachrichtigungen
sidebar_label: Push-Benachrichtigungen
---

# Push-Benachrichtigungen

Kegelkasse kann **Web-Push-Benachrichtigungen** senden — auch wenn die App nicht geöffnet ist. So verpasst kein Mitglied eine Strafe oder eine wichtige Vereinsnachricht.

## Benachrichtigungen aktivieren

1. Öffne das **Profil** (Avatar oben rechts)
2. Scrolle zum Abschnitt **Push-Benachrichtigungen**
3. Tippe auf **Aktivieren**
4. Bestätige die Browser-Anfrage zur Erlaubnis

:::info
Push-Benachrichtigungen sind gerätegebunden. Wer auf mehreren Geräten empfangen möchte, muss sie auf jedem Gerät separat aktivieren.
:::

## Welche Ereignisse lösen eine Benachrichtigung aus?

| Ereignis | Empfänger |
|----------|-----------|
| Strafe eingetragen | Betroffenes Mitglied |
| Abwesenheitsstrafe | Betroffenes Mitglied |
| Spielstrafe (Verlierer) | Betroffene Mitspieler |
| Abend geschlossen | Alle Vereinsmitglieder |
| Spieltermin-Erinnerung | Mitglieder ohne RSVP |
| Zahlung bestätigt | Betroffenes Mitglied |
| Zahlung abgelehnt | Betroffenes Mitglied |
| **Schulden-Erinnerung** (automatisch) | Mitglieder mit offenem Betrag |
| **Kegeln in X Tagen** (automatisch) | Alle aktiven Mitglieder |
| **RSVP-Erinnerung** (automatisch) | Mitglieder ohne Rückmeldung |
| **Schulden am Kegeltag** (automatisch) | Mitglieder mit offenem Betrag |
| **Ausstehende Zahlungsanfragen** (automatisch) | Admins |
| **Broadcast** | Alle Mitglieder (Admin-Versand) |

## Einstellungen im Profil

Im Profil können Benachrichtigungen feingranular gesteuert werden:

- **Strafen, Abend-Events, Kegeltermine, Zahlungen, Spielergebnisse, Neue Mitglieder** — einzeln an/aus
- **Schulden-Erinnerungen** — automatische Schulden-Benachrichtigungen an/aus
- **Termin-Erinnerungen** — automatische Terminbenachrichtigungen an/aus; dazu individuell einstellbar: wie viele Tage vorher erinnert werden soll
- **Zahlungsanfragen (Admin)** — Nudges für ausstehende Anfragen an/aus (nur für Admins sichtbar)

## Automatische Erinnerungen *(Admin)*

Admins können im **Einstellungen-Tab** automatische Erinnerungen konfigurieren. Jeder Typ kann einzeln aktiviert werden:

| Typ | Beschreibung | Konfiguration |
|-----|-------------|---------------|
| Wöchentliche Schulden-Erinnerung | Push an Mitglieder mit offenem Betrag | Wochentag, Mindestbetrag (€) |
| Kegeln in X Tagen | Push N Tage vor dem nächsten Termin | Standard-Tage (jeder Nutzer kann eigene Tage im Profil setzen) |
| RSVP-Erinnerung | Push an Mitglieder ohne Rückmeldung | Tage vor dem Termin |
| Schulden am Kegeltag | Push an Schuldner am Tag des Kegelns | — |
| Ausstehende Zahlungsanfragen | Push an Admins bei langer Bearbeitungszeit | Tage bis Erinnerung |

:::info
Erinnerungen laufen täglich um 09:00 Uhr (Server-Zeit) automatisch. Sie müssen nicht manuell ausgelöst werden.
:::

Über den Button **Push senden** (unterhalb der Erinnerungseinstellungen) können Admins jederzeit eine freie Push-Nachricht an alle Mitglieder senden.

## Benachrichtigungen deaktivieren

1. Öffne das **Profil**
2. Tippe auf **Deaktivieren** im Push-Abschnitt

## Test-Benachrichtigung *(Admin)*

Wenn Push aktiviert ist, erscheint im Profil ein **Test**-Button. Damit kann überprüft werden, ob Benachrichtigungen korrekt ankommen.

## Konfiguration *(Serveradmin)*

Push-Benachrichtigungen erfordern VAPID-Schlüssel als Umgebungsvariablen:

```
VAPID_PRIVATE_KEY=...
VAPID_PUBLIC_KEY=...
VAPID_CLAIM_EMAIL=admin@example.com
```

Fehlen diese Variablen, werden alle Push-Aktionen stillschweigend übersprungen — die App funktioniert weiterhin normal.
