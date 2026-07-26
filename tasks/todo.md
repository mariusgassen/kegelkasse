# Roadmap #69 — Komponenten-Konsolidierung (+ #73-Affordanzregeln)

Branch: `claude/roadmap-undone-items-ufklre`

Die in CLAUDE.md als Prosa-Konventionen beschriebenen Muster werden echte Komponenten.
Die #73-Regeln (sichtbare Affordanz, keine `title`-Tooltips auf Touch) werden dort direkt
mit angewandt, wo die neuen Komponenten das Muster ohnehin kapseln.

## Bestandsaufnahme

| Muster | Vorkommen heute |
|---|---|
| Avatar (Gradient-Kreis, Bild oder Initiale) | ~8 handgerollte Kopien, 3 Größen, Hex `#c4701a` inline |
| `Ich`-Badge | 23 Kopien, hartkodiertes Deutsch (verletzt die i18n-Konvention) |
| Pin-Icons am Namen | 6 Kopien, alle mit `title={pin.name}` (auf Touch unsichtbar → #73) |
| Mitglieder-Zeile (Avatar + Name + Badges + Subtitle + Trailing) | MembersPage ×2, StatsPage ×3, EveningPage |
| Stat-Kachel (Wert + Label) | `StatBox` (StatsPage-privat) + ~14 Inline-Kopien |
| Aufklappbare Karte (Button + ▲/▼ + `aria-expanded`) | TreasuryPage ×3, CorrelationSection ×2 |
| Bottom-Sheet-Implementierung | `ui/Sheet.tsx` + private Zweitimplementierung in `ProfileSheet.tsx` |

## Plan

### Phase 1 — Geteilte Primitive (`components/ui/`)
- [x] `Avatar.tsx` — Gradient-Kreis, Bild oder Initiale, Größen `sm|md|lg`, `variant="muted"` für Gäste
- [x] `MemberBadges.tsx` — `MeBadge` (i18n) + `PinBadges` + kombiniertes `MemberBadges`, **ohne** `title` (#73)
- [x] `MemberRow.tsx` — Avatar + Kegelname + Badges + Subtitle/Meta + Trailing-Slot; optional tappbar
- [x] `StatTile.tsx` — Wert + Label, `tone`/`size`/`bare`, optional `onClick`
- [x] `ExpandableCard.tsx` — Header-Button + Chevron + `aria-expanded` + Body, un-/kontrolliert

### Phase 2 — Adoption
- [x] `MembersPage` — alle drei Listen (App-Nutzer, Roster, Gäste) → `MemberRow`; 5 weitere Avatare → `Avatar`
- [x] `StatsPage` — `StatBox` + 12 Inline-Kacheln → `StatTile`; Ranking-/Detail-Zeilen → `MemberBadges`/`Avatar`
- [x] `TreasuryPage` — 3 Aufklapp-Muster → `ExpandableCard`, 3 State-Hooks entfallen
- [x] `EveningPage` / `ProtocolPage` — Spieler-Zeilen und Filter-Chips → `MemberBadges`/`PinBadges`
- [x] `ProfileSheet` — Stat-Grids → `StatTile`; private Sheet-Implementierung → geteiltes `<Sheet>`

### Phase 3 — #73-Affordanz (in den berührten Flächen)
- [x] Pin-/König-`title`-Tooltips → `aria-label`
- [x] `Ich` über neuen i18n-Key `common.me` (de „Ich" / en „Me")
- [x] `ProfileSheet` bekommt sichtbaren Schließen-Knopf, Escape und Scroll-Sperre

### Phase 4 — Verifikation
- [x] Vitest: `MemberRow.test.tsx` (16) + `StatTile.test.tsx` (12)
- [x] Bestehende Suiten nachgezogen (`Ich` → `common.me`, `getByTitle` → `getByLabelText`)
- [x] CLAUDE.md-Konventionen + Roadmap #69/#73 + README + docs, Version 1.44.0

## Bewusst nicht in diesem Schritt

- **`ProfileSheet` → echte Route.** Das Roadmap-Ziel dahinter ist „ein Fokus-Management statt zwei" —
  das erreicht die Umstellung auf das geteilte `<Sheet>`. Eine echte Route widerspräche der in #54
  bewusst getroffenen Entscheidung, dass `ProfileSheet` reiner Overlay-State (`profileOpen`) ohne
  Routen-Bindung ist, und würde jeden Aufrufer plus die Legacy-Hash-Übersetzung (#64) anfassen.
- **`<ActionMenu>`** — bereits in #81 als `components/ui/ActionSheet.tsx` geliefert.
- Flächendeckendes Ersetzen aller 92 `nickname || name`-Stellen; nur dort, wo die volle Zeilenform
  tatsächlich passt (sonst reine Churn ohne Nutzen).

## Review

Fünf wiederkehrende Muster sind jetzt Komponenten, und die Konventionen in CLAUDE.md verweisen
darauf statt Verhalten in Prosa zu beschreiben — genau das, was #69 angekündigt hatte.

**Neu in `components/ui/`:** `Avatar`, `MemberBadges` (mit `MeBadge`/`PinBadges`), `MemberRow`,
`StatTile`, `ExpandableCard`. `<ActionMenu>` existierte bereits als `ActionSheet` aus #81 und ist
nur noch in der Konventions-Tabelle ergänzt.

**Was dabei aufgefallen ist:**
- Der `Ich`-Badge war 23× **hartkodiertes Deutsch** — die App verletzte an ihrer meistkopierten
  Stelle ihre eigene i18n-Konvention. Jetzt `common.me`.
- Alle 6 Pin-Icon-Kopien trugen `title={pin.name}`, das auf Touch unsichtbar ist. Jetzt `aria-label`.
- Die App-Nutzer-Zeile der `MembersPage` bildete ihre Avatar-Initiale aus `u.name`, während die
  Roster-Zeile `nickname || name` nutzte. `MemberRow` vereinheitlicht das auf den Kegelnamen.
- `ProfileSheet` hatte eine vollständige zweite Bottom-Sheet-Implementierung (Overlay, Panel,
  Drag-Handle, Fokus-Speicherung) — **ohne** Escape-Handling, Scroll-Sperre und Schließen-Knopf,
  die das geteilte `<Sheet>` längst hatte. Die Kopie ist weg; das Profil hat die drei jetzt.

**Verhaltensänderungen (beabsichtigt):** Profil-Schließen-Knopf/Escape/Scroll-Sperre, Kegelname
als Avatar-Initiale bei App-Nutzern, Pin-/Krone-Namen als Accessible Label statt Hover-Tooltip.

**Bewusst nicht gemacht:** `ProfileSheet` zu einer echten Route (das Roadmap-Ziel „ein
Fokus-Management statt zwei" ist über `<Sheet>` erreicht; eine Route widerspräche der in #54
getroffenen Overlay-Entscheidung und fasste jeden Aufrufer plus die Legacy-Hash-Übersetzung an).
Ebenso kein flächendeckendes Umstellen aller 92 `nickname || name`-Stellen — nur dort, wo die
Zeilenform passt. #73 bleibt deshalb 🚧: die Regel ist verankert und in den berührten Flächen
durchgesetzt, der Rest-Durchgang (`ClubAdminPage`, `SchedulePage`, `GamesPage`; Lucide-vs-Emoji)
steht noch aus.

Verifiziert: volle Vitest-Suite **2315/2315** grün (89 Dateien), `tsc --noEmit` clean,
`eslint` 0 Fehler. Die volle Suite lief hier bewusst lokal, weil der Refactor 18 Dateien quer
durch die App berührt.
