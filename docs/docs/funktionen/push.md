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
