# Feature #74 — 📺 Beamer-/TV-Scoreboard

Branch: `claude/feature-74-8rvl2a`

Read-only Vollbild-Ansicht zum Casten auf TV/Beamer an der Kegelbahn. Kein Login auf dem TV-Gerät,
Zugriff über Secret-Token-Link (Muster wie iCal-Export #24).

## Ausgangslage

- **Es gibt keine unauthentifizierte Ansicht der App.** `App.tsx` rendert `<LoginPage/>` sobald kein
  User da ist, und mountet den Router (#64) erst danach — eine öffentliche Route lässt sich also
  nicht in den Routenbaum hängen, ohne Boot/Auth umzubauen.
- **Der bestehende SSE-Endpoint ist JWT-authentifiziert** (`GET /evening/{eid}/events?token=<JWT>`),
  taugt also nicht für ein Gerät ohne Login. Der `event_bus` selbst (`core/events.py`) ist aber
  wiederverwendbar.
- **Der iCal-Feed (#24) ist das einzige bestehende Public-Token-Muster**: `ClubSettings.extra`
  `ical_token` (uuid4), lazily erzeugt, Linear-Scan über `ClubSettings` beim Auflösen, rotierbar
  über `POST /club/settings/regenerate-ical-token`.
- **Feier-Effekte (#62)** liegen als `lib/celebrate.ts` bereit (Konfetti + Chime, respektiert
  `prefers-reduced-motion` und den Effekte-Schalter).
- **Die Live-Cockpit-Ableitung (#65)** in `lib/liveEvening.ts` ist bewusst am `Evening`-Typ
  aufgehängt — der Scoreboard-Payload ist ein eigener, schlanker Public-Payload (keine
  Treasury-/Mitgliederdaten), also eigene Ableitung.

## Plan

### Backend

- [x] `scoreboard_token` in `ClubSettings.extra` (uuid4), neben `ical_token` lazily erzeugt
      (`_ensure_public_tokens`), in `_serialize_settings` ausgeliefert
- [x] `POST /club/settings/regenerate-scoreboard-token` (admin-only, invalidiert alte Links)
- [x] Neues Modul `api/v1/scoreboard.py` — **öffentlich, Token in der URL**:
      - `GET /scoreboard/{token}` → schlanker Public-Payload (Verein-Branding + aktiver Abend)
      - `GET /scoreboard/{token}/events` → SSE über den bestehenden `event_bus`
- [x] Payload bewusst minimal: Anzeigenamen (Kegelname), laufendes Spiel, Wurf-Historie,
      Strafen-Ranking des Abends, Getränkezähler, letztes Highlight, König. **Keine** Salden,
      keine E-Mails, keine Mitglieder-IDs außerhalb des Abends
- [x] Wurf-Flächen respektieren `throw_tracking_enabled` (#78)

### Frontend

- [x] `lib/scoreboard.ts` (pur): Rotations-Zustandsmaschine, Celebration-Diff (König/Alle Neune),
      Ranking-/Turn-Ableitungen
- [x] `pages/ScoreboardPage.tsx` — Vollbild-Kiosk (dark-only wie `CameraCapturePage`), Riesen-Typo,
      Safe-Area-Insets, Poll + SSE, Vollbild-Feier mit den #62-Effekten
- [x] Mount in `main.tsx` **vor** `<App/>` (Pfad `/tv/<token>`) — umgeht Boot/Auth komplett
- [x] Admin-UI: Karte „📺 TV-Scoreboard" im Verein-Tab (Link, Kopieren, Öffnen, Neu erzeugen)
- [x] i18n-Keys `scoreboard.*` (de + en)

### Tests & Doku

- [x] pytest `tests/test_scoreboard.py`
- [x] Vitest `lib/__tests__/scoreboard.test.ts` + `pages/__tests__/ScoreboardPage.test.tsx`
- [x] `docs/docs/funktionen/tv-scoreboard.md`, README, CLAUDE.md-Roadmap, Version-Bump

## Review

Umgesetzt wie geplant. Drei Entscheidungen, die vom naheliegenden Weg abweichen:

1. **Eigener Public-Payload statt `serialize_evening`.** Der Link ist unauthentifiziert, also wird
   nicht die vollständige Abend-Serialisierung durchgereicht, sondern eine Projektion mit genau dem,
   was ohnehin auf der Tafel im Vereinsheim steht. Nebenbei bleibt der Payload klein genug für einen
   6-Sekunden-Poll auf einem schwachen TV-Browser.
2. **Mount in `main.tsx` statt einer Router-Route.** Der Router (#64) wird von `App` erst nach
   erfolgreicher Authentifizierung gemountet; eine öffentliche Route hätte den Boot-Flow umbauen
   müssen. Die Pfad-Erkennung ist als reine `scoreboardToken()` in `lib/scoreboard.ts` testbar.
3. **`observe()` als Fold statt „letzte Payload merken".** Die eigentliche Fehlerquelle bei
   Feier-Momenten ist nicht das Erkennen, sondern das *Nicht*-Feiern von Historie beim Einschalten
   des Fernsehers — deshalb ein expliziter `seeded`-Flag und mitwandernde Wurf-IDs über
   Spielwechsel hinweg, statt eines Vergleichs mit der jeweils vorigen Antwort.

Bewusst nicht gemacht: eine Fullscreen-API-Automatik (Browser erlauben das nur nach einer
Nutzergeste — auf einem TV ohne Eingabegerät führt das zu einem Knopf, den niemand drückt; der
Browser-Vollbildmodus ist die richtige Ebene dafür und steht in der Doku).

Verifikation: pytest 1003 grün (26 neu), Vitest 2451 grün (47 neu), `npm run build`, `tsc` und
`eslint` (0 Fehler) sauber.
