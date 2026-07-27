# Abend-Ansicht: Menü-Vereinheitlichung, Feedback, lokale Datumsfelder, Achsen-Labels

Branch: `claude/evening-view-ui-fixes-cmqo5l`

## 1. Zeilen-Aktionen im Abend überall als „⋮"-Aktions-Sheet
- [x] ProtocolPage: Strafen-Zeile (✏️ + ✕/Inline-Confirm) → `CardActionMenu` + Bestätigungs-Sheet
- [x] ProtocolPage: Getränkerunden-Zeile (✕) → `CardActionMenu` + Bestätigungs-Sheet
- [x] EveningPage: Abend-Karte (✏️) → `CardActionMenu`, Beenden/Wiedereröffnen bleibt sichtbar
- [x] EveningPage: Team-Zeile (✏️ + 🗑) → `CardActionMenu` + Bestätigungs-Sheet
- [x] EveningPage: Spieler-Zeile (✏️ + ✕/Inline-Confirm) → `CardActionMenu` + Bestätigungs-Sheet
- [x] EveningPage: Highlight-Zeile (✕) → `CardActionMenu` + Bestätigungs-Sheet
- [x] GamesPage: Spiel-Karte (✏️ + 🕐 + ✕/Inline-Confirm) → `CardActionMenu` + Bestätigungs-Sheet
      (Primär-Aktion Start/Beenden/Ergebnis bleibt als beschrifteter Button)

## 2. Rückmeldung beim Neuberechnen der Abwesenheitsstrafen
- [x] Toast mit Ergebnis (Anzahl + Ø) bzw. Hinweis, wenn niemand gefehlt hat
- [x] Ladezustand auf dem Knopf
- [x] Salden-Queries invalidieren (die Berechnung verändert Konten)

## 3. Datumsfelder in lokaler Zeit
- [x] Geteilte Helfer `lib/datetime.ts` (`toDateInput`/`toDateTimeInput`/`dateTimeInputToIso`)
- [x] „Abend beenden" (`useCloseReopenEvening`): Vorbelegung lokal **und** Absenden als tz-bewusstes ISO
- [x] Alle `toISOString().slice(0,10)`-Defaults auf lokal umstellen
      (EveningPage, SchedulePage, HistoryPage, CommitteePage, TreasuryPage, ClubAdminPage, api/client)
- [x] GamesPage/ProtocolPage: lokale Ad-hoc-Helfer durch den geteilten ersetzen

## 4. Achsenbeschriftung in den Statistiken
- [x] `lib/chartAxis.ts`: Textbreiten-Schätzung, dynamische linke Polsterung, kompakte Zahlenformate
- [x] StatsPage `CumulativeChart`: Y-Labels laufen links aus dem Diagramm
- [x] CorrelationSection `ScatterChart`: Y-Labels überlappen den gedrehten Achsentitel
- [x] CorrelationSection `DualAxisLineChart` / `DeltaBarChart`: Y-Labels + überlappende Legendenzeilen
- [x] TreasuryPage `BalanceHistoryChart`: gleicher Defekt, gleicher Helfer

## Review

**1 — Zeilen-Aktionen.** Die Abend-Ansicht fuhr als letzte Ecke der App noch das alte Muster: nackte
✏️/✕-Icons plus einen *inline* „✓ / ✕"-Zweistufer, der sich zudem pro Zeile unterschied (Getränkerunden,
Teams und Highlights löschten sogar ohne jede Rückfrage). Alles auf das seit #81 geteilte
`CardActionMenu` + eigenes Bestätigungs-`<Sheet>` umgestellt. Status-Aktionen (▶ Start / 🏁 Beenden /
✏️ Ergebnis bearbeiten, Abend beenden/wiedereröffnen) bleiben bewusst beschriftete Knöpfe — sie sind der
Hauptweg durch den Abend, keine Zeilen-Verwaltung.

**2 — Abwesenheits-Feedback.** Ladezustand auf dem Knopf, Toast mit Anzahl + Ø bzw. explizitem
„niemand gefehlt". Zusätzlich `member-balances`/`guest-balances` invalidiert — die Berechnung bucht
Strafen und verschob die Konten bislang unsichtbar bis zum nächsten Reload.

**3 — Datumsfelder.** Der gemeldete „Abend beenden"-Dialog war ein *doppelter* Fehler, der sich
zufällig aufhob: Vorbelegung in UTC **und** naiver Feldwert, den das Backend wieder als UTC las. Beides
zusammen korrigiert (sonst hätte ein einseitiger Fix die gespeicherte Zeit verschoben). Der geteilte
`lib/datetime.ts` ersetzt außerdem alle übrigen `toISOString().slice(…)`-Defaults.

**4 — Achsen-Labels.** Ursache war eine fest verdrahtete linke Polsterung (38 bzw. 46 Einheiten) gegen
Labels, die bei vierstelligen Beträgen ~68 Einheiten breit werden. `lib/chartAxis.ts` misst die
Polsterung jetzt aus den Labels und kürzt sie (`€1,2k`). Nebenbei gefunden: die zweizeilige In-Chart-
Legende der Dual-Achsen-Diagramme setzte ihre Zeilen 8 Einheiten auseinander bei 12 Einheiten
Schriftgröße — sie druckten übereinander.

**Verifikation.** Volle Vitest-Suite 2444/2444 grün (41 neue Tests), `tsc --noEmit` sauber,
`npm run lint` 0 Fehler, `npm run build` erfolgreich. Docs, README und die Roadmap-Tabelle (#84) sind
nachgezogen, Version auf 1.50.0 gebumpt.
