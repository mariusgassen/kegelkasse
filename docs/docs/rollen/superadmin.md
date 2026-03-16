---
id: superadmin
title: Superadmin
sidebar_label: Superadmin
---

# Rolle: Superadmin

Der **Superadmin** hat systemweiten Vollzugriff. Diese Rolle ist für Betreiber der Kegelkasse-Instanz gedacht — typischerweise die Person, die den Server administriert.

:::caution
Die Superadmin-Rolle wird **nicht** über die App vergeben, sondern direkt beim Serversetup gesetzt. Weitere Superadmins können nur über die Datenbank erstellt werden.
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

## Mehrere Vereine verwalten

Ein Superadmin kann mehrere Kegelvereine auf einer Instanz betreiben.

### Vereine einsehen

1. Melde dich als Superadmin an
2. Navigiere zu **Superadmin** (erscheint nur für Superadmins in der Navigation)
3. Alle Vereine werden aufgelistet

### Neuen Verein anlegen

1. **Superadmin** → **Neuer Verein**
2. Gib den **Vereinsnamen** ein
3. Speichern

Der neue Verein ist sofort verfügbar. Ein Admin-Benutzer kann dann eingeladen werden.

### Zwischen Vereinen wechseln

1. **Superadmin** → Klicke auf einen Verein → **Wechseln**
2. Der Kontext wechselt zu diesem Verein
3. Alle weiteren Aktionen (Abende, Einstellungen) beziehen sich nun auf diesen Verein

---

## Alle Admin-Funktionen

Der Superadmin hat selbstverständlich auch Zugriff auf alle [Admin-Funktionen](/rollen/admin):

- Vereinseinstellungen
- Mitglieder verwalten
- Strafentypen & Spielvorlagen
- Mitgliedskonten

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
