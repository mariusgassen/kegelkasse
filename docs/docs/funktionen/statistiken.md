---
id: statistiken
title: Statistiken
sidebar_label: Statistiken
---

# Statistiken

Die **Statistiken** bieten ein Jahresranking für alle Stammspieler des Vereins sowie persönliche Jahresauswertungen im eigenen Profil.

## Jahresranking

Navigiere zu **Statistiken** (📊) in der Navigation.

### Ansicht

- Wähle das **Jahr** über den Jahresauswähler oben
- Alle Stammspieler werden mit ihren Jahreswerten angezeigt
- Die Balken visualisieren den relativen Vergleich zwischen Spielern

### Kennzahlen

| Kennzahl | Beschreibung |
|----------|-------------|
| **Abende** | Anzahl besuchter Kegelabende |
| **Strafen (€)** | Gesamtsumme aller Strafen in Euro |
| **Strafenpunkte** | Anzahl der Strafeneinträge (unabhängig vom Betrag) |
| **Siege** | Anzahl gewonnener Spiele |
| **Bier** | Anzahl Bierrunden |
| **Schnaps** | Anzahl Schnappsrunden |

### Auf-/Zuklappen

Einzelne Spieler können ein- und ausgeklappt werden, um die Detailwerte zu sehen oder die Übersicht zu komprimieren.

## Abend-Detail

Über die Abend-Auswahl oben auf der Statistik-Seite lässt sich ein einzelner Abend analysieren:

- **Donut-Diagramm**: Strafenverteilung pro Spieler (anwesend/abwesend)
- **🍺 / 🥃-Karten**: Öffnen die Getränke-Runden-Übersicht
- **🏆 Spiele-Karte**: Öffnet die **Spiele & Ergebnisse**-Übersicht mit Status, Sieger, Punkten und Wurf-Statistik je Spiel
- **Verlauf-Chart**: Kumulative Strafen- und Getränke-Kurve pro Spieler. Punkte auf der Strafenkurve können angetippt werden, um die zugehörige Einzelstrafe (Zeit, Spieler, Typ, Betrag) einzublenden
- **Hall of Fame**: Auszeichnungen wie StrafenkaiserIn, Bier-Champ, Spiele-KönigIn

## Strafen × Getränke-Korrelation

Im Jahresrückblick gibt es eine eigene Korrelations-Sektion mit vier Tabs, die untersuchen, wie Strafen und Getränke (Bier + Schnaps zusammen) zusammenhängen.

- **Pro Abend**: Streudiagramm — ein Punkt pro Abend des gewählten Jahres. X-Achse = Strafen (€), Y-Achse = Getränke-Runden. Eine gestrichelte Trendlinie und ein Pearson-*r*-Badge zeigen, ob strafenreiche Abende auch mehr Runden bedeuten.
- **Pro Mitglied**: Streudiagramm — ein Punkt pro Mitglied. X = Gesamt-Strafen, Y = Gesamt-Getränke, Punktgröße = besuchte Abende. Der eigene Punkt ist hervorgehoben.
- **Korrelations-Stärke**: Pro Mitglied wird Pearson *r* über alle besuchten Abende berechnet (Strafen vs Getränke an dem Abend) und als Balken dargestellt. Mitglieder mit weniger als 3 Abenden erscheinen unten als Hinweis.
- **Verlauf an einem Abend**: Für einen ausgewählten Abend und ein Mitglied wird die kumulierte Strafen- und Getränke-Kurve in 5-/15-/30-Minuten-Bins gezeigt (zwei Y-Achsen). Das *r* der Veränderungen zwischen den Bins gibt einen Hinweis darauf, ob ein Mitglied im Lauf eines Abends gleichzeitig zu Strafen und Runden neigt.

Werte:

- *r* ≥ 0.5 → starker Zusammenhang (grün)
- 0.2 ≤ *r* < 0.5 → mittlerer Zusammenhang (amber)
- |*r*| < 0.2 → schwacher Zusammenhang
- Zu wenige Datenpunkte (< 3 Abende/Bins) → kein *r* berechnet

## Persönliche Statistiken

Im **Profil** (Profilsymbol oben rechts) sind die eigenen Jahresstatistiken einsehbar:

- Eigene Werte für das aktuelle Jahr
- Direkter Vergleich mit den eigenen Vorjahreswerten

## Datengrundlage

Die Statistiken basieren auf:
- **Stammspieler-Verknüpfungen**: Nur Spieler, die mit einem Stammspieler-Eintrag verknüpft sind, erscheinen in den Statistiken
- **Abgeschlossene Abende**: Nur Daten aus geschlossenen Abenden fließen ein
- **Nicht gelöschte Einträge**: Weich-gelöschte Spiele und Strafen werden nicht gezählt

:::tip
Um sicherzustellen, dass alle Spieler in den Statistiken erscheinen, sollten Abende immer mit verknüpften Stammspielern gespielt werden. Die Verknüpfung erfolgt beim Hinzufügen eines Spielers zum Abend.
:::
