---
id: kasse
title: Kasse
sidebar_label: Kasse
---

# Kasse

Die **Kasse** gibt einen vollständigen Überblick über Strafen, Mitgliedskonten und Buchungen — mit Ranking, Gesamtsumme und Exportfunktion.

Navigiere zu **Kasse** (💰) in der Navigation.

## Tabs

Die Kasse ist in drei Reiter unterteilt:

| Tab | Inhalt |
|-----|--------|
| **📊 Übersicht** | Mein Konto, Kassenstand mit Geldfluss, offene Beträge & Guthaben |
| **👤 Konten** | Mitgliedssalden — wer hat noch Schulden? |
| **📒 Kassenbuch** | Alle Buchungen (Einzahlungen, Auszahlungen, Vereinsausgaben) |

---

## Übersicht

Die Übersicht beantwortet auf einen Blick die zwei wichtigsten Fragen: *Was habe ich bezahlt und was ist noch offen?* und *Wie viel Geld ist wirklich in der Kasse?*

### Mein Konto

Ganz oben steht dein eigenes Konto:

- **Noch zu zahlen** (rot), **Guthaben** (grün) oder **✓ Alles bezahlt**
- Daneben deine Gesamtsummen: **Strafen** und **Bezahlt**
- Ein **Fortschrittsbalken** zeigt, welcher Anteil deiner Strafen bereits bezahlt ist
- Bei offenem Betrag (und hinterlegtem PayPal-Handle): direkt **Jetzt zahlen** (PayPal) oder **Zahlung melden**

### Kassenstand mit Geldfluss

Die Kassenstand-Karte zeigt nicht nur die große Zahl, sondern auch, wie sie zustande kommt:

| Zeile | Bedeutung |
|-------|-----------|
| ⬆ **Eingezahlt (Mitglieder + Gäste)** | Alles, was je real in die Kasse eingezahlt wurde |
| ⬇ **Ausgaben** | Echte Vereinsausgaben (Bahnmiete, Vereinsfahrt, …) |
| ⬆ **Sonstige Einnahmen** | Nur sichtbar, wenn vorhanden — Einnahmen, die über das Ausgaben-Konto verbucht wurden (z. B. Sponsoring, Zuschuss), statt als Mitgliedseinzahlung |
| 💰 **Kassenstand** | Eingezahlt minus Ausgaben plus Sonstige Einnahmen — echtes Geld in der Kasse |
| 🔴 **Noch nicht bezahlt (offen)** | Schulden, die der Kasse noch fehlen (Mitglieder + Gäste) |
| → **Kassenstand, wenn alle zahlen** | Kassenstand plus offene Beträge |

Offene Strafen zählen also erst **nach Bezahlung** zum Kassenstand — vorher erscheinen sie unter „Noch nicht bezahlt".

Jede Zeile lässt sich **antippen**, um die zugrunde liegenden Buchungen aufzuklappen (z. B. wer wie viel eingezahlt hat, welche einzelnen Ausgaben-Posten die Summe ergeben, oder wer noch offene Beträge hat) — ohne in den Kassenbuch-Tab wechseln zu müssen.

### Wie funktioniert die Kasse?

Direkt unter dem Kassenstand erklärt eine aufklappbare Karte (❓) das Modell in vier Sätzen: Strafen erzeugen offene Beträge, Einzahlungen senken sie (Saldo = Bezahlt − Strafen), der Kassenstand ist echtes Geld, Guthaben wird mit künftigen Strafen verrechnet.

### Offen & Guthaben

Darunter folgen zwei Kennzahl-Karten (Summe offener Beträge / Summe Guthaben) und die Listen der Mitglieder mit offenen Beträgen bzw. Guthaben. Jede Zeile zeigt **Strafen**, **Bezahlt** und den Fortschrittsbalken (bezahlter Anteil der Strafen) — so ist sofort greifbar, wie weit jedes Konto vom Ausgleich entfernt ist.

Mitglieder mit exakt ausgeglichenem Saldo (weder Schuld noch Guthaben) erscheinen nicht als eigene Zeile, sondern als **„+ N ausgeglichen"**-Zeile darunter. Antippen klappt eine Pille-Liste der betroffenen Mitglieder auf (eigenes Konto zuerst, **Ich**-Badge) — vorher war diese Zahl nicht aufklappbar und man musste in den **Konten**-Tab wechseln, um zu sehen, wer damit gemeint ist.

