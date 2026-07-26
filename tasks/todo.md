# Feature #72 — Motion-System & View Transitions

Branch: `claude/next-roadmap-feature-jc34kj`

Goal: one shared motion vocabulary instead of one-off keyframes, plus the four things the roadmap
names: View Transitions for shared-element morphs, animated number count-ups for money/scores,
skeleton loading instead of "Lade…" text on lists/cards/charts, and a haptics vocabulary.

## Ausgangslage (gemessen)

- `index.css` hat 8 Keyframe-Blöcke mit je eigener, hartkodierter Dauer (`.22s`, `.18s`, `.12s`,
  `2s`, `3s`) und Easing (`ease`, `ease-out`, zwei verschiedene `cubic-bezier`) — kein geteiltes
  Vokabular, jede neue Animation rät eine neue Zahl.
- Der `prefers-reduced-motion`-Block deckt genau **drei** Klassen ab (`.page-pane`,
  `.animate-slide-up`, `.animate-fade-in`). `bob`, `pop`, `deeplink-flash`, `spin-stop` und die
  `transition`-Eigenschaften laufen auch bei aktivierter Systemeinstellung weiter.
- 20 Ladezustände rendern `<Loading/>` = eine Textzeile „Lade…" — auch dort, wo eine Liste oder ein
  Diagramm nachlädt und die Seitenhöhe danach springt.
- `navigator.vibrate` wird an genau einer Stelle benutzt (`useLongPress`), mit dort eingebauten
  Zahlen (15 / 10) — kein wiederverwendbares Vokabular.

## Plan

- [x] `lib/motion.ts` — Dauer-/Easing-Tokens (JS-Zwillinge der CSS-Custom-Properties),
      `prefersReducedMotion()`, `flourishEnabled()` (Reduced-Motion **und** der 🎉-Schalter aus #62)
- [x] `index.css` — `--motion-*`/`--ease-*`-Properties, bestehende Animationen darauf umgestellt,
      `prefers-reduced-motion`-Block auf **alle** Animationen erweitert
- [x] `lib/haptics.ts` — `haptic('selection' | 'success' | 'warning' | 'error' | 'impact')`, hinter
      dem Effekte-Schalter; `useLongPress` darauf refaktoriert; zentral in `showToast` verdrahtet,
      sodass jeder Erfolgs-/Fehler-Toast der App von einer Stelle aus Feedback bekommt
- [x] `hooks/useCountUp.ts` + `components/ui/CountUp.tsx` — rAF-Tween, eased, rendert den Endwert
      sofort wenn Motion aus ist; adoptiert auf den Kassenstand-Geldfluss-Zahlen, dem eigenen Saldo
      und der Saldo-Kachel des Start-Dashboards
- [x] `components/ui/Skeleton.tsx` — `Skeleton` / `SkeletonRows` / `SkeletonCard` / `SkeletonChart`,
      jeweils eine `role="status"`-Region mit sr-only „Lade…"-Label (Ladezustand bleibt angesagt
      **und** die bestehenden Text-Assertions bleiben gültig); adoptiert an den Listen-/Diagramm-
      Ladezuständen, die vorher `<Loading/>` rendern
- [x] `lib/viewTransition.ts` — `startViewTransition()` als Progressive-Enhancement-Wrapper
      (flushSync, No-op-Fallback ohne Browser-Support oder bei Motion aus) + `morphFrom()`
      Shared-Element-Tagging; `<Sheet morph>` und Adoption an der MembersPage-Zeile → Aktions-Sheet
- [x] Tests: Motion-Tokens, Haptik-Vokabular + Gating, `useCountUp`, Skeleton-a11y-Vertrag,
      View-Transition-Fallback/Shared-Element-Naming, Adoptions-Smoke-Tests
- [x] Doku: `docs/docs/funktionen/`-Seite, README-UI/UX-Katalog, CLAUDE.md-Roadmap-Zeile, Version

## Review

Wie geplant geliefert. Anmerkungen:

- **Zwei Motion-Ebenen statt einer.** Die Roadmap sagt „alles hinter `prefers-reduced-motion` + dem
  🎉-Schalter". Wörtlich genommen würde der Feier-Schalter damit auch **Skeletons** abschalten — die
  sind aber Ladezustand, kein Effekt. Deshalb gatet `prefersReducedMotion()` die strukturelle
  Bewegung (Skeleton-Shimmer, Seiten-/View-Transitions) und `flourishEnabled()` — Reduced-Motion
  **und** Schalter — die Zugaben (Count-ups, Haptik, Shared-Element-Morph). Der Hinweistext des
  Schalters wurde entsprechend erweitert („Konfetti, Sound & Vibration").
- **Skeletons behalten den bisherigen a11y-Vertrag.** Ein rein visuelles Skelett hätte das einzige
  entfernt, was ein Screenreader ansagen konnte, und die sieben bestehenden
  `getByText('action.loading')`-Assertions gebrochen. Jedes Skelett ist deshalb eine
  `role="status"`/`aria-busy`-Region mit visuell verstecktem Label — besser als vorher, und die
  bestehenden Tests blieben aussagekräftig statt um neues Markup herum umgeschrieben zu werden.
- **View Transitions = Lib + eine Adoptionsstelle.** `document.startViewTransition` existiert in
  jsdom nicht, die Tests pinnen daher den Fallback-Pfad sowie Benennung/Aufräumen des
  Shared-Elements statt der Animation. TanStack Router 1.170 hat keine `viewTransition`-Navigate-
  Option, Routenwechsel behalten also die bestehende `.page-pane`-Enter-Animation; der Morph ist
  dort verdrahtet, wo er sich auch als Morph liest (angetippte Zeile wächst zu ihrem Detail-Sheet).
- Bewusst nicht angefasst: `text-orange-400` auf der Kassen-Geldfluss-Zeile „Ausgaben" ist ein
  bestehender Verstoß gegen die Semantik-Token-Regel (#70) und hat mit Motion nichts zu tun — im PR
  vermerkt statt still mitgeändert.
