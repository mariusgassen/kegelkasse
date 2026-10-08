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

Alle geplanten Termine können als **iCal-Feed** in externe Kalender-Apps importiert werden (Apple Kalender, Google Calendar, Outlook). Der Feed ist **persönlich**: Jeder Termin zeigt deine eigene Zu- oder Absage.

1. Tippe oben rechts auf **Kalender abonnieren**
2. Wähle deine Kalender-App: **In Apple Kalender oder App öffnen**, **Zu Google Kalender hinzufügen** oder **Zu Outlook hinzufügen** — oder kopiere den Link und füge ihn manuell als neuen Kalender ein

| Deine Antwort | Im Kalender |
|---|---|
| Zugesagt | Termin normal sichtbar, Status „bestätigt" |
| Noch keine Antwort | Termin sichtbar, Status „vorläufig" |
| Abgesagt | Termin wird in deinem Kalender **abgesagt** und ausgeblendet |

Zusätzlich steht in der **Beschreibung** jedes Termins direkt im Kalender:

- **Deine Antwort** (Zugesagt / Abgesagt / Noch keine Antwort)
- die **Notiz** zum Termin, falls es eine gibt
- eine **Übersicht, wer kommt**: *Dabei*, *Abgesagt* und *Gäste* mit Namen und Anzahl (wie in der App gilt: wer nicht abgesagt hat, ist dabei)
- ein **Direktlink zum Termin in der App**; in Kalender-Apps, die das unterstützen, ist der Termin außerdem selbst mit der App verlinkt
- ein Link **„Zu-/Absagen"** (nur bei kommenden Terminen): er öffnet die App direkt auf dem Zu-/Absage-Fenster. Du musst dafür im Browser bzw. in der App angemeldet sein — der Link enthält bewusst keinen Zugangsschlüssel. Erst dein Tipp ändert die Antwort

**Kegelfahrten** aus dem Vergnügungsausschuss erscheinen als ganztägige Termine (mehrtägig, wenn die Fahrt ein Enddatum hat), mit Notiz und Link zur Fahrt in der App.

Sagst du später doch zu, erscheint der Termin wieder. Die Namensübersicht und der Link sind nur in deinem persönlichen Link enthalten, nicht in älteren Vereins-Links. Kalender-Apps holen den Feed in eigenen Abständen ab (Google oft nur alle paar Stunden) — eine geänderte Antwort erscheint deshalb nicht sofort.

:::info
Der Link gehört nur dir (er enthält einen geheimen Token) — teile ihn nicht. Ist ein Mitglied deaktiviert, hört sein Link auf zu funktionieren. Bereits abonnierte Vereins-Links aus früheren Versionen funktionieren weiter, zeigen aber keine Zu-/Absagen.
:::

Ist dein Link in falsche Hände geraten, tippe im Abo-Fenster auf **Neuen Link erzeugen**. Der bisherige Link wird sofort ungültig (nur deiner — die Links der anderen Mitglieder bleiben unberührt). Abonniere den Kalender danach mit dem neuen Link erneut und lösche den alten Kalender in deiner App.

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

## Gastanfragen

Interessierte können über die Vereins-Homepage anfragen, ob sie als **Gastkegler** zu einem Termin kommen dürfen. Jeder Termin hat dort einen Link „Gastkegeln anfragen“, der auf eine eigene Seite pro Termin führt (z. B. `https://www.kc-eichhorn.de/gastkegeln/36` — gut als Link für Instagram geeignet). Der Gast gibt **Name, E-Mail und optional eine Nachricht** an.

- **Benachrichtigung:** Für jede neue Anfrage bekommen alle Mitglieder eine Benachrichtigung mit Link zur Übersicht. Die Kategorie „Gastanfragen“ ist standardmäßig **per E-Mail** aktiv und lässt sich im Profil wie jede andere Benachrichtigung umstellen oder abschalten. E-Mails gehen nur raus, wenn der Verein einen [E-Mail-Server](push.md#e-mail-server-admin-pro-verein) eingerichtet hat.
- **Übersicht:** Oben auf der Seite 📅 **Termine** erscheint der Bereich 🙋 **Gastanfragen**, sobald die erste Anfrage eingegangen ist — offene Anfragen mit Name, Termin, E-Mail und Nachricht, erledigte eingeklappt darunter.
- **Entscheiden:** **Jedes Mitglied** kann eine Anfrage annehmen oder ablehnen (mit Bestätigung). **Annehmen** trägt den Gast automatisch als Gast beim Termin ein. In beiden Fällen bekommt der Gast eine E-Mail. Konnte sie nicht verschickt werden (kein Mailserver eingerichtet), sagt die App das — dann bitte direkt an die angezeigte Adresse schreiben.
- **Pro Termin abschaltbar *(Admin)*:** Im Termin-Formular „Gastanfragen erlauben“ ausschalten, dann verschwindet der Link auf der Homepage.

:::info
Gastanfragen setzen voraus, dass die [öffentlichen Termine](#öffentliche-termine-z-b-für-die-vereins-homepage-admin) freigeschaltet sind. Gegen Spam ist das Formular durch ein unsichtbares Fangfeld, eine Begrenzung pro Absender und E-Mail-Adresse und eine Duplikat-Erkennung geschützt. An die eingegebene Adresse geht erst nach einer Entscheidung eine Mail.
:::

## Termin bearbeiten & löschen *(Admin)*

Tippe auf das Bearbeiten-Symbol neben einem Termin, um Datum, Lokal oder Notiz zu ändern, oder lösche den Termin endgültig.