### Nach Spielern filtern

Direkt über den beiden Kennzahl-Karten lässt sich **🔍 Nach Spielern filtern** aufklappen. Damit lassen sich die Summen und Listen darunter auf eine Auswahl von Mitgliedern eingrenzen — z. B. um zu sehen, wie der offene Betrag ohne bestimmte Spieler aussähe (etwa wenn diese den Verein bald verlassen könnten):

1. Tippe auf **🔍 Nach Spielern filtern**, um die Karte aufzuklappen
2. Wähle über die Mitglieder-Pillen ein oder mehrere Mitglieder aus (eigenes Konto zuerst, **Ich**-Badge)
3. Sobald mindestens ein Mitglied ausgewählt ist, erscheint ein Umschalter mit zwei Modi:
   - **Ohne Auswahl**: bereits Bezahltes der ausgewählten Mitglieder bleibt in der Berechnung, ihre offenen Strafen zählen aber nicht mehr mit (werden als nie einziehbar abgeschrieben)
   - **Nur Auswahl**: die Summen und Listen zeigen ausschließlich die ausgewählten Mitglieder

Der Filter wirkt nur auf die „Offen & Guthaben"-Kacheln und -Listen in der Übersicht — der Kassenstand oben (echtes Geld in der Kasse) und der Konten-Tab bleiben unverändert.

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

## Verlauf (Saldo-Graph)

In der **Übersicht** zeigt der Abschnitt **📈 Verlauf** den Saldo-Verlauf als Linien-Diagramm:

- **🏛️ Kasse / 👤 Mitglied** — Umschalter zwischen dem gesamten Vereinssaldo und dem persönlichen Konto eines beliebigen Mitglieds. Bei „Mitglied" erscheint eine Pille-Liste aller Mitglieder (eigenes Konto ganz oben, mit **Ich**-Badge).
- **Monat / Jahr / Alle** — drei Zeit-Ansichten. Bei Monat/Jahr blättern Pfeile (‹ ›) zum vorherigen/nächsten Zeitraum (deaktiviert am Rand der verfügbaren Daten). Bei „Alle" ist das Diagramm horizontal scrollbar, die Y-Achse bleibt fixiert. Bei Monat/Jahr zeigt die Y-Achse jetzt ebenfalls €-Beschriftungen (vorher nur bei „Alle" sichtbar).
- **X-Achse geclustert statt zeitproportional:** In der Monats-Ansicht werden Punkte auf den jeweiligen Kalendertag (= Kegelabend) gruppiert und die aktiven Tage gleichmäßig über die Breite verteilt, statt proportional zur verstrichenen Zeit im Monat — bei wenigen Buchungen in einem Monat verteilten sich Punkte vorher stark ungleichmäßig (großer Leerraum um vereinzelte Ereignisse). In der Jahres-Ansicht wird analog auf den Kalendermonat geclustert (bis zu 12 gleichmäßige Stützpunkte); die X-Achsen-Beschriftung zeigt dort den Kurznamen des Monats statt des Tagesdatums.
- Zwei Linien laufen parallel:
  - **Kasse:** „Tatsächlich" (durchgezogen) — die real gebuchten Zahlungen/Ausgaben; „Inkl. Schulden" (gestrichelt) — zusätzlich die zum jeweiligen Zeitpunkt offenen Schulden, zeigt den „virtuellen" Saldo, wenn alles bezahlt wäre.
  - **Mitglied:** „Eingezahlt" (durchgezogen) — die Summe der tatsächlich geleisteten Zahlungen; „Saldo" (gestrichelt) — der Kontostand nach Abzug der verbuchten Strafen. Vorher hießen beide Linien in der Mitglied-Ansicht „Tatsächlich"/„Inkl. Strafen", was ohne Kasse-Kontext wenig aussagekräftig war.
- Die kumulative Kurve ist durchgehend: Blättern zwischen Monaten/Jahren setzt den Saldo nie auf Null zurück.
- **Punkte antippen** zeigt Datum, Art (💰 Zahlung, 💸 Ausgabe, ⚠️ Strafe) und Betrag der zugrunde liegenden Buchung, sowie darunter den daraus resultierenden Saldo (beide Linien jeweils kumulativ). Schulden-Stützpunkte sind reine Hintergrund-Information und nicht antippbar.

---

## Gäste & Kostenübertragung

