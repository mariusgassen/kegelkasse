---
id: admin
title: Admin
sidebar_label: Admin
---

# Rollen: Vereins-Admin, IT-Admin & Kassenwart

Die Vereinsverwaltung ist in Kegelkasse klar nach Verantwortlichkeiten aufgeteilt, wobei eine Person auch mehrere Rollen gleichzeitig tragen kann:

- **🔑 Vereins-Admin (`admin`)**: Fachliche Vereinseinstellungen, Regelkatalog (Strafentypen, Spielvorlagen, Teams, Nadeln), Mitgliederverwaltung, Rollenvergabe sowie offizielle Beschlussdokumente (Satzung & Geschäftsordnung).
- **🛠️ IT-Admin (`it_admin`)**: Technische Einstellungen und Integrationen (SMTP/E-Mail, Telegram-Bot, KI-Konfiguration, JSON-Konfigurations-Export/Import sowie Erneuerung von iCal- und TV-Scoreboard-Tokens).
- **💰 Kassenwart (`treasurer`)**: Buchungen (Ein-/Auszahlungen, Vereinsausgaben), Zahlungsanfragen, Zahlungserinnerungen, Jahresabschluss, Berichtsexport und Einfrieren von Kassenprüfungen. *(Solange im Verein noch kein Kassenwart ernannt ist, übernimmt der Vereins-Admin diese Aufgaben kommissarisch.)*

---

## Vereinseinstellungen

Die Einstellungen unter **Verein → Einstellungen** sind nach Rolle gegliedert:

- **Allgemein & Betrieb (Vereins-Admin)**:
  - **Vereinsname** und **Spiellokal** (Standardveranstaltungsort) festlegen
  - **Vereinsfarben** (Primär-, Sekundär- und Hintergrundfarbe) sowie **Vereinslogo** anpassen
  - **Vereinslogo als App-Icon** für alle Mitglieder einschalten ([App-Icon](../funktionen/app-icon))
  - **Sonderstrafen & Limits** (Gästestrafen-Limit, Nicht-Absage-Strafe, Nadelstrafe), **Wurf-Erfassung**, **Audio-Ansagen**, **öffentliche Termine** und **PayPal.me-Link** konfigurieren
- **Benachrichtigungen & Integrationen (IT-Admin)**:
  - **E-Mail (SMTP)** und **Telegram-Bot** einrichten und per Testnachricht prüfen
  - **KI-Assistent** (Modelle, Limits, eigene Prompts für Rückblicke) konfigurieren
  - **Konfiguration exportieren/importieren** sowie geheime **iCal- und TV-Scoreboard-Tokens** rotieren

---

## Konfiguration exportieren / importieren (IT-Admin)

Unter **Verein → Einstellungen → Benachrichtigungen & Integrationen → Konfiguration exportieren/importieren** kann der **IT-Admin** die Grundeinrichtung
des Vereins als JSON-Datei sichern oder in einen anderen Verein übernehmen — praktisch, um z. B. einen
Test- oder Staging-Verein mit derselben Einrichtung wie der Live-Verein zu starten.

**Enthalten:** Strafenarten, Spielvorlagen, Vereinsteams, Vereinsnadeln sowie die Grundeinstellungen
(Spiellokal, Vereinsfarben, Gästestrafen-Limit, Sonderstrafen, Standard-Startzeit, Wurf-Erfassung,
Audio-Ansagen).

**Nicht enthalten:** Mitglieder, Kegelabende, Zahlungen, das hochgeladene Logo, der PayPal.me-Handle
sowie die geheimen iCal-/TV-Scoreboard-Links — diese sind persönliche bzw. vereinsspezifische Geheimnisse
und werden nie mit exportiert.

:::danger
Ein **Import ersetzt** die aktuellen Strafenarten, Spielvorlagen, Teams und Nadeln des Zielvereins
vollständig durch die importierte Konfiguration. Mitglieder, Kegelabende und Zahlungen bleiben davon
unberührt. Vor dem Import erscheint ein Bestätigungs-Dialog mit der Anzahl der enthaltenen Einträge.
:::

---

## Mitglieder einladen & Rollen verwalten (Vereins-Admin)

### Einladungslink erstellen

1. Gehe zu **Mitglieder**
2. Tippe beim gewünschten Stammspieler auf **Einladungslink erstellen**
3. Teile den einmaligen Registrierungslink oder QR-Code mit dem Mitglied

:::info
Der Link ist ein Einmaltoken. Nach der Registrierung ist er ungültig.
:::

### Mitglied mit Stammspieler verknüpfen

Wenn ein Benutzeraccount zu einem bestehenden Stammspieler gehört:

1. Gehe zu **Mitglieder**
2. Tippe auf das Mitglied
3. Wähle **Mit Roster verknüpfen** und wähle den passenden Eintrag

Das ermöglicht korrekte Statistiken über alle Abende.

### Vereinsrollen verwalten

1. Tippe unter **Mitglieder** auf ein aktives Mitglied mit Benutzerkonto
2. Wähle **Rollen verwalten**
3. Aktiviere oder deaktiviere die gewünschten Vereinsrollen (**Admin**, **IT-Admin**, **Kassenwart**, **Kassenprüfer**, **Vergnügungsausschuss**, **Zeugwart**)

### Mitglied deaktivieren / reaktivieren

- **Deaktivieren**: Mitglied scheidet aus dem aktiven Spielbetrieb aus; historische Statistiken bleiben erhalten
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
3. Alle verknüpften Daten werden auf den verbleibenden Eintrag übertragen

Übertragen werden gespielte Abende, geplante Gäste-Einträge, Kassen- und Strafeneinträge, Termin-Antworten (RSVPs), Pins sowie die Verknüpfung zum App-Nutzer. Der aufgegebene Eintrag wird danach nur deaktiviert und bleibt so in der Historie sichtbar.

Das funktioniert genauso für **Gäste**: Tippe in der Liste „Bekannte Gäste" auf einen Gast → **Zusammenführen**. Angeboten werden die anderen bekannten Gäste — z. B. um eine per Formular angemeldete und eine manuell angelegte Version derselben Person zusammenzulegen. Bereits gespielte Gäste lassen sich nicht löschen, aber auf diese Weise zusammenführen.

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
