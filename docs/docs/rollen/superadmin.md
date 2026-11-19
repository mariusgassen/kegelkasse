---
id: superadmin
title: Superadmin
sidebar_label: Superadmin
---

# Rolle: Superadmin

Der **Superadmin** hat systemweiten Vollzugriff. Diese Rolle ist für Betreiber der Kegelkasse-Instanz gedacht — typischerweise die Person, die den Server administriert und die globale Roadmap moderiert.

:::info
Der erste Superadmin wird beim Serversetup angelegt. Weitere Superadmins (sowie vereinsübergreifende Rollen wie `IT-Admin` oder `Vereins-Admin`) können von einem Superadmin jederzeit in der App unter **Verein → Superadmin → Globale Benutzerrollen** ernannt werden — Vereins-Admins können sich selbst nicht zum Superadmin hochstufen.
:::

---

## Superadmin einrichten

Beim ersten Start wird automatisch ein Superadmin-Account angelegt:

```bash
docker compose exec app python -m app.scripts.create_admin
```

Die Zugangsdaten werden über Umgebungsvariablen gesetzt:

```env
FIRST_SUPERADMIN_EMAIL=admin@example.com
FIRST_SUPERADMIN_PASSWORD=sicheres-passwort
```

---

## Mehrere Vereine & alle Benutzer verwalten

Ein Superadmin kann mehrere Kegelvereine auf einer Instanz betreiben und alle Benutzerkonten vereinsübergreifend verwalten.

### Vereine einsehen & anlegen

1. Melde dich als Superadmin an
2. Navigiere zu **Verein → Superadmin**
3. Alle Vereine werden aufgelistet und können angelegt, umbenannt oder gelöscht werden

### Zwischen Vereinen wechseln

1. **Verein → Superadmin** → Klicke bei einem Verein auf **Wechseln**
2. Der Kontext wechselt zu diesem Verein
3. Alle weiteren Aktionen (Abende, Einstellungen) beziehen sich nun auf diesen Verein

### Globale Benutzerrollen (Alle Benutzer aller Vereine)

Unter **Verein → Superadmin → Globale Benutzerrollen** sieht der Superadmin sämtliche Benutzerkonten aller Vereine (inkl. Vereinszugehörigkeit und E-Mail-Adresse) und kann per Klick beliebige Rollen zuweisen oder entziehen:

- **Superadmin** (Voller Systemzugriff, Backups, globale Roadmap)
- **IT-Admin** (Technische Einstellungen & Integrationen)
- **Vereins-Admin**, **Kassenwart**, **Kassenprüfer**, **Vergnügungsausschuss**, **Zeugwart**

*(Schutzregel: Der letzte aktive Superadmin des Systems kann sich die Superadmin-Rolle nicht selbst entziehen.)*

---

## Alle Admin- & IT-Admin-Funktionen

Der Superadmin hat automatisch auch Zugriff auf alle [Vereins-Admin-, IT-Admin- und Kassenwart-Funktionen](/rollen/admin) sowie auf die Datenbank-Backups (pgBackRest).

---

## Deployment & Server

Details zur Serverinstallation findest du in der [README](https://github.com/mariusgassen/kegelkasse) des Projekts.

### Umgebungsvariablen

| Variable | Beschreibung |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL-Verbindungsstring |
| `SECRET_KEY` | JWT-Signierschlüssel (zufällig, mind. 32 Zeichen) |
| `FIRST_SUPERADMIN_EMAIL` | E-Mail des ersten Superadmins |
| `FIRST_SUPERADMIN_PASSWORD` | Passwort des ersten Superadmins |

### Automatische Migrationen

Beim Start des Containers werden Datenbankmigrationen automatisch ausgeführt. Kein manueller Eingriff nötig.
