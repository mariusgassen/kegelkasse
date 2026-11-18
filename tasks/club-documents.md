# Club documents (Satzung / Geschäftsordnung)

## Goal
Give clubs a place for statutory documents (Satzung, Geschäftsordnung, ...). Admins upload a PDF with
metadata (title, type, version, decision date, effective date); all members can read and download it;
members can confirm "Kenntnis genommen" / "Zugestimmt" with an audit trail (who, when, which version).
Access is members-only — no public file URL.

## Design
- New tables: `club_document` (one row per file/version, grouped by a stable `group_id`) and
  `club_document_acknowledgement` (unique per document + user, with response and timestamps).
- PDF upload: admin-only, `application/pdf`, max 10 MB, stored via the existing storage backend under
  `documents/<uuid>.pdf`. Metadata fields are multipart form fields.
- Download: protected endpoint with `require_club_member` (not the public `/uploads/<key>` route).
- Listing: latest version per group, with description, dates, status, ack counts and my own response.
- Acknowledgements: `POST .../acknowledge` with `{"response": "acknowledged" | "agreed"}`, upsert.
- Legal note: this is a simple electronic signature / proof of consent, not a qualified electronic
  signature (eIDAS/QES). Register-relevant changes still need notarisation / a signed protocol.

## Status
- [x] Backend: model, migration `076` (head 075), protected upload/download/list/ack/delete API, S3 key support, 7 tests
- [x] Frontend: types, api client methods, `ClubDocumentsPage`, `/documents` route + Verein nav, de/en i18n, tests
- [x] Verify: backend 1488 passed (`TZ=UTC`), ruff clean, frontend `tsc` clean, 156 files / 3084 tests passed, eslint 0 errors, build clean

## Notes
- Private `documents/` keys are accepted by the storage backends but rejected by the public
  `/uploads/<key>` route; downloads go through authenticated `GET /club/documents/{id}/download`.
- Local CEST makes 3 pre-existing evening/game retiming tests fail; they pass with `TZ=UTC`.
- Frontend eslint reports only the repo's pre-existing `no-explicit-any` warnings (0 errors).
- Legal caveat shown in the UI: the in-app confirmation is simple proof of consent, not a QES or a
  notarised signature. Register-relevant changes still need a signed protocol / notarisation.
