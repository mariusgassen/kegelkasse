# Guest cost transfer

Pass on a guest's outstanding penalty cost to a chosen regular member without
touching stats / PenaltyLog. Implements a "double-entry" booking: the guest is
credited, the regular member is debited, both via `MemberPayment` rows that
reference each other in their notes.

## Decisions (confirmed with user)

- Two paired `MemberPayment` entries (credit guest, debit regular member).
- Amount is editable, prefilled with the guest's current outstanding debt.
- Entry point: only on the Overview tab guest debtor card (admin only).

## Plan

### Backend
- [x] `POST /club/guest-cost-transfer` in `backend/app/api/v1/club.py`
  - body: `{ guest_id, target_member_id, amount, note? }`
  - validates admin role, same club, guest `is_guest=True`, target `is_guest=False`
  - amount must be > 0
  - creates 2 `MemberPayment` rows atomically:
    - guest: `+amount`, note = `"Übertragen auf {target.name}" [+ ": {note}"]`
    - target: `-amount`, note = `"Übernommen von {guest.name}" [+ ": {note}"]`
  - returns `{ guest_payment_id, target_payment_id }`
- [x] pytest in `backend/tests/test_treasury.py`: happy path, 401, 403 (non-admin), 404 (guest/target missing), 400 (guest_id=target, target is guest, guest is regular, cross-club, amount<=0)

### Frontend
- [x] `api.transferGuestCosts({ guest_id, target_member_id, amount, note? })` in `frontend/src/api/client.ts`
- [x] Transfer sheet in `TreasuryPage.tsx`: pick target member (chips from `memberPickerList`), amount input (prefilled with guest's debt), optional note, submit
- [x] "↪️ Übertragen" button on each guest debtor card in the Overview tab (admin only, next to "Begleichen")
- [x] After submit: invalidate `member-balances`, `guest-balances`, `all-payments`, expanded `member-payments`
- [x] api-client Vitest in `frontend/src/api/__tests__/apiMethods.test.ts`

### i18n
- [x] `treasury.transfer.button` / `.title` / `.target` / `.notePlaceholder` / `.submit` / `.fromGuest` / `.hint` / `.noTargets` in `de.ts` + `en.ts`

### Docs
- [x] CLAUDE.md feature roadmap: new row "Gast-Kosten-Übertragung"
- [x] README feature catalog (Treasury section)
- [x] `docs/docs/funktionen/kasse.md` new section "Gäste & Kostenübertragung"

## Review

- Backend endpoint `POST /club/guest-cost-transfer` lives at `backend/app/api/v1/club.py:784–845`. Validates admin role, same club, source must be `is_guest=True`, target must be `is_guest=False`, amount > 0, source ≠ target. Creates two `MemberPayment` rows in one commit; both reference each other in the German `note` ("Übertragen auf {target}" / "Übernommen von {guest}", with optional ":{note}" suffix).
- 9 pytest cases added (`TestGuestCostTransfer` in `backend/tests/test_treasury.py`): happy path, 401, 403, 404×2, 400×4. Full backend suite: 713 passed. Ruff clean.
- Frontend: `api.transferGuestCosts()` in `frontend/src/api/client.ts`. New transfer sheet + `↪️ Übertragen` button on each guest debtor card in the Overview tab (admin only) of `TreasuryPage.tsx`. Sheet prefills amount with the guest's open balance, lets admin pick the target from `memberPickerList` (excludes other guests), accepts an optional note. After submit, invalidates `member-balances`, `guest-balances`, `all-payments`, and both members' `member-payments` queries.
- i18n: 9 new keys `treasury.transfer.*` in `de.ts` + `en.ts`, kept in sync.
- 1 new Vitest case in `apiMethods.test.ts`. Full frontend suite: 1708 passed. `npm run build` green.
- Docs updated: `CLAUDE.md` roadmap row #42, README feature catalog (Treasury section), `docs/docs/funktionen/kasse.md` new section "Gäste & Kostenübertragung".
