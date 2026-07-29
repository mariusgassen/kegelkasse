# Feature #65 abschließen: Würfe im Live-Ticker

Branch: `claude/feature-65-contents-r7pg7c`

Feature #65 („Abend-Modus / Live-Takeover") stand auf 🚧 mit zwei bewusst zurückgestellten Punkten:

1. **Würfe / „Alle Neune" im chronologischen Ticker** — zurückgestellt, weil das API keinen
   Zeitstempel pro Wurf lieferte und ein Ticker ohne Zeitstempel eine erfundene Reihenfolge zeigen
   würde. → *wird jetzt geliefert*
2. **Bottom-Nav-Reduktion auf „Abend / Rest der App"** → *durch #79 bereits erledigt*: die primäre
   Navigation ist auf 4 permanente Tabs plus den kontextuellen 🏆 Abend-Tab (nur bei laufendem
   Abend, #78) reduziert. Kein offener Rest — wird in der Roadmap als erledigt vermerkt statt
   nochmal angefasst.

## 1. Zeitstempel pro Wurf (Backend)
- [x] `GameThrowLog.created_at` existiert bereits (`server_default=func.now()`) — **keine Migration nötig**
- [x] `serialize_evening` (`evenings.py`) gibt `created_at` pro Wurf aus
- [x] pytest: Wurf-Serialisierung enthält den Zeitstempel

## 2. Ticker um Wurf-Meilensteine erweitern (Frontend)
- [x] `types.ts`: `GameThrowLog.created_at`
- [x] `lib/liveEvening.ts`: neue Event-Art `throw`, Signatur auf Options-Objekt (`{limit, throws}`)
- [x] **Bewusst nur Meilensteine (Alle Neune, `pins >= 9`), nicht jeder Wurf** — ein Abend hat
      hunderte Würfe, der volle Strom würde Strafen/Getränke/Highlights innerhalb einer Minute aus
      dem gedeckelten Ticker drängen; der laufende Wurf-Stand steht weiterhin in der Anzeigetafel
- [x] Würfe ohne parsbaren Zeitstempel werden übersprungen (Altbestand/Offline) statt auf ts=0 zu fallen
- [x] `LiveEveningView`: Wurf-Events über `useThrowTracking()` gegated (#78), Alle-Neune-Zeile hervorgehoben
- [x] i18n `live.allNine` (de + en)

## 3. Tests
- [x] Vitest `liveEvening.test.ts`: Alle-Neune-Event, normale Würfe bleiben draußen, Gating,
      fehlender Zeitstempel, chronologische Einsortierung, Options-Signatur
- [x] Vitest `LiveEveningView.test.tsx`: Alle-Neune-Zeile sichtbar / bei abgeschalteter Wurf-Erfassung nicht
- [x] pytest `test_games.py`: `created_at` in der Wurf-Serialisierung

## 4. Doku
- [x] Roadmap #65 auf ✅ + Nachtrag, README, `docs/docs/`
- [x] Version-Bump (MINOR)

## Review

**Gemacht:** Der Live-Ticker zeigt jetzt „🎳 Alle Neune"-Momente chronologisch zwischen Strafen,
Getränkerunden und Highlights. Möglich wurde das durch einen Einzeiler im Backend — die Spalte
`game_throw_log.created_at` gibt es seit Migration 038, sie wurde nur nie ausgeliefert. Die
ursprüngliche Begründung für das Zurückstellen („das API liefert keinen Zeitstempel") war also
halb richtig: das Feld fehlte in der Serialisierung, nicht in der Datenbank.

**Die eigentliche Entscheidung** war keine technische, sondern eine Produktfrage: „Würfe im
Ticker" wörtlich zu nehmen hätte den Ticker zerstört. Ein Kegelabend erzeugt hunderte Würfe; bei
einem auf 30 Einträge gedeckelten Verlauf wäre nach einem einzigen Spiel nichts anderes mehr
sichtbar. Der Ticker beantwortet „was ist gerade passiert", die Anzeigetafel „wie steht es" —
deshalb kommen nur Meilensteine in den Ticker.

**Zweiter Punkt:** Die Nav-Reduktion war durch #79 bereits erledigt (4 permanente Tabs +
kontextueller Abend-Tab) und wurde nur noch dokumentiert, nicht erneut implementiert.

**Verifikation:** pytest `tests/test_games.py -k Throw` 9 grün (inkl. neuem Serialisierungs-Test),
Vitest liveEvening/LiveEveningView/EveningHubPage/i18n 89 grün, `tsc --noEmit` und `eslint` ohne
Fehler.
