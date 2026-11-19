---
id: uebersicht
title: Benutzerrollen
sidebar_label: Übersicht
---

# Benutzerrollen

Alle Berechtigungen in Kegelkasse werden über **Benutzerrollen** (`User.roles`) gesteuert. Ein Mitglied kann **mehrere Rollen gleichzeitig** innehaben (z. B. Kassenwart und Vergnügungsausschuss).

## Rollenübersicht

| Funktion | Mitglied | Vergnügungs-ausschuss | Zeugwart | Kassenwart | Kassenprüfer | Admin | IT-Admin | Superadmin |
|----------|:--------:|:---------------------:|:--------:|:----------:|:------------:|:-----:|:--------:|:----------:|
| Abend starten, Spiele, Würfe & Strafen erfassen | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Termine planen, Gäste & Zu-/Absagen pflegen | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Protokolle & sonstige Dokumente hochladen | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Kasse, Berichte & KI-Rückblicke einsehen | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Kegelfahrten & Fahrtkosten verwalten** | 🔒 | ✅ | 🔒 | 🔒 | 🔒 | ✅ | 🔒 | ✅ |
| **Ankündigungen & Umfragen moderieren** | 🔒 | ✅ | 🔒 | 🔒 | 🔒 | ✅ | 🔒 | ✅ |
| **Vereinsmaterial & Bestandsbewegungen** | 🔒 | 🔒 | ✅ | 🔒 | 🔒 | ✅ | 🔒 | ✅ |
| **Zahlungen, Ausgaben, Saisonabschluss & Export** | 🔒 | 🔒 | 🔒 | ✅* | 🔒 | 🔒* | 🔒 | ✅ |
| **Kassenprüfung einfrieren** | 🔒 | 🔒 | 🔒 | ✅* | ✅ | 🔒* | 🔒 | ✅ |
| **Kassenprüfung gegenzeichnen (Vier-Augen-Prinzip)** | 🔒 | 🔒 | 🔒 | 🔒 | ✅ | 🔒 | 🔒 | 🔒 |
| **Vereinseinstellungen, Regelkatalog & Rollenvergabe** | 🔒 | 🔒 | 🔒 | 🔒 | 🔒 | ✅ | 🔒 | ✅ |
| **Satzung & Geschäftsordnung hochladen** | 🔒 | 🔒 | 🔒 | 🔒 | 🔒 | ✅ | 🔒 | ✅ |
| **Technische Einstellungen (SMTP, Telegram, KI, Export/Import, Tokens)** | 🔒 | 🔒 | 🔒 | 🔒 | 🔒 | 🔒 | ✅ | ✅ |
| **Alle Vereine, globale Benutzerverwaltung & Backups** | 🔒 | 🔒 | 🔒 | 🔒 | 🔒 | 🔒 | 🔒 | ✅ |

*\* Solange im Verein noch kein Kassenwart ernannt ist, übernimmt der Vereins-Admin kommissarisch die Kassenwart-Rechte.*

## Rollen im Detail

### 👤 Mitglied (`member`)

Die Standard-Rolle für alle registrierten Vereinsmitglieder. Mitglieder können den laufenden Spielbetrieb weitgehend selbstständig organisieren:

- Kegelabende starten, bearbeiten, schließen oder als ausgefallen markieren
- Spiele, Kamera-Würfe, Strafen, Abwesenheitsstrafen und Getränkerunden protokollieren
- Termine im Kalender anlegen, bearbeiten, Gäste eintragen, RSVPs pflegen und Erinnerungen senden
- Namen und Kegelnamen im Roster pflegen sowie KI-Spitznamensvorschläge und Rückblicke nutzen
- Protokolle und sonstige Vereinsdokumente hochladen

→ [Vollständige Mitglieder-Anleitung](/rollen/mitglied)

### 🎉 Vergnügungsausschuss (`committee`)

- Kegelfahrten und Fahrtkosten anlegen, bearbeiten und abrechnen
- Vereinsankündigungen und Umfragen moderieren

### 📦 Zeugwart (`zeugwart`)

- Vereinsinventar (Artikel, Zielbestand) pflegen und Bestandsbewegungen verbuchen

### 💰 Kassenwart (`treasurer`)

- Einzahlungen, Auszahlungen und Vereinsausgaben buchen
- Gemeldete Zahlungsanfragen bestätigen oder ablehnen und Schuldner erinnern
- Jahresabschluss durchführen, Berichte exportieren und Kassenprüfungen vorbereiten

### 🔍 Kassenprüfer (`auditor`)

- Eingefrorene Kassenprüfungen prüfen und nach dem Vier-Augen-Prinzip bestätigen oder beanstanden (nicht automatisch in `admin` oder `superadmin` enthalten)

### 🔑 Vereins-Admin (`admin`)

Verwaltet die fachlichen Vereinseinstellungen und Mitglieder:

- Allgemeine Vereinseinstellungen & Betrieb (Name, Spiellokal, Vereinsfarben, Logo, App-Icon, Strafgrenzen, PayPal.me)
- Regelkatalog (Strafentypen, Spielvorlagen, Vereinsteams, Vereinsnadeln)
- Mitglieder einladen, Konten mit Stammspielern verknüpfen und Vereinsrollen vergeben
- Offizielle Beschlussdokumente (Satzung, Geschäftsordnung) veröffentlichen

→ [Vollständige Admin-Anleitung](/rollen/admin)

### 🛠️ IT-Admin (`it_admin`)

Verantwortlich für alle technischen Integrationen des Vereins:

- E-Mail-Versand (SMTP) und Telegram-Bot konfigurieren und testen
- KI-Modelle, Limits und Prompts verwalten
- Vereinskonfiguration als JSON exportieren/importieren sowie iCal- und TV-Scoreboard-Tokens erneuern

### ⚡ Superadmin (`superadmin`)

Systemweiter Plattform-Vollzugriff:

- Alle Vereine verwalten und zwischen Vereinen wechseln
- Vereinsübergreifende Benutzer- und Rollenverwaltung (inkl. Ernennung weiterer Superadmins und IT-Admins)
- Datenbank-Backups (pgBackRest) und globale Roadmap-Moderation

→ [Vollständige Superadmin-Anleitung](/rollen/superadmin)

## Rollen vergeben

Ein Vereins-Admin kann die Vereinsrollen (`Admin`, `IT-Admin`, `Kassenwart`, `Kassenprüfer`, `Vergnügungsausschuss`, `Zeugwart`) unter **Mitglieder → Aktionen → Rollen verwalten** frei kombinieren. Die `Superadmin`-Rolle kann ausschließlich von einem bestehenden Superadmin in der globalen Benutzerverwaltung vergeben werden.
