# Bugfix: Individuelle Strafen im Bearbeiten-Sheet nicht editierbar + UTC-Zeit im Datums-Picker

**Problem:** Beim Bearbeiten einer Strafe zeigt das Edit-Sheet in `ProtocolPage.tsx`
nur die Schnellstrafen-Chips. Individuelle Strafen (Freitext-Name + Icon, kein
passender `PenaltyType`) haben dort keine Felder für Icon/Text — `editType` bleibt
`null` und die einzige Möglichkeit ist, den Eintrag durch eine Schnellstrafe zu
ersetzen. Backend-PATCH (`update_penalty`) akzeptiert `penalty_type_name` + `icon`
bereits — reiner Frontend-Fix.

**Problem 2 (Nachtrag vom User):** Der Datums-Picker im Edit-Sheet zeigt UTC
statt lokaler Zeit (`toISOString().slice(0,16)` direkt auf dem Timestamp),
obwohl die Liste lokale Zeit rendert. Eingabe soll in lokaler Zeit erfolgen.

## Plan

- [x] Edit-Sheet bekommt denselben Schnell/Individuell-Tab-Umschalter wie das
  Anlegen-Sheet (`editTab`-State).
- [x] `openEditSheet`: passt der Eintrag zu einem PenaltyType → Tab „Schnell",
  sonst Tab „Individuell" mit vorbefülltem `editIcon`/`editName`.
- [x] Individuell-Tab: `EmojiPickerButton` + Name-Input (gleiches Layout wie im
  Anlegen-Sheet).
- [x] `submitEdit`: im Individuell-Tab geänderten Namen/Icon in den Patch aufnehmen;
  leerer Name blockiert Submit.
- [x] Datums-Picker: `toLocalInputValue`-Helper (Timezone-Offset herausgerechnet)
  für Anzeige + Änderungs-Vergleich; Submit schickt timezone-aware ISO
  (`new Date(local).toISOString()`), da Backend naive Strings als UTC parst.
- [x] Vitest-Tests: Custom-Strafe öffnet Individuell-Tab mit vorbefüllten Feldern;
  Submit schickt geänderten Namen/Icon; Quick-Strafe verhält sich wie bisher;
  Datums-Picker lokal vorbefüllt; Datum-Submit als timezone-aware ISO.
- [x] Version-Patch-Bump in `frontend/package.json`.
- [x] Roadmap (CLAUDE.md), README, docs aktualisieren.
- [x] `npm run build` + Vitest grün.

## Review

- Fix rein frontend-seitig in `ProtocolPage.tsx`: Edit-Sheet hat jetzt einen
  Schnell/Individuell-Umschalter analog zum Anlegen-Sheet. `openEditSheet` wählt
  den Tab automatisch danach, ob der Eintrag zu einem `PenaltyType` passt, und
  befüllt `editIcon`/`editName` immer vor.
- `submitEdit` patcht im Individuell-Tab `penalty_type_name`/`icon` nur bei
  Änderung; leerer Name deaktiviert den Speichern-Button.
- Datums-Picker zeigt und vergleicht jetzt lokale Wanduhrzeit
  (`toLocalInputValue`); gesendet wird timezone-aware ISO mit `Z`-Suffix
  (Python 3.12 `fromisoformat` akzeptiert das), damit das Backend die
  gemeinte lokale Zeit korrekt als UTC-Timestamp speichert.
- 7 neue Vitest-Tests (Tab-Auswahl je Eintragstyp, Icon/Name-Vorbefüllung,
  Submit mit geändertem Namen/Icon, Quick-Regression, lokale Datums-Vorbefüllung,
  Datum-Submit als ISO). Volle Suite 1816/1816 grün, `npm run build` clean.
- Version 1.18.0 → 1.18.1; docs (`strafen.md`), README und CLAUDE.md-Roadmap
  (#50 Bug-Fixes Batch 4) aktualisiert.
