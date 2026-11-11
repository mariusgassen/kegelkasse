# Gäste zusammenlegen (Formular ↔ manuell) + sofortige Sichtbarkeit unter „Bekannte Gäste"

## Ausgangslage (heutiges Verhalten)

| | Formular-Gast (Gastanfrage) | Manuell angelegter Gast |
|---|---|---|
| Bei Antrag/Anlage | `ScheduledEveningGuest` **ohne** `regular_member_id` | `RegularMember(is_guest=True)` sofort vorhanden |
| In „Bekannte Gäste" sichtbar | ❌ erst wenn der Abend gestartet wird | ✅ sofort |
| Beim Abend-Start | Backend minted einen **neuen** `RegularMember` → **Duplikat**, falls der Gast schon manuell existiert | wird wiederverwendet |

Der Merge-Endpoint `POST /club/regular-members/{discard}/merge-into/{keep}` re-attributiert nur
`EveningPlayer`, `User`, `InviteToken` — **nicht** `ScheduledEveningGuest`, `MemberPayment`,
`PaymentRequest`, `PenaltyLog`, `MemberRsvp`, `ClubPin`. Und Gäste haben in MembersPage keine
Merge-Aktion (nur Stammspieler).

## 1. Backend — sofortiger Gast-Eintrag (Helper)

- [x] `ensure_guest_member(db, club_id, name) -> RegularMember` in `api/v1/schedule.py`:
      sucht einen aktiven bekannten Gast (`is_active=True` UND (`is_guest=True` ODER
      `deactivated_at` gesetzt) — exakt die Chip-Definition der AddGuestForm, ausgetretene
      Mitglieder eingeschlossen) mit **gleichem vollen Namen** (`name`, NICHT Kegelname;
      case-insensitive, getrimmt — Nutzer-Entscheidung) → verlinken statt duplizieren; sonst
      `RegularMember(club_id, name, is_guest=True, is_active=True)` neu anlegen. Einzige Quelle
      der Wahrheit für beide Call-Sites. Verlinkter Termin-Gast übernimmt den Anzeigenamen des
      Mitglieds (Kegelname || Name) — gleiches Verhalten wie Chip-Auswahl.
- [x] `add_guest` (`POST /schedule/{sid}/guests`): ohne `regular_member_id` → `ensure_guest_member`,
      `ScheduledEveningGuest.regular_member_id` ist danach immer gesetzt. Mit `regular_member_id`:
      Club-Zugehörigkeit validieren (404 sonst — schließt Cross-Club-Verlinkung).
- [x] `approve_guest_request` (`guest_requests.py`): gleicher Helper — der formularangemeldete
      Gast bekommt sofort einen (verlinkten oder neuen) `RegularMember`.
- [x] Migration `071_backfill_guest_members.py`: migriert bestehende genehmigte Gastanfragen und
      geplante Gäste ohne `regular_member_id` idempotent in `RegularMember`-Einträge bzw. verlinkt
      sie mit namensgleichen bekannten Gästen.

## 2. Backend — Merge vollständig machen

- [x] `merge_regular_members` (`club.py`) re-attributiert zusätzlich:
  - `ScheduledEveningGuest.regular_member_id` (Kern dieses Features)
  - `MemberPayment.regular_member_id` (Gast-Salden/Kassenbuchung)
  - `PaymentRequest.regular_member_id`
  - `PenaltyLog.regular_member_id` (Abwesenheits-Einträge)
  - `MemberRsvp.regular_member_id` — UniqueConstraint `(scheduled_evening_id, regular_member_id)`:
        hat `keep` für denselben Termin schon eine RSVP, wird die discard-Zeile gelöscht statt
        verschoben (sonst 500)
  - `ClubPin.holder_regular_member_id`
  - `BowlingScore.regular_member_id` (Easter-Egg-Leaderboard, falls nach Mitglied gruppiert)
