# Roadmap #70 + #71 — Semantische Tokens & Lesbarkeit

Branch: `claude/roadmap-priorities-3grpjd`

## Ausgangslage (gemessen, nicht vermutet)

`resolveThemedBg` (`App.tsx:108`) spiegelt im Hellmodus **nur die Hintergrund-Helligkeit**.
`--kce-primary`, `--kce-secondary` und die sechs hartkodierten `.team-N`-Farben
(`index.css:396-424`) laufen ungeprüft durch. Gemessen gegen den Hell-Hintergrund, den das
Default-Theme ableitet (`#efe9e5`):

| Token | Dunkel | Hell | AA (4.5:1) |
|---|---|---|---|
| `--kce-cream` (Fließtext) | 15,7:1 | 14,5:1 | ✅ |
| `--kce-muted` (Labels, Untertitel, Meta, Nav) | 5,6:1 | **2,78:1** | ❌ |
| `--kce-primary` (jede `.sec-heading`, Beträge, aktiver Tab) | 8,2:1 | **1,84:1** | ❌ |
| `.team-1` grün | 7,5:1 | **2,03:1** | ❌ |
| `.team-5` orange | 8,4:1 | **1,81:1** | ❌ |
| `btn-danger` rot | 4,5:1 | **3,35:1** | ❌ |

Dazu: `bg-kce-amber text-kce-bg` (`.btn-primary`, `.chip.active`) ist im Hellmodus
Amber-auf-Weiß = **1,84:1** — primäre Knöpfe sind unlesbar.

**Regression-Historie:** #49 hob `--kce-muted` bewusst auf `#a08a7e` („~5,6:1 WCAG-AA",
Kommentar in `index.css:56`). `applyBgDerivations` **berechnet** muted aber aus einer Formel
(`mutedL = dark ? 45 : 55`) — der in #55 nachgezogene Hellmodus landete damit wieder bei
2,78:1. Genau deshalb braucht es berechnete Paare statt handgetunter Hex-Werte.

#71 verschärft es: **281** Verwendungen von `text-[9px]`–`text-[11px]` in 36 Dateien
(StatsPage 52, CorrelationSection 34, SchedulePage 23, TreasuryPage 19) plus SVG-`fontSize`
7–10. Sub-12px bei 2,7:1 ist die Kombination — und die Zielgruppe ist ein Kegelverein.

## Plan

### Phase 1 — Kontrast-Engine (rein, testbar)
- [x] `lib/contrast.ts`: `relativeLuminance`, `contrastRatio`, `ensureContrast(fg, bg, target)`
      (hält Hue/Sättigung, wandert Helligkeit vom Hintergrund weg bis AA erreicht),
      `readableOn(bg)` (dunkel/hell je nach besserem Kontrast), `mixOver(fg, bg, pct)`
      (spiegelt `color-mix(in srgb, …, transparent)` für Tint-Hintergründe)
- [x] Vitest: Grenzfälle (bereits konform → unverändert, Weiß auf Weiß, Schwarz auf Schwarz,
      Hue-Erhalt, unmögliche Ziele clampen)

### Phase 2 — Semantische Token-Paare
- [x] `:root`-Defaults + `@theme`-Tailwind-Namen für: `--surface`/`--on-surface`,
      `--surface-2`, `--line`, `--muted`, `--accent`/`--accent-fg`/`--on-accent`,
      `--accent-2`/`--on-accent-2`, `--danger`/`--danger-fg`/`--on-danger`,
      `--positive`/`--positive-fg`, `--team-N`/`--team-N-fg`
- [x] `applyBgDerivations` → `applyDerivedTokens(primary, secondary, bg)`: berechnet **alle**
      Paare kontrastgeprüft; läuft jetzt auch, wenn nur `primary_color` gesetzt ist (vorher
      an `bg_color` gekoppelt — latenter Bug)
- [x] `muted` gegen `surface` (schlechterer der beiden) auf AA prüfen statt fixe Formel
- [x] Verbliebene Hex-Literale auf Tokens: Avatar-Gradient `#c4701a`, `.role-badge-*`,
      `.opener-card` `#3d3540`, `.offline-banner`

