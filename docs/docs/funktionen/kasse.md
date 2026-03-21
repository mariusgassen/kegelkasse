---
id: kasse
title: Kasse
sidebar_label: Kasse
---

# Kasse

Die **Kasse** gibt einen vollständigen Überblick über Strafen, Mitgliedskonten und Buchungen — mit Ranking, Gesamtsumme und Exportfunktion.

Navigiere zu **Kasse** (💰) in der Navigation.

## Tabs

Die Kasse ist in vier Reiter unterteilt:

| Tab | Inhalt |
|-----|--------|
| **📊 Übersicht** | Straf-Ranking, Spielsiege, Getränke des aktiven Abends |
| **👤 Konten** | Mitgliedssalden — wer hat noch Schulden? |
| **📋 Buchungen** | Alle Zahlungsbuchungen (Einzahlungen/Abbuchungen) |
| **🧾 Ausgaben** | Vereinsausgaben (z. B. Bahnmiete) |

---

## Übersicht

Die Übersicht zeigt die Daten des aktiven Abends:

| Spalte | Beschreibung |
|--------|-------------|
| **Rang** | Position nach Gesamtbetrag (höchste Strafe = Platz 1) |
| **Spieler** | Name des Spielers |
| **Strafen (€)** | Gesamtsumme aller Strafen in Euro |
| **Spiele** | Anzahl der Spielsiege |
| **Bier** | Anzahl Bierrunden |
| **Schnaps** | Anzahl Schnappsrunden |

Am Ende wird die **Gesamtsumme aller Strafen** angezeigt.

### Export (Text)

Die Kassenübersicht kann als Text exportiert werden:

1. Tippe auf **Teilen** oder **Kopieren**
2. Der Inhalt wird als formatierter Text exportiert (z. B. für WhatsApp oder Notizen)

---

## Kassenbericht (Excel / PDF)

Admins können oben in der Kasse einen vollständigen Kassenbericht herunterladen — als **Excel-Datei (.xlsx)** oder **PDF**.

### Inhalte des Berichts

| Blatt / Abschnitt | Inhalt |
|---|---|
| **Übersicht** | Vereinsname, Zeitraum, Strafen-/Zahlungs-/Ausgaben-Summe, Kassenstand, Abend- und Mitgliederanzahl |
| **Mitglieder-Konten** | Pro Mitglied: Strafen, Einzahlungen, Saldo |
| **Buchungen** | Alle Zahlungen und Ausgaben chronologisch |
| **Strafen nach Person** | Pro Mitglied: Aufschlüsselung nach Strafen-Typ (Anzahl + Betrag) |
| **Strafen nach Abend** | Jede Strafe mit Datum, Abend, Mitglied und Typ |
| **Abende** | Pro Abend: Datum, Ort, Spielerzahl, Spiele, Strafen-Summe, König |

### Bericht herunterladen

1. Öffne die **Kasse** (💰)
2. Wähle oben den **Zeitraum** (Jahr oder gesamter Zeitraum)
3. Wähle das **Format** (Excel oder PDF)
4. Tippe auf **📊 Export**

### Automatischer Bericht vor dem Abend

In **Verein → Einstellungen → Automatische Erinnerungen** kann konfiguriert werden, dass Admins X Tage vor dem nächsten Kegeltermin automatisch eine Push-Benachrichtigung erhalten — als Erinnerung, den Kassenbericht herunterzuladen.

---

## Konten

Der **Konten**-Tab zeigt den aktuellen Saldo jedes Mitglieds.

- **Grün (Guthaben)**: Das Mitglied hat mehr eingezahlt als Strafen angehäuft
- **Rot (Schulden)**: Das Mitglied hat noch ausstehende Beträge
- Das eigene Konto erscheint immer ganz oben

Admins können hier Zahlungen erfassen — siehe [Admin → Mitgliedskonten & Zahlungen](/rollen/admin#mitgliedskonten--zahlungen).

### Suche

Tippe in das **Suchfeld** um Mitglieder schnell zu finden.

---

## Buchungen

Der **Buchungen**-Tab listet alle gebuchten Zahlungen:

- Einzahlungen von Mitgliedern
- Abbuchungen (Vereinsausgaben, Korrekturen)

Mit dem **Suchfeld** lassen sich Buchungen nach Datum, Betrag oder Notiz filtern.

---

## Ausgaben

Vereinsausgaben (z. B. Bahnmiete, Vereinsfahrt) können als eigene Posten erfasst werden:

1. Tippe auf **+ Ausgabe**
2. Gib **Beschreibung** und **Betrag** ein
3. Speichern

Die **Gesamtausgaben** werden separat vom Strafeneingang ausgewiesen.

---

## Bezahllink (PayPal)

Falls der Vereinsadmin einen PayPal.me-Link hinterlegt hat, können Mitglieder direkt aus dem **Profil** ihre Schulden per PayPal begleichen:

1. Öffne das Profil (Avatar oben rechts)
2. Unter **Mein Konto** siehst du deinen Saldo
3. Tippe auf **Jetzt per PayPal überweisen**
4. Melde die Zahlung anschließend über **Zahlung melden**

Der Admin bestätigt die Zahlung manuell — erst dann wird der Saldo aktualisiert.

:::tip
Den PayPal.me-Handle konfiguriert der Admin unter **Verein → Einstellungen**.
:::
