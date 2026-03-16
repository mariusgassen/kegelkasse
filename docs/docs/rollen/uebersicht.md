---
id: uebersicht
title: Benutzerrollen
sidebar_label: Übersicht
---

# Benutzerrollen

Kegelkasse kennt drei Rollen. Jede Rolle baut auf den Rechten der vorherigen auf.

## Rollenübersicht

| Funktion | Mitglied | Admin | Superadmin |
|----------|:--------:|:-----:|:----------:|
| Anmelden & Profil verwalten | ✅ | ✅ | ✅ |
| Abende einsehen | ✅ | ✅ | ✅ |
| Spieler hinzufügen / entfernen | ✅ | ✅ | ✅ |
| Spiele erfassen & bearbeiten | ✅ | ✅ | ✅ |
| Strafen vergeben & bearbeiten | ✅ | ✅ | ✅ |
| Getränkerunden protokollieren | ✅ | ✅ | ✅ |
| Kasse & Statistiken einsehen | ✅ | ✅ | ✅ |
| Abend öffnen / schließen | ✅ | ✅ | ✅ |
| **Vereinseinstellungen ändern** | 🔒 | ✅ | ✅ |
| **Stammspieler verwalten** | 🔒 | ✅ | ✅ |
| **Strafentypen verwalten** | 🔒 | ✅ | ✅ |
| **Spielvorlagen verwalten** | 🔒 | ✅ | ✅ |
| **Teams verwalten** | 🔒 | ✅ | ✅ |
| **Mitglieder einladen** | 🔒 | ✅ | ✅ |
| **Mitgliederrollen ändern** | 🔒 | ✅ | ✅ |
| **Mitgliedskonten & Zahlungen** | 🔒 | ✅ | ✅ |
| **Mehrere Vereine verwalten** | 🔒 | 🔒 | ✅ |
| **Vereine anlegen** | 🔒 | 🔒 | ✅ |

## Rollen im Detail

### 👤 Mitglied

Die Standard-Rolle für alle registrierten Benutzer. Ein Mitglied kann vollständig am Kegelabend teilnehmen:

- Abende ansehen und mitverwalten
- Eigene Spieler-Verknüpfung einsehen
- Strafen, Spiele und Getränke protokollieren
- Kasse und Statistiken einsehen
- Eigenes Profil (Name, Avatar, Sprache) bearbeiten

→ [Vollständige Mitglieder-Anleitung](/rollen/mitglied)

### 🔑 Admin

Admins verwalten den Verein. Sie haben alle Rechte eines Mitglieds **plus**:

- Vereinseinstellungen (Spiellokal, Vereinsfarben) ändern
- Stammspieler-Liste pflegen
- Strafentypen und Spielvorlagen anlegen / ändern
- Vereins-Teams verwalten
- Neue Mitglieder per Einladungslink einladen
- Mitgliederrollen (Mitglied ↔ Admin) ändern
- Mitgliedskonten und Zahlungen verwalten

→ [Vollständige Admin-Anleitung](/rollen/admin)

### ⚡ Superadmin

Systemweiter Vollzugriff. Zusätzlich zu allem was ein Admin kann:

- Alle Vereine im System einsehen
- Neue Vereine anlegen
- Zwischen Vereinen wechseln

→ [Vollständige Superadmin-Anleitung](/rollen/superadmin)

## Rolle ändern

Ein Admin kann die Rolle eines Mitglieds unter **Verein → Mitglieder** ändern. Superadmin-Rollen werden nur direkt in der Datenbank vergeben.