### Phase 3 — Accent: Füllung vs. Text trennen (der eigentliche Bug)
- [x] `bg-kce-amber` (50) → `bg-accent`; `border-kce-amber` (23) → `border-accent`
- [x] `text-kce-amber` (65) → `text-accent-fg` (kontrastsicher)
- [x] `text-kce-bg` auf Accent-Füllungen → `text-on-accent`
- [x] Inline `var(--kce-amber)`/`var(--kce-primary)` (104, überwiegend SVG-Striche) →
      `var(--accent-fg)` wo Sichtbarkeit zählt, `var(--accent)` nur für Füllungen
- [x] Neutrale mechanisch umbenennen: `kce-bg`→`canvas`, `kce-surface`→`surface`,
      `kce-surface2`→`surface-2`, `kce-border`→`line`, `kce-cream`→`ink`, `kce-muted`→`muted`
- [x] `--kce-*` ersatzlos entfernen — ein System, keine zwei

### Phase 4 — Typo-Skala (#71)
- [x] Regel: **nie unter 12px**, 14px für Inhalte; Hierarchie über Gewicht/Farbe/Abstand
- [x] `text-[9px]`/`[10px]`/`[11px]` → `text-xs` (12px Boden) bzw. `text-sm` (14px) wo es
      gelesener Inhalt ist (Untertitel, Meta-Zeilen, Werte, Formular-Labels)
- [x] SVG-`fontSize` 7/8/9/10 → 11/12, viewBox-Proportion je Chart prüfen
- [x] Seitenweise: Kasse → Abend → Stats → Rest
- [x] Konvention in CLAUDE.md verankern