Gäste werden in der **Übersicht** unter „👤 Gäste ausstehend" separat geführt. Neben dem üblichen **Begleichen**-Knopf finden Admins dort die Aktion **↪️ Übertragen**:

1. Tippe bei einem Gast-Eintrag auf **↪️ Übertragen**
2. Wähle das **Mitglied**, das die Kosten übernimmt
3. Der Betrag ist mit dem offenen Saldo des Gastes vorbelegt — bei Bedarf anpassen (z. B. für eine teilweise Übernahme)
4. Optional eine Notiz hinzufügen (z. B. „übernimmt Bier-Runde")
5. **Übertragen** bestätigen

Damit werden zwei verknüpfte Buchungen erstellt: dem Gast wird der Betrag gutgeschrieben (Konto auf 0), das Mitglied wird in derselben Höhe belastet. Beide Buchungen tragen Notizen, die aufeinander verweisen. **Statistiken und Strafenlog bleiben unverändert** — nur die Kasse wird umgebucht.

---

## Konten

Der **Konten**-Tab zeigt den aktuellen Saldo jedes Mitglieds.

- **Grün (Guthaben)**: Das Mitglied hat mehr eingezahlt als Strafen angehäuft
- **Rot (Schulden)**: Das Mitglied hat noch ausstehende Beträge
- Das eigene Konto erscheint immer ganz oben

Admins können hier Zahlungen erfassen — siehe [Admin → Mitgliedskonten & Zahlungen](/rollen/admin#mitgliedskonten--zahlungen).

:::info Guthaben ist kein „freies" Kassengeld
Hat ein Mitglied Guthaben (mehr eingezahlt als Strafen), zählt dieser Betrag zwar zum Kassenstand (es ist reales, eingezahltes Geld), ist der Kasse aber im übertragenen Sinn „geschuldet" — er wird automatisch mit künftigen Strafen verrechnet (bzw. bei Austritt ausgezahlt). Es ist also kein frei verfügbares Vereinsgeld.
:::

### Übersicht & Anteil pro Spieler

Oben im Konten-Tab zeigen zwei Kacheln die Summen über alle Konten: **Offen gesamt** (Summe aller Schulden) und **Bezahlt gesamt** (Summe aller Einzahlungen); ist darin Guthaben enthalten, weist ein Hinweis darauf hin, dass dieser Anteil der Kasse geschuldet ist.

Darunter lässt sich **📊 Anteil pro Spieler** aufklappen: ein Balkendiagramm zeigt für jedes Mitglied den bezahlten (grün) und offenen (rot) Anteil seiner Strafen, im Verhältnis zum Mitglied mit den höchsten Strafen — so ist auf einen Blick erkennbar, wer am meisten zur offenen Summe beiträgt.

### Suche

Tippe in das **Suchfeld** um Mitglieder schnell zu finden.

---

## Kassenbuch (Buchungen)

Der **Kassenbuch**-Tab listet alle Buchungen chronologisch:

- Einzahlungen und Auszahlungen von Mitgliedern
- Vereinsausgaben und sonstige Einnahmen (z. B. Bahnmiete, Vereinsfahrt)

Mit dem **Suchfeld** lassen sich Buchungen nach Name, Notiz oder Beschreibung filtern.

Admins erfassen neue Posten über **+ Buchung**: Ziel wählen (🏛️ Verein oder ein Mitglied), Richtung (Einnahme/Ausgabe bzw. Einzahlung/Auszahlung), Betrag, Notiz und ein Datum (zum Nachtragen vergangener Buchungen).

### Buchung bearbeiten oder stornieren

Admins können jede Buchung nachträglich korrigieren oder entfernen:

- **✏️ Bearbeiten** öffnet ein Sheet mit den aktuellen Werten: Richtung, Betrag, Notiz/Beschreibung und Datum lassen sich ändern — sowohl bei Vereinsbuchungen als auch bei Mitglieder-Zahlungen. Bearbeitete Buchungen sind im Kassenbuch mit einem kleinen ✏️ neben dem Datum markiert; das betroffene Mitglied erhält bei einer Betragsänderung eine Push-Benachrichtigung.
- **✕ Stornieren** entfernt die Buchung (Soft-Delete mit optionalem Grund) — sie bleibt für die Nachvollziehbarkeit in der Datenbank erhalten, zählt aber nicht mehr zu Salden und Kassenstand.

Bearbeiten ist auch in der Zahlungs-Historie eines Mitgliedskontos (Tab **Konten**, Zeile aufklappen) möglich.

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
