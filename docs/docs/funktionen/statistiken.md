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
- **Verlauf-Chart**: Kumulative Strafen- und Getränke-Kurve pro Spieler. Punkte auf der Strafenkurve können antippbar — sie blenden die zugehörige Einzelstrafe (Zeit, Spieler, Typ, Betrag) ein
- **🌡️ Spuren pro Spieler**: Direkt unter den Verlaufs-Kurven; eine horizontale Spur pro aktivem Spieler. Hintergrund-Zellen pro Zeitfenster werden amber eingefärbt (heller → kühl, dunkler → heiß), je nach Strafen-€-Spitze; eine orange Linie zeigt die aufgelaufene Getränkezahl. Steigt die Linie durch heiße Zellen, fielen Strafen und Trinken zusammen. Zeitfenster über Pills 5 / 15 / 30 Min umschaltbar
- **Hall of Fame**: Auszeichnungen wie StrafenkaiserIn, Bier-Champ, Spiele-KönigIn

## Strafen × Getränke-Korrelation

Im Jahresrückblick gibt es eine Korrelations-Sektion mit drei Tabs, die untersuchen, wie Strafen und Getränke (Bier + Schnaps zusammen) zusammenhängen. Abende ohne Getränkerunden werden überall im Jahresrückblick herausgefiltert (Datenlücke statt echter Null-Beobachtung); der Pearson *r* wird aus den verbleibenden Abenden frontendseitig neu berechnet.

- **Korrelations-Stärke** (Standard-Tab): Pro Mitglied wird Pearson *r* über alle besuchten Abende berechnet (Strafen vs Getränke an dem Abend) und als **diverging Balken auf einer signierten −1…+1-Skala** dargestellt — positive *r*-Werte füllen nach rechts (grün), negative nach links (rot), |*r*|&nbsp;&lt;&nbsp;0,2 bleibt muted in der Mitte. Die Zahl rechts wird mit Vorzeichen angezeigt (z. B. `+0.74`, `−0.31`). Sortiert nach signiertem *r* (stärkster positiver Zusammenhang oben). Mitglieder mit weniger als 3 Abenden erscheinen unten als Hinweis.
- **Pro Abend**: Streudiagramm — ein Punkt pro Abend des gewählten Jahres. X-Achse = Strafen (€), Y-Achse = Getränke-Runden. Eine gestrichelte Trendlinie und ein Pearson-*r*-Badge zeigen, ob strafenreiche Abende auch mehr Runden bedeuten. Direkt darunter eine konkrete, vergleichbare Zahl: das **Trinkrate-Badge „Getränke pro € Strafe im Jahr"** (Summe Getränke / Summe Strafen-€ über alle berücksichtigten Abende). Darunter eine **Saison-Kumulativ-Linie** (kumulierte Strafen & Getränke über alle Abende des Jahres), eine Plain-Language-Zusammenfassung („Pro +1 € Strafe ≈ +X Getränke") sowie ein Quartil-Vergleich der strafenreichsten 25 % vs ruhigsten 25 % Abende und — ab 10 Abenden — ein **Top-5 vs ruhigste 5 Streak-Vergleich** in absoluten Zahlen.
- **Pro Mitglied**: Streudiagramm — ein Punkt pro Mitglied **und** Abend, farbcodiert pro Mitglied. Über eine Pill-Legend (im app-weit einheitlichen `chip`-Stil) lässt sich auf ein einzelnes Mitglied fokussieren; im Fokus erscheint zusätzlich eine Trendlinie und der persönliche Pearson *r*.

Direkt in der **Abend-Detail-Sektion** (oben auf der Statistik-Seite, abhängig vom gewählten Abend) erscheint zusätzlich das Panel **Strafen × Getränke (Verlauf)**: Pill-Picker für Mitglied (inklusive „**Alle**"-Pill als Standard für den Vergleich) und Zeitfenster (5 / 15 / 30 Min).

- Im **Vergleichs-Modus** („Alle" ausgewählt) stapelt das Panel eine **Heat-Lane** pro Mitglied: Hintergrund-Zellen pro Zeitfenster werden amber je nach Strafen-€-Spitze eingefärbt (heller → kühl, dunkler → heiß), während eine orange Linie die aufgelaufenen Getränke („Rausch-Pegel") über den Abend hinweg darstellt. Wenn die Getränke-Linie durch heiße Zellen steigt, fallen Trinken und Strafen zusammen — sofort am Bild ablesbar.
- Tap auf eine Lane (oder ein Mitglied-Pill) öffnet den **Fokus-Modus**: kumulierte Strafen-/Getränke-Kurve (Dual-Axis-Line), ein Δ-Bar-Chart pro Zeitfenster und das Pearson *r* der Veränderungen — als Hinweis darauf, ob das Mitglied im Laufe des Abends gleichzeitig zu Strafen und Runden neigt.
- **Trinkrate-Badge** (Getränke pro € Strafe): Im Vergleichs-Modus zeigt sie den Abendsschnitt, im Fokus-Modus die persönliche Rate inklusive ±%-Vergleich zum Abendsschnitt (z. B. „+34 % mehr Getränke pro € Strafe als der Abendsschnitt") und einer ausklappbaren Klartext-Erklärung. Damit gibt es neben dem abstrakten Pearson *r* eine konkrete, vergleichbare Zahl pro Abend bzw. pro Person.

Die Pearson-*r*-Badge zeigt zusätzlich eine Klartext-Interpretation an: positiv = „Mehr Strafen → mehr Getränke (gleichläufig)", negativ = „Mehr Strafen → weniger Getränke (gegenläufig)", nahe 0 = „Kein klarer Zusammenhang". Über den „Was bedeutet das?"-Link lässt sich eine ausführlichere Erklärung des Werte-Bereichs (−1 bis +1) und der Faustregel (±0,2 mittel, ±0,5 stark) ausklappen.

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