### Phase 5 — Verifikation
- [x] Kontrast-Regressionstest: **jedes** Token-Paar in Dunkel **und** Hell gegen AA prüfen
      (der Test, der #49→#55 verhindert hätte)
- [x] Volle Vitest-Suite, `tsc --noEmit`, `eslint`
- [x] CLAUDE.md-Roadmap (#70 ✅, #71 ✅), README, `docs/docs/`, Version-Bump

## Bewusst nicht in diesem Schritt

- **Kiosk-Ansichten auf die `-fg`-Zwillinge umstellen.** `TabletQuickEntryPage`, `CameraCapturePage` und
  `BowlingGame` sind bewusst dunkel-only (#55: Blendschutz am Stativ-Tablet). Die `-fg`-Tokens sind gegen
  den *gethemten* Seitenhintergrund abgeleitet — im Hellmodus also ein dunkles Amber, das auf der dunklen
  Kiosk-Chrome unsichtbar wäre. Sie nutzen daher den rohen `accent`, was ihr heutiges Aussehen exakt
  erhält. Ein eigener, gegen einen festen dunklen Hintergrund abgeleiteter Kiosk-Token-Satz (z. B. per
  `.kiosk`-Scope, der dieselben Namen neu bindet) wäre die saubere Lösung, kostet aber einen Eingriff in
  zwei komplexe Kiosk-Seiten für einen Randfall (Verein wählt eine sehr dunkle Markenfarbe *und* nutzt den
  Kiosk). Als Folgearbeit vermerkt, nicht hier erledigt.
- **`Logo.tsx` / `SpinWheel.tsx`.** Illustrationen mit fester Palette (Kegel-Grafik, Glücksrad-Segmente),
  keine UI-Chrome — #70 nennt explizit nur Avatar-Gradient und Role-Badges.
- **Dichte/Abstände (`p-*`, `gap-*`) systematisch überarbeiten.** #71 nennt „Typo- & Dichte-Pass"; die
  Typo-Seite ist vollständig, die Abstände sind nur dort angepasst, wo der Schriftgrößen-Bump es verlangte
  (Donut-Rendergröße, kleine Heatmap). Ein eigenständiger Spacing-Pass gehört eher zu #72 (Motion/Polish)
  und hätte diesen Diff ohne Lesbarkeitsgewinn verdoppelt.

## Review

**Was der Ausgangszustand wirklich war.** Nicht „Politur", sondern messbar unlesbare UI im Hellmodus.
Gegen den vom Default-Theme abgeleiteten Hell-Hintergrund (`#efe9e5`): Markenfarbe **1,84:1** (jede
`.sec-heading`, jeder Betrag, der aktive Tab, der Text auf `btn-primary`), Sekundärtext **2,78:1**,
Teamfarben **1,8–2,0:1**, und Tailwinds feste Palette, mit der die Kasse Geld malt, bei **2,3:1** (rot)
bzw. **1,45:1** (grün). Dazu 281 Textstellen unter 12px.

**Warum handgetunte Werte das nicht lösen konnten.** #49 hob `--kce-muted` bewusst auf 5,6:1 und
dokumentierte das per Kommentar in `index.css`. #55 fügte den Hellmodus hinzu, der muted aus einer festen
Helligkeitsformel *neu berechnet* — und landete wieder bei 2,78:1. Der Kommentar stand weiter da und war
falsch. Der Raum ist zweidimensional (Vereins-Branding × Hell/Dunkel); ein Punkt darin lässt sich nicht
von Hand wählen. Deshalb werden Tokens jetzt abgeleitet und geprüft, und `contrastContract()` macht die
Zusage explizit und testbar.

**Der eigentliche Bug war eine Doppelrolle.** `--kce-primary` war gleichzeitig Füllfarbe (`btn-primary`,
`chip.active`) und Textfarbe (`sec-heading`, Chart-Striche). Eine Farbe kann nicht beides sein: als Füllung
soll sie die Marke zeigen, als Text muss sie gegen die Seite lesbar sein. Die Aufspaltung in
`accent` / `accent-fg` / `on-accent` ist der Kern der Änderung — der Rest folgt daraus.

**Was der Test gefunden hat, das ich nicht gesehen hätte.** Der Contract-Test schlug beim ersten Lauf fehl
und deckte einen Fehler in *meiner* Ableitung auf: ich hatte gegen den schlechteren von Canvas/Surface
korrigiert, aber die Korrektur kann kippen, *welcher* der schlechtere ist — `ensureContrast` nimmt jetzt
eine Liste von Hintergründen und erfüllt alle gleichzeitig. Der Browser-Audit (Kontrast jedes Textknotens
gegen seinen aufgelösten Hintergrund) fand zwei weitere: den Offline-Banner bei **4,36:1** (ich hatte
`AA_LARGE` angesetzt, aber 12px **bold** ist nach WCAG kein „large text" — das beginnt bei 18,66px) und
den dunklen Stopp des Avatar-Gradienten bei **3,95:1** gegen seine eigene Initiale (Altbestand, gleiches
Problem hatte schon `#c4701a`). Beides wäre beim Code-Lesen nicht aufgefallen.

**Nebenbei gefunden:** Login-Seite und Boot-Splash wendeten das Theme **gar nicht** an (`if (!club) return`
vor dem `applyTheme`-Aufruf) — wer Hellmodus eingestellt hatte, bekam jedes Mal einen dunklen Login. Und
der Strafen-**Donut** rendert 120px aus einer 200-Einheiten-viewBox, sein Mittelwert stand damit bei **6
effektiven px**; SVG-Größen mussten pro Chart gegen ihre viewBox gerechnet werden statt pauschal erhöht.

**Verhaltensänderungen (beabsichtigt):** Im Hellmodus sind Markenfarbe, Teamfarben, Status-Rot/Grün und
Medaillen-Stufen abgedunkelt (Farbton bleibt); Dunkelmodus ist optisch praktisch unverändert. Alle Texte
sind ≥12px, gelesene Inhalte 14px. Der Strafen-Donut ist 150px statt 120px groß. Die Login-Seite folgt
jetzt dem Hell/Dunkel-Modus.

**Verifiziert:** Vitest **2354/2354** grün (37 neue Tests), `tsc --noEmit` clean, `eslint` 0 Fehler,
`npm run build` clean. Zusätzlich Chromium über eine Komponenten-Harness in beiden Modi: **0
Kontrastverstöße**, kleinste gerenderte Schrift **12px** in Dunkel *und* Hell.
