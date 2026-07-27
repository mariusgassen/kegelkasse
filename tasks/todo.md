# Feature #73 — Icon-Sprache & Touch-Affordanz-Audit (abschließen)

Branch: `claude/next-roadmap-item-iywyk3`

Das Feature steht seit #69 auf 🚧: die Regel ist als Konvention in CLAUDE.md verankert
(„Touch affordance"), und die in #69 konsolidierten Komponenten (`MemberRow`, `PinBadges`) halten
sie bereits ein. Offen ist der flächendeckende Durchgang durch den Rest der App.

## Ausgangslage (gemessen)

Skript-Scan über `frontend/src/**/*.tsx` (ohne Tests):

- **25 `title`-Tooltips auf nativen DOM-Elementen.** Auf einem Touch-Gerät — und dort läuft diese App
  — gibt es keinen Hover, der Text ist also schlicht unsichtbar. Die meisten davon sind der *einzige*
  Hinweis, was der Knopf tut.
- **~20 icon-only Bedienelemente ohne Accessible Name** (`✕`, `+`, `✏️`, `👥`, `🎲`, `💬`, `+😀`,
  `×`, `↩`, `🖼`) — für einen Screenreader entweder namenlos oder als Emoji-Beschreibung vorgelesen.
- **5 hartkodierte Strings** statt `t()`: `"Reaktion hinzufügen"` (2×), `"Kommentare"`,
  `"Eröffnungsspiel"`, `aria-label="Close"` — Verstöße gegen die i18n-Konvention, gefunden weil der
  Audit ohnehin jede dieser Stellen anfasst.
- **Ein 16px-Tap-Target** (`MediaUploadButton` Entfernen-Knopf, `w-4 h-4`).
- **Drei-Icon-Cluster** in `SchedulePage` (👥 ✏️ ✕) und `ClubAdminPage`-Superadmin (✏️ ×) — genau
  das Muster, das #51/#81 schon zweimal in ein ⋮-Menü aufgelöst haben.

## Regel (aus CLAUDE.md, hier durchgesetzt)

**Lucide für Bedienelemente** (Buttons, Tabs, Aktionen — nie ohne Accessible Name),
**Emoji für Inhalte** (Strafenarten, Badges, Feier-Momente = die Persönlichkeit der App).
Kein `title` auf etwas Anfassbarem. Bedeutungstragendes Emoji, das kein Bedienelement ist, wird
`role="img"` + `aria-label`.

## Plan

- [x] `title` von jedem interaktiven Element entfernen → `aria-label` (icon-only) bzw. sichtbares Label
- [x] Icon-Cluster in ⋮-Menüs auflösen (`CardActionMenu` aus #81): SchedulePage-Termin-Zeile,
      ClubAdminPage-Superadmin-Vereins-Zeile
- [x] Chrome-Icons auf Lucide umstellen: Schließen, Kommentar-Umschalter, Reaktion-hinzufügen,
      Medien-Anhang, Kamera
- [x] Bedeutungstragende Nicht-Bedien-Emoji: `role="img"` + `aria-label` (✏️-Bearbeitet-Marker in der
      Kasse, 👑-Eröffnungsspiel, Spielstand-Kachel)
- [x] Erklärungs-Tooltip auf deaktiviertem Knopf → sichtbarer Hinweistext (`evening.alreadyActive`)
- [x] Hartkodierte Strings auf i18n-Keys, neue Keys in `de.ts` **und** `en.ts`
- [x] Tap-Target `MediaUploadButton` vergrößern
- [x] Regressions-Schutz: Test, der die Codebase scannt und bei neuem `title` auf einem
      interaktiven Element bzw. neuem namenlosen icon-only Button fehlschlägt
- [x] Tests der berührten Komponenten nachziehen (`getByTitle` → `getByLabelText`, ⋮-Flow)
- [x] Doku: `docs/docs/`, README, CLAUDE.md-Roadmap-Zeile auf ✅, Version

## Review

Geliefert wie geplant, mit drei Abweichungen und einem echten Fehlschlag unterwegs.

- **Der Lint-Test ist der eigentliche Deliverable, nicht der Durchgang.** Ein einmaliges Aufräumen
  hält bis zum nächsten Feature — die Roadmap-Zeile sagt selbst, dass #51/#52/#58–61 dieselbe
  Lektion viermal gelernt haben. `src/__tests__/iconAffordance.test.ts` scannt jetzt jede `.tsx`
  und schlägt fehl bei (a) `title=` auf einem nativen Element und (b) einem Button, dessen einziger
  sichtbarer Inhalt ein Icon/Emoji ohne `aria-label` ist. Beide Regeln haben eine kommentierte
  Ausnahmeliste — eine bewusste Ausnahme soll dokumentiert werden, nicht stillschweigend
  durchrutschen.

- **Die erste Fassung des Tests war wertlos und lief trotzdem grün.** Sie parste JSX-Tags per
  Regex. JSX-Attribute enthalten aber sowohl verschachtelte Klammern als auch `>`
  (`onClick={() => {}}`), sodass jedes `[^>]*`-Attributmuster den Tag mitten im Handler beendet und
  ihn still überspringt. Aufgefallen ist das nur, weil ich eine absichtliche Verletzung eingebaut
  und geprüft habe, ob der Test sie fängt — tat er nicht. Der jetzige klammern- und
  quote-bewusste Scanner fand daraufhin **28 weitere** Verstöße, die mein manueller Durchgang
  übersehen hatte. Beide Regeln sind am Ende erneut gegen eine eingebaute Verletzung geprüft.

- **Emoji ist geblieben, wo es Inhalt ist.** Der Audit hat kein Emoji aus Strafenarten, Abzeichen,
  Empty States oder Sheet-Titeln entfernt. Auf Lucide umgestellt wurde nur reine Chrome:
  Schließen, ⋮, Kommentar-Umschalter, Reaktion-wählen, Medien-Anhang, Kamera, Senden, Stift/Papierkorb.

- **Drei Icon-Knöpfe → ein ⋮-Menü, nicht drei `aria-label`s.** Bei der Termin-Zeile und den vier
  Verwaltungs-Listen wäre `aria-label` billiger gewesen und hätte den Test bestanden — ein sehendes
  Touch-Publikum hätte aber weiterhin bedeutungslose Glyphen gesehen. Dabei kam der schwerere Fund
  heraus: die `✕` der Verwaltungs-Listen riefen `api.deleteX()` **sofort und ohne Rückfrage**. Jetzt
  liegt ein rot markiertes, ausgeschriebenes „Löschen" dazwischen. Das ist bewusst mehr als
  Affordanz-Kosmetik — die Roadmap-Zeile fordert „versteckte Aktionen in sichtbare ⋯-Menüs", und
  eine unbestätigte Ein-Tipp-Löschung hinter einem 24px-Glyphen ist genau der Fall.

- **Zwei Tooltips waren Erklärungen, keine Labels.** `evening.alreadyActive` hing an einem
  *deaktivierten* Knopf, wo ein Tooltip nicht mal am Desktop zuverlässig feuert. Der Text steht
  jetzt sichtbar darunter — wie es der `schedule.startNotToday`-Fall direkt daneben schon machte.

- **Nebenbei behoben, weil der Audit die Stellen ohnehin angefasst hat:** 5 hartkodierte Strings
  statt `t()`; ein doppelter Accessible Name (Herz-Pille und Emoji-Picker hießen beide „Reaktion
  hinzufügen" — neuer Key `comment.reaction.pick`); ein 16px-Tap-Target; die Farb-Literale
  `rgba(255,255,255,0.07)` und `#f87171`, die gegen die Token-Regel aus #70 verstießen.

- **Bewusst nicht angefasst:** Long-Press. Die Roadmap nennt ihn („nur je als Abkürzung zu etwas
  auch per Tap Erreichbarem"), und das ist bereits erfüllt — die einzige Long-Press-Geste
  (`ReactionPill` → wer hat reagiert) ist eine Zusatzinformation, keine exklusive Aktion; ein Tap
  toggelt weiterhin die Reaktion. Da war nichts zu reparieren.
