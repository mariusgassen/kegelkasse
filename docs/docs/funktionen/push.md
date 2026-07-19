---
id: push
title: Push-Benachrichtigungen
sidebar_label: Push-Benachrichtigungen
---

# Push-Benachrichtigungen

Kegelkasse kann Benachrichtigungen **als Web-Push** (auch bei geschlossener App) **oder per E-Mail** senden. So verpasst kein Mitglied eine Strafe oder eine wichtige Vereinsnachricht.

## Zustellweg pro Benachrichtigung: Aus / Push / E-Mail

Jede Benachrichtigungsart lässt sich im Profil (**⚙️ Einstellungen → Benachrichtigungseinstellungen**) einzeln auf einen von drei Zustellwegen stellen:

- **🔕 Aus** — keine Zustellung (erscheint auch nicht in der Glocke)
- **🔔 Push** — Web-Push auf die abonnierten Geräte
- **✉️ E-Mail** — Versand an die hinterlegte E-Mail-Adresse (nur wählbar, wenn der Verein einen E-Mail-Server konfiguriert hat)

Unabhängig vom gewählten Weg wird jede Benachrichtigung zusätzlich in der **In-App-Glocke** protokolliert (außer bei „Aus"). Dieselbe Wahl gilt auch für die automatischen Erinnerungen (Schulden, Termine, RSVP …).

## Benachrichtigungen aktivieren

1. Öffne das **Profil** (Avatar oben rechts) → Tab **⚙️ Einstellungen**
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
| Kommentar/Antwort auf Ankündigung, Kegelfahrt, Highlight | Autor des Beitrags bzw. des übergeordneten Kommentars |
| Reaktion auf Kommentar, Ankündigung, Kegelfahrt, Highlight | Autor des Beitrags/Kommentars |
| **Schulden-Erinnerung** (automatisch) | Mitglieder mit offenem Betrag |
| **Kegeln in X Tagen** (automatisch) | Alle aktiven Mitglieder |
| **RSVP-Erinnerung** (automatisch) | Mitglieder ohne Rückmeldung |
| **Schulden am Kegeltag** (automatisch) | Mitglieder mit offenem Betrag |
| **Ausstehende Zahlungsanfragen** (automatisch) | Admins |
| **Broadcast** | Alle Mitglieder (Admin-Versand) |

## Einstellungen im Profil

Im Profil-Tab **⚙️ Einstellungen** kann jede Benachrichtigung auf **Aus / Push / E-Mail** gestellt werden:

- **Strafen, Abend-Events, Kegeltermine, Zahlungen, Spielergebnisse, Neue Mitglieder** — je Zustellweg wählbar
- **Schulden-Erinnerungen** — automatische Schulden-Benachrichtigungen (Aus/Push/E-Mail)
- **Termin-Erinnerungen** — automatische Terminbenachrichtigungen; dazu individuell einstellbar: wie viele Tage vorher erinnert werden soll
- **Zahlungsanfragen (Admin)** — Nudges für ausstehende Anfragen (nur für Admins sichtbar)
- **Kommentare & Reaktionen** — Benachrichtigungen zu Antworten und Reaktionen auf Ankündigungen, Kegelfahrten und Highlights
- **Ankündigungen** sind immer aktiv (Push) und nicht abschaltbar.

Ein Tap auf eine Kommentar- oder Reaktions-Benachrichtigung öffnet die App direkt beim betroffenen Beitrag und Kommentar (Deep-Link).

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

## E-Mail-Server *(Admin, pro Verein)*

Damit Mitglieder Benachrichtigungen per E-Mail erhalten können, hinterlegt ein Admin im **Einstellungen-Tab** unter **E-Mail-Versand (SMTP)** die Zugangsdaten des Vereins-E-Mail-Servers:

| Feld | Beschreibung |
|------|--------------|
| E-Mail-Versand aktiv | Schalter — erst wenn aktiv, wird die E-Mail-Option im Profil aller Mitglieder angeboten |
| SMTP-Server / Port | Hostname und Port (587 für STARTTLS, 465 für SSL/TLS) |
| Benutzername / Passwort | Anmeldedaten (das Passwort wird verschlüsselt gespeichert, nie zurückgegeben — nur „gespeichert" angezeigt) |
| Absender-Adresse / -Name | erscheinen als Absender der E-Mails |
| STARTTLS / SSL/TLS | Verschlüsselungsart (schließen sich gegenseitig aus) |

Mit **Test-E-Mail** verschickt der Admin eine Probe-Nachricht an die eigene Adresse, um die Konfiguration zu prüfen.

Die Einstellungen werden **pro Verein** gespeichert (in den Vereinseinstellungen). Ist kein Server konfiguriert oder der Versand deaktiviert, fällt die Zustellung stillschweigend auf „nur Glocke" zurück.

## Konfiguration *(Serveradmin)*

Push-Benachrichtigungen erfordern VAPID-Schlüssel als Umgebungsvariablen:

```
VAPID_PRIVATE_KEY=...
VAPID_PUBLIC_KEY=...
VAPID_CLAIM_EMAIL=admin@example.com
```

Fehlen diese Variablen, werden alle Push-Aktionen stillschweigend übersprungen — die App funktioniert weiterhin normal.

Für **absolute Links in E-Mails** (Buttons in Benachrichtigungs-Mails) kann optional die öffentliche App-URL gesetzt werden:

```
APP_BASE_URL=https://kegelkasse.example.com
```

Fehlt sie, werden E-Mails ohne Aktions-Link versendet (der Text bleibt vollständig).
