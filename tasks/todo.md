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
- [ ] `lib/contrast.ts`: `relativeLuminance`, `contrastRatio`, `ensureContrast(fg, bg, target)`
      (hält Hue/Sättigung, wandert Helligkeit vom Hintergrund weg bis AA erreicht),
      `readableOn(bg)` (dunkel/hell je nach besserem Kontrast), `mixOver(fg, bg, pct)`
      (spiegelt `color-mix(in srgb, …, transparent)` für Tint-Hintergründe)
- [ ] Vitest: Grenzfälle (bereits konform → unverändert, Weiß auf Weiß, Schwarz auf Schwarz,
      Hue-Erhalt, unmögliche Ziele clampen)

### Phase 2 — Semantische Token-Paare
- [ ] `:root`-Defaults + `@theme`-Tailwind-Namen für: `--surface`/`--on-surface`,
      `--surface-2`, `--line`, `--muted`, `--accent`/`--accent-fg`/`--on-accent`,
      `--accent-2`/`--on-accent-2`, `--danger`/`--danger-fg`/`--on-danger`,
      `--positive`/`--positive-fg`, `--team-N`/`--team-N-fg`
- [ ] `applyBgDerivations` → `applyDerivedTokens(primary, secondary, bg)`: berechnet **alle**
      Paare kontrastgeprüft; läuft jetzt auch, wenn nur `primary_color` gesetzt ist (vorher
      an `bg_color` gekoppelt — latenter Bug)
- [ ] `muted` gegen `surface` (schlechterer der beiden) auf AA prüfen statt fixe Formel
- [ ] Verbliebene Hex-Literale auf Tokens: Avatar-Gradient `#c4701a`, `.role-badge-*`,
      `.opener-card` `#3d3540`, `.offline-banner`

### Phase 3 — Accent: Füllung vs. Text trennen (der eigentliche Bug)
- [ ] `bg-kce-amber` (50) → `bg-accent`; `border-kce-amber` (23) → `border-accent`
- [ ] `text-kce-amber` (65) → `text-accent-fg` (kontrastsicher)
- [ ] `text-kce-bg` auf Accent-Füllungen → `text-on-accent`
- [ ] Inline `var(--kce-amber)`/`var(--kce-primary)` (104, überwiegend SVG-Striche) →
      `var(--accent-fg)` wo Sichtbarkeit zählt, `var(--accent)` nur für Füllungen
- [ ] Neutrale mechanisch umbenennen: `kce-bg`→`canvas`, `kce-surface`→`surface`,
      `kce-surface2`→`surface-2`, `kce-border`→`line`, `kce-cream`→`ink`, `kce-muted`→`muted`
- [ ] `--kce-*` ersatzlos entfernen — ein System, keine zwei

### Phase 4 — Typo-Skala (#71)
- [ ] Regel: **nie unter 12px**, 14px für Inhalte; Hierarchie über Gewicht/Farbe/Abstand
- [ ] `text-[9px]`/`[10px]`/`[11px]` → `text-xs` (12px Boden) bzw. `text-sm` (14px) wo es
      gelesener Inhalt ist (Untertitel, Meta-Zeilen, Werte, Formular-Labels)
- [ ] SVG-`fontSize` 7/8/9/10 → 11/12, viewBox-Proportion je Chart prüfen
- [ ] Seitenweise: Kasse → Abend → Stats → Rest
- [ ] Konvention in CLAUDE.md verankern

### Phase 5 — Verifikation
- [ ] Kontrast-Regressionstest: **jedes** Token-Paar in Dunkel **und** Hell gegen AA prüfen
      (der Test, der #49→#55 verhindert hätte)
- [ ] Volle Vitest-Suite, `tsc --noEmit`, `eslint`
- [ ] CLAUDE.md-Roadmap (#70 ✅, #71 ✅), README, `docs/docs/`, Version-Bump

## Review

(wird nach der Umsetzung gefüllt)
