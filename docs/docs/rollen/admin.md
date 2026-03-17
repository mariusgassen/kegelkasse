---
id: admin
title: Admin
sidebar_label: Admin
---

# Rolle: Admin

Als **Admin** verwaltest du den Verein: Mitglieder, Strafentypen, Spielvorlagen und Vereinseinstellungen. Du hast alle Rechte eines Mitglieds und zusätzlich Zugriff auf den **Vereinsbereich** (⚙️).

---

## Vereinseinstellungen

Unter **Verein → Einstellungen** kannst du:

- **Vereinsname** festlegen
- **Spiellokal** (Standardveranstaltungsort) eintragen
- **Vereinsfarben** (Primär- und Sekundärfarbe) anpassen
- **Gästestrafen-Limit** setzen (maximaler Strafenbetrag für Gastspieler)

---

## Mitglieder einladen

### Einladungslink erstellen

1. Gehe zu **Verein → Mitglieder**
2. Tippe auf **Einladen**
3. Ein einmaliger Einladungslink wird generiert
4. Teile den Link mit dem neuen Mitglied

:::info
Der Link ist ein Einmaltoken. Nach der Registrierung ist er ungültig.
:::

### Mitglied mit Stammspieler verknüpfen

Wenn ein Benutzeraccount zu einem bestehenden Stammspieler gehört:

1. Gehe zu **Verein → Mitglieder**
2. Tippe auf das Mitglied
3. Wähle **Stammspieler verknüpfen** und wähle den passenden Eintrag

Das ermöglicht korrekte Statistiken über alle Abende.

### Rolle ändern

1. Tippe auf ein Mitglied in der Liste
2. Wähle **Rolle ändern**
3. Wechsle zwischen **Mitglied** und **Admin**

### Mitglied deaktivieren / reaktivieren

- **Deaktivieren**: Mitglied kann sich nicht mehr anmelden
- **Reaktivieren**: Zugang wird wiederhergestellt

---

## Stammspieler verwalten

Stammspieler sind die **dauerhafte Spielerliste** des Vereins — unabhängig davon, ob ein Benutzeraccount existiert.

### Stammspieler anlegen

1. **Verein → Stammspieler** → **Hinzufügen**
2. Gib **Name** und optional einen **Spitznamen** ein
3. Speichern

### Stammspieler zusammenführen

Falls zwei Einträge dieselbe Person sind:

1. Tippe auf einen Stammspieler → **Zusammenführen**
2. Wähle den Eintrag, der erhalten bleiben soll
3. Alle verknüpften Abende werden auf den verbleibenden Eintrag übertragen

---

## Strafentypen verwalten

Strafentypen sind die verfügbaren Strafenkategorien (z. B. „Handy klingelt", „Zu spät").

### Strafentyp anlegen

1. **Verein → Strafentypen** → **Hinzufügen**
2. Fülle aus:
   - **Icon** (Emoji)
   - **Name**
   - **Standardbetrag** (in € oder Anzahl)
   - **Modus**: `euro` (Geldbetrag) oder `count` (Zähler)
   - **Reihenfolge** (Sortiernummer)
3. Speichern

:::tip
Im `count`-Modus wird der Standardbetrag bei Erfassung eingefroren — rückwirkende Änderungen des Standardbetrags verändern bestehende Einträge nicht.
:::

### Strafentyp bearbeiten / löschen

- Tippe auf den Typ → **Bearbeiten** oder **Löschen**
- Gelöschte Typen sind weich gelöscht (Soft-Delete) und bleiben in bestehenden Strafenprotokollen erhalten

---

## Spielvorlagen verwalten

Spielvorlagen beschleunigen die Erfassung von Standardspielen.

### Vorlage anlegen

1. **Verein → Spielvorlagen** → **Hinzufügen**
2. Fülle aus:
   - **Name** (z. B. „Klassiker")
   - **Beschreibung**
   - **Gewinner-Typ**: `team`, `individual` oder `either`
   - **Eröffnungsspiel**: Markiert dieses Spiel als Eröffnungsspiel (König)
   - **Standard-Verliererstrafe**: Welche Strafe erhalten Verlierer automatisch?
   - **Reihenfolge**
3. Speichern

---

## Teams verwalten

Vereins-Teams können als Vorlage für Abenteams genutzt werden.

1. **Verein → Teams** → **Hinzufügen**
2. Gib einen **Teamnamen** und eine **Farbe** ein
3. Speichern

Beim Erstellen eines Abends können diese Teams als Startvorlage geladen werden.

---

## Mitgliedskonten & Zahlungen

### Kontosaldo einsehen

1. **Verein → Konten**
2. Alle Mitglieder mit aktuellem Saldo werden angezeigt (positiv = Guthaben, negativ = Schulden)

### Zahlung erfassen

1. Tippe auf ein Mitglied
2. Wähle **Zahlung hinzufügen**
3. Gib **Betrag** und **Beschreibung** ein (z. B. „Kassenausgleich März")
4. Speichern

### Zahlung löschen

Tippe auf eine Zahlung → **Löschen**

---

## PayPal.me konfigurieren

Mitglieder können Schulden direkt per PayPal begleichen, wenn ein PayPal.me-Handle hinterlegt ist.

1. **Verein → Einstellungen** → **PayPal.me Handle**
2. Gib deinen PayPal.me-Benutzernamen ein (z. B. `meinverein`)
3. Speichern

Mitglieder sehen dann im Profil unter **Mein Konto** einen direkten PayPal-Link.

---

## Zahlungsanfragen bestätigen

Wenn Mitglieder eine Zahlung über den PayPal-Link melden, erscheint diese als **Zahlungsanfrage**:

1. Gehe zu **Kasse → Konten**
2. Offene Anfragen erscheinen als ⏳-Badge beim jeweiligen Mitglied
3. Tippe auf **Bestätigen** (✓) oder **Ablehnen** (✗)
4. Bei Bestätigung wird der Saldo automatisch aktualisiert
