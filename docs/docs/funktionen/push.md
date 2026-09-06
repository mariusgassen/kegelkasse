---
id: push
title: Push-Benachrichtigungen
sidebar_label: Push-Benachrichtigungen
---

# Push-Benachrichtigungen

Kegelkasse kann Benachrichtigungen **als Web-Push** (auch bei geschlossener App), **per E-Mail** oder **per Telegram** senden. So verpasst kein Mitglied eine Strafe oder eine wichtige Vereinsnachricht.

## Zustellwege pro Benachrichtigung: Push, E-Mail und/oder Telegram

Jede Benachrichtigungsart lässt sich im Profil (**⚙️ Einstellungen → Benachrichtigungseinstellungen**) einzeln steuern. **Push, E-Mail und Telegram sind unabhängige Schalter** — beliebig viele können gleichzeitig aktiv sein:

- **🔔 Push** — Web-Push auf die abonnierten Geräte
- **✉️ E-Mail** — Versand an die hinterlegte E-Mail-Adresse (nur wählbar, wenn der Verein einen E-Mail-Server konfiguriert hat)
- **📨 Telegram** — Versand über den Vereins-Bot (nur wählbar, wenn der Verein einen Bot konfiguriert hat **und** dieses Mitglied sein eigenes Telegram-Konto verbunden hat)

Sind **mehrere** Wege aktiv, wird dieselbe Benachrichtigung über jeden davon zugestellt. Sind **alle aus**, gibt es keine Zustellung (die Benachrichtigung erscheint dann auch nicht in der Glocke). Ist mindestens ein Weg aktiv, wird die Benachrichtigung zusätzlich in der **In-App-Glocke** protokolliert. Dieselbe Wahl gilt auch für die automatischen Erinnerungen (Schulden, Termine, RSVP …).

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

Im Profil-Tab **⚙️ Einstellungen** kann jede Benachrichtigung per **🔔 Push, ✉️ E-Mail und/oder 📨 Telegram** zugestellt werden (alle Schalter unabhängig, beliebige Kombination möglich):

- **Strafen, Abend-Events, Kegeltermine, Zahlungen, Spielergebnisse, Neue Mitglieder** — Push/E-Mail/Telegram je einzeln
- **Schulden-Erinnerungen** — automatische Schulden-Benachrichtigungen (Push, E-Mail und/oder Telegram)
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
| Eigene Domain (optional) | überschreibt die Standard-App-URL für alle Links in den E-Mails dieses Vereins — z. B. wenn der Verein per CNAME eine eigene Domain auf die Kegelkasse-Instanz zeigen lässt. Leer lassen, um die serverweite Standardadresse zu verwenden |

Mit **Test-E-Mail** verschickt der Admin eine Probe-Nachricht an die eigene Adresse, um die Konfiguration zu prüfen.

Die Einstellungen werden **pro Verein** gespeichert (in den Vereinseinstellungen). Ist kein Server konfiguriert oder der Versand deaktiviert, fällt die Zustellung stillschweigend auf „nur Glocke" zurück.

Alle E-Mails (Einzel-Benachrichtigungen wie Zusammenfassungen) werden im **Vereins-Design** gerendert: Kopfzeile in der Vereins-Grundfarbe mit Vereinslogo (falls hinterlegt, sonst der Anfangsbuchstabe) als **runder Avatar** neben dem Vereinsnamen, und Buttons in der Markenfarbe. Der Text erscheint in der **Sprache des Empfängers** (Deutsch/Englisch), passend zur Profil-Einstellung. Ein echter Absender-Avatar im Postfach selbst (wie bei Kontakten mit Foto) lässt sich aus einer transaktionalen App-Mail heraus nicht setzen — das erfordert eine Gravatar-Registrierung oder BIMI-DNS-Einträge auf Domain-Ebene, außerhalb der Vereinskonfiguration; der runde Avatar im Mail-Header ist die nächstmögliche Annäherung.

## Telegram *(Admin, pro Verein)*

Jeder Verein kann seinen **eigenen** Telegram-Bot anbinden, damit Mitglieder Benachrichtigungen zusätzlich per Telegram erhalten. Ein Verein-Bot ist in wenigen Minuten und kostenlos eingerichtet:

1. In Telegram nach **@BotFather** suchen und einen Chat starten
2. `/newbot` senden und den Anweisungen folgen (Name + eindeutiger Username, muss auf `bot` enden)
3. Den erhaltenen **Token** kopieren
4. Im **Einstellungen-Tab** unter **📨 Telegram** den Token einfügen, **Telegram-Versand aktiv** einschalten, speichern

Beim Speichern prüft Kegelkasse den Token über die Telegram-API (bestätigt den Bot und liest dessen Username automatisch aus — keine manuelle Eingabe nötig) und registriert automatisch einen **Webhook**, über den Telegram eingehende Nachrichten zustellt. Dafür muss die serverweite `APP_BASE_URL` gesetzt sein (siehe Konfiguration unten) — fehlt sie, zeigt die Karte einen Warnhinweis, und der Webhook kann nicht registriert werden, bis sie gesetzt ist.

### Das eigene Telegram-Konto verbinden *(jedes Mitglied)*

Ein Chat-ID wird nie manuell gesucht — die Verbindung läuft über einen Ein-Tap-Link:

1. Im Profil (**⚙️ Einstellungen**) erscheint eine **📨 Telegram**-Karte, sobald der Verein einen Bot konfiguriert hat
2. Auf **Mit Telegram verbinden** tippen — Telegram öffnet sich mit einem vorausgefüllten Chat zum Vereins-Bot
3. Auf **Start** tippen — die App erkennt die Verbindung innerhalb weniger Sekunden automatisch (kein Neuladen nötig) und die Karte zeigt **✅ Verbunden**

Über **Verbindung trennen** lässt sich die Verknüpfung jederzeit wieder aufheben. Ein Admin kann mit **Test-Nachricht** prüfen, ob der Versand funktioniert — vorausgesetzt, das eigene Konto ist bereits verbunden.

## E-Mail-Zusammenfassung *(pro Mitglied)*

Jedes Mitglied kann im **Einstellungen-Tab** des Profils unter **E-Mail-Zusammenfassung** eine persönliche Zusammenfassung abonnieren. Die Häufigkeit ist frei wählbar:

| Option | Bedeutung |
|--------|-----------|
| Aus | keine Zusammenfassung (Standard) |
| Täglich / Wöchentlich / Monatlich | Versand im gewählten Rhythmus |

Ein täglicher Hintergrund-Job (08:00) versendet fällige Zusammenfassungen. Direkt unter der Begrüßung steht ein **„Öffnen"-Button**, der in die App springt. Jede Zusammenfassung ist **persönlich** und enthält alles, was sich seit der letzten Zusammenfassung getan hat — mit **Direktlink** zu jedem Eintrag:

- **Kegelabende** — neu angelegte, aktualisierte oder abgeschlossene Abende
- **Deine Strafen** — die eigenen Strafen des Zeitraums
- **Deine Buchungen** — die eigenen Ein-/Auszahlungen
- **Neues aus dem Verein** — neue Aktivität auf Ankündigungen, Kegelfahrten und Highlights, gebündelt als **ein Eintrag pro Beitrag** (nicht pro einzelnem Kommentar/Reaktion): Titel des Beitrags, Typ-Icon (📣 Ankündigung, 🚌 Kegelfahrt, ✨ Highlight), wie viel sich getan hat (`💬 Anzahl Kommentare · ❤️ Anzahl Reaktionen`) sowie eine kurze **Textvorschau** des neuesten Kommentars, damit man den Inhalt sieht, ohne die App öffnen zu müssen; der Link führt direkt zur neuesten Aktivität in diesem Thread
- **Dein Konto** — Kontostand, Strafen- und Einzahlungssumme im Überblick

Gibt es seit der letzten Zusammenfassung nichts Neues, wird **keine** E-Mail verschickt (kein Rauschen). Über **Zusammenfassung jetzt senden** lässt sich jederzeit eine Vorschau an die eigene Adresse schicken (setzt den Rhythmus nicht zurück). Die Option erscheint nur, wenn der Verein einen E-Mail-Server konfiguriert hat.

:::info Testvorschau zeigt oft nur den Kontostand
Beim manuellen **Zusammenfassung jetzt senden** wird die Zusammenfassung erzwungen, auch wenn seit der letzten Zusammenfassung nichts passiert ist — dann enthält die Vorschau **nur** den Kontostand, da Abende/Strafen/Buchungen/Neuigkeiten leer sind und ausgeblendet werden. Um die vollständige Ansicht mit Direktlinks zu testen, vorher z. B. einen Kommentar auf eine Ankündigung schreiben oder eine Strafe eintragen.
:::

### Warum ein Link manchmal nicht klickbar ist

Jeder Link in einer E-Mail benötigt eine absolute Adresse (die serverweite `APP_BASE_URL` oder die Eigene-Domain-Einstellung des Vereins, siehe oben). Ist **keine** der beiden gesetzt, werden Links als reiner, nicht klickbarer Text angezeigt — inklusive des „Öffnen"-Buttons, der dann komplett entfällt. Betrifft alle E-Mails, nicht nur Zusammenfassungen.

### Direktlink öffnet installierte App statt Browser *(wo unterstützt)*

Ist Kegelkasse als PWA installiert, versuchen unterstützende Browser (Chrome/Edge auf Desktop und Android), einen angeklickten Link innerhalb der App zu öffnen statt in einem neuen Browser-Tab („Declarative Link Capturing"). Das ist eine Browser-/Betriebssystem-Funktion, keine Einstellung in Kegelkasse — auf iOS/Safari wird ein Link aus der Mail-App aktuell immer in Safari geöffnet, auch wenn die PWA installiert ist (WebKit unterstützt diese Funktion nicht).

## Konfiguration *(Serveradmin)*

Push-Benachrichtigungen erfordern VAPID-Schlüssel als Umgebungsvariablen:

```
VAPID_PRIVATE_KEY=...
VAPID_PUBLIC_KEY=...
VAPID_CLAIM_EMAIL=admin@example.com
```

Fehlen diese Variablen, werden alle Push-Aktionen stillschweigend übersprungen — die App funktioniert weiterhin normal.

Für **absolute Links in E-Mails** (Buttons in Benachrichtigungs-Mails) sowie für den **Telegram-Webhook** (siehe oben) muss die öffentliche App-URL gesetzt werden:

```
APP_BASE_URL=https://kegelkasse.example.com
```

Fehlt sie, werden E-Mails ohne Aktions-Link versendet (der Text bleibt vollständig) und der Telegram-Webhook kann nicht registriert werden — ein Verein-Bot lässt sich dann speichern, empfängt aber keine `/start`-Verbindungen.