- [x] `remove_guest` räumt auf: zeigt der gelöschte Termin-Gast auf einen `RegularMember`, der
      nirgends referenziert ist (kein EveningPlayer, MemberPayment, PaymentRequest, anderes
      ScheduledEveningGuest, PenaltyLog, MemberRsvp, ClubPin, User, InviteToken), wird er hart
      gelöscht — der eager angelegte Gast hat nie gespielt und würde sonst „Bekannte Gäste"
      müllen. Gespielte/verlinkte Gäste bleiben (Historie, „Gäste sind nicht löschbar").

## 3. Frontend — sofort in „Bekannte Gäste" + Auto-Match

- [x] `AddGuestForm` (`SchedulePage.tsx`): Tippt der Admin den vollen Namen eines bekannten
      Gastes (`m.name`, case-insensitive — nicht den Kegelnamen), wird der Chip automatisch
      markiert („✓ Bekannter Gast (Stammgast)") und `regular_member_id` mitgeschickt.
      Backend-Match als Fallback bleibt.
- [x] `AddGuestForm.submit`: nach erfolgreicher Anlage Roster-Store refreshen
      (`api.listRegularMembers()` → `setRegularMembers`) → neuer Gast erscheint sofort in
      „Bekannte Gäste" (MembersPage, EveningPage-Spielerauswahl, Chips).
- [x] `GuestRequestsSection.confirm`: nach Approve ebenfalls den Roster-Store refreshen.
- [x] i18n: `guestRequests.approveHint` erweitern („… und als bekannter Gast gespeichert"),
      `member.mergeHint` aktualisieren (was übertragen wird), de.ts + en.ts synchron.

## 4. Frontend — Merge-Aktion für Gäste

- [x] `MembersPage.tsx` Gäste-Sektion: Merge-Aktion (`⇄ member.action.merge`) für Admins in
      Gast-Zeilen, identisch zum Stammspieler-Muster; bestehendes Merge-Sheet wiederverwenden
      (Liste der möglichen Keep-Einträge).

## 5. Tests (Policy: jedes Feature mit Tests)

- [x] pytest:
  - `add_guest`: legt RegularMember sofort an (is_guest, verlinkt, in Serialisierung);
    Auto-Match bei gleichem Namen (kein Duplikat); 404 bei fremdvereinlichem
    `regular_member_id`; mit `regular_member_id` kein Neuanlage
  - `approve_guest_request`: RegularMember sofort angelegt/verlinkt, `guest_id` gesetzt
  - `remove_guest`: löscht ungenutzten eager-Gast, behält gespielten Gast
  - `merge_regular_members`: ScheduledEveningGuest + MemberPayment wandern mit; RSVP-Kollision;
    Gäste-spezifischer Merge (Gast ↔ Gast)
  - Guards: 401/403/404 wo betroffen
- [x] Vitest:
  - `SchedulePage.test.tsx` (AddGuestForm): Auto-Match-Chip-Auswahl, Store-Refresh nach Submit
  - `GuestRequestsSection.test.tsx`: approve → Roster-Refresh
  - `MembersPage.test.tsx`: Gast-Zeile hat Merge-Aktion (Admin) + Merge-Aufruf

## 6. Doku (vor dem Commit, Pflicht)

- [x] `docs/docs/funktionen/termine.md`: „Gäste eintragen" + „Gastanfragen" — sofortige
      Speicherung als bekannter Gast, Auto-Zusammenführung bei gleichem Namen
- [x] `docs/docs/rollen/admin.md`: „Stammspieler zusammenführen" um Gäste erweitern
      (was übertragen wird)
- [x] `README.md` Feature-Katalog (Guest-requests-Zeile erweitern)
- [x] `CLAUDE.md` Roadmap: #20-Notiz anpassen („Gäste ohne regular_member_id werden beim Start
      automatisch angelegt" → jetzt sofortige Anlage), Nachtrag zum Feature

## Review

**Gemacht:** Gäste, die für einen Termin eingetragen oder per Gastanfrage angenommen werden,
werden ab sofort unmittelbar als `RegularMember(is_guest=True)` angelegt. Sie stehen damit sofort
unter „Bekannte Gäste" bereit (und nicht erst ab Abend-Start). Bei Namensgleichheit (voller Name,
case-insensitive) wird automatisch der bestehende Gast verlinkt statt ein Duplikat anzulegen.
Wird ein ungenutzter Gast wieder aus dem Termin gelöscht, wird auch der vorgemerkte Roster-Eintrag
sauber entfernt.

Der Merge-Endpoint `POST /club/regular-members/{discard}/merge-into/{keep}` überträgt nun
vollständig alle Daten: `ScheduledEveningGuest`, `MemberPayment`, `PaymentRequest`, `PenaltyLog`,
`MemberRsvp` (inkl. Bereinigung von Kollisionen), `ClubPin` und `BowlingScore`.
In der MembersPage können Admins nun auch Gäste mit anderen bekannten Gästen zusammenführen.

**Verifikation:** pytest `tests/test_guest_requests.py` (35 Tests), `tests/test_schedule_extended.py` (48 Tests)
und `tests/test_club_extended.py` (inkl. 6 Tests für Merge) alle grün; Vitest volle Suite mit
136 Testdateien und 2845 Tests grün.
