---
id: intro
title: Kegelkasse — Überblick
sidebar_label: Übersicht
slug: /
---

# 🎳 Kegelkasse

**Kegelkasse** ist eine Progressive Web App (PWA) zur vollständigen Verwaltung eines Kegelclubs — von der Abendplanung über Spiele und Strafen bis zur Vereinskasse.

## Was kann Kegelkasse?

| Bereich | Beschreibung |
|---------|-------------|
| **Abende** | Abende anlegen, Spieler einladen, Teams bilden |
| **Termine** | Zukünftige Spieltermine planen, RSVP erfassen, Abend direkt starten |
| **Spiele** | Spiele erfassen, Ergebnisse eintragen, Verliererstrafen automatisch vergeben |
| **Strafen** | Individuell oder per Team strafen, Drehtrommel für zufällige Auswahl |
| **Getränke** | Bier- und Schnappsrunden protokollieren |
| **Kasse** | Finanzübersicht mit Ranking, Mitgliedskonten und Bezahllink |
| **Historie** | Abgeschlossene Abende einsehen und Statistiken auswerten |
| **Statistiken** | Jahresranking mit Strafen, Siegen, Abenden und Getränken |
| **Präsident** | Jährliches Präsidentenspiel und Präsidentenhistorie |
| **Vereinsnadeln** | Nadeln vergeben, Träger verwalten, Strafen per Knopfdruck |
| **Push** | Web-Push-Benachrichtigungen für Strafen, Abende und Zahlungen |

## Rollen auf einen Blick

Kegelkasse kennt drei Benutzerrollen mit unterschiedlichen Rechten:

<div style={{display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem'}}>
  <div style={{flex: 1, minWidth: 200, padding: '1rem', borderRadius: 8, border: '1px solid var(--ifm-color-emphasis-300)', background: 'var(--ifm-card-background-color)'}}>
    <strong>👤 Mitglied</strong><br/>
    Kann an Abenden teilnehmen, Strafen einsehen und das eigene Profil verwalten.
  </div>
  <div style={{flex: 1, minWidth: 200, padding: '1rem', borderRadius: 8, border: '1px solid var(--ifm-color-emphasis-300)', background: 'var(--ifm-card-background-color)'}}>
    <strong>🔑 Admin</strong><br/>
    Zusätzlich: Vereinseinstellungen, Strafentypen, Vorlagen, Mitglieder einladen & verwalten.
  </div>
  <div style={{flex: 1, minWidth: 200, padding: '1rem', borderRadius: 8, border: '1px solid var(--ifm-color-emphasis-300)', background: 'var(--ifm-card-background-color)'}}>
    <strong>⚡ Superadmin</strong><br/>
    Vollzugriff auf alle Clubs und Systemfunktionen.
  </div>
</div>

Detaillierte Beschreibungen findest du unter [Benutzerrollen](/rollen/uebersicht).

## Technische Highlights

- **Offline-fähig** — Die App läuft auch ohne Internetverbindung (PWA mit Service Worker)
- **Echtzeit** — Änderungen anderer Nutzer erscheinen automatisch (30-Sekunden-Polling)
- **Zweisprachig** — Deutsch und Englisch, pro Benutzer einstellbar
- **Installierbar** — Kann auf dem Handy wie eine native App installiert werden

## Nächste Schritte

import DocCardList from '@theme/DocCardList';

<DocCardList />
