# Community-Driven Roadmap (Refine #537)

## Ausgangslage & Zielsetzung

PR #537 fügte ursprünglich einen statischen Markdown-Entwurf `docs/roadmap-2.0.md` hinzu mit dem Hinweis:
„Dazu kommt erst ein eigener PR (feat:), wenn diese Roadmap abgenommen ist."
Statt einer passiven Markdown-Datei soll die 2.0-Roadmap direkt als interaktives, community-getriebenes Feature in der App leben:
- Dedizierte Roadmap-Ansicht (`/roadmap`), erreichbar über Profil → Einstellungen
- Phasen / Status: Geplant, In Arbeit, Ideenpool, Abgeschlossen
- Community-Voting: Mitglieder können per Upvote über Ideen abstimmen
- In-App-Vorschlagstool: Mitglieder können eigene Ideen und Wünsche direkt einreichen
- Vorbefüllung mit den offiziellen Kegelkasse 2.0 Kern-Meilensteinen aus #537

---

## 1. Backend: Datenmodell & Migration

- [x] SQLAlchemy Model `backend/app/models/roadmap.py`:
  - `RoadmapItem`: `id`, `club_id` (nullable FK), `created_by_user_id` (nullable FK), `author_name`, `title`, `description`, `status` ('planned', 'in_progress', 'completed', 'idea', 'rejected'), `category`, `target_version`, `is_official`, `created_at`, `updated_at`
  - `RoadmapVote`: `id`, `item_id` (FK), `user_id` (FK), `created_at`, `uq_roadmap_vote` UniqueConstraint
  - Registrierung in `backend/app/models/__init__.py`
- [x] Alembic Migration `072_roadmap.py`:
  - Erstellt `roadmap_item` und `roadmap_vote` Tabellen
  - Seeding der offiziellen 2.0-Meilensteine aus #537 (Desktop-Master-Detail, Königs-Tippspiel, Geburtstage, etc.)

## 2. Backend: API-Routen & Schemas

- [x] Schemas in `backend/app/api/v1/roadmap.py`:
  - `RoadmapItemCreate`, `RoadmapItemUpdate` via `TrimmedModel`
- [x] Router `backend/app/api/v1/roadmap.py`:
  - `GET /api/v1/roadmap`: Liste der Roadmap-Items (Global + Vereins-Items), inkl. `vote_count` und `has_voted`
  - `POST /api/v1/roadmap/items`: Neue Idee einreichen (startet im Ideenpool mit automatischem Erst-Upvote)
  - `POST /api/v1/roadmap/items/{item_id}/vote`: Upvote toggle
  - `PATCH /api/v1/roadmap/items/{item_id}`: Status/Details ändern (Admin / Superadmin)
  - `DELETE /api/v1/roadmap/items/{item_id}`: Löschen (Ersteller oder Admin)
- [x] Einbindung in `backend/app/main.py`

## 3. Frontend: API-Client & Typen

- [x] Typdefinitionen in `frontend/src/types.ts`: `RoadmapItem`, `RoadmapItemCreate`, `RoadmapItemUpdate`, `RoadmapVoteResponse`, `RoadmapStatus`, `RoadmapCategory`
- [x] API-Client Methoden in `frontend/src/api/client.ts`:
  - `listRoadmap()`, `createRoadmapItem()`, `toggleRoadmapVote()`, `updateRoadmapItem()`, `deleteRoadmapItem()`

## 4. Frontend: Roadmap-Seite & UI

- [x] `frontend/src/pages/RoadmapPage.tsx`:
  - Header: Titel, Untertitel, 2.0-Prinzipien Banner (einklappbar)
  - Aktionsbutton: „Idee vorschlagen"
  - Filter-Tabs: Alle, Geplant, In Arbeit, Ideenpool, Abgeschlossen
  - Item-Karten mit Status-Badge, 2.0-Official-Badge, Titel, Beschreibung, Autor, Version
  - Tactile Upvote-Button mit Haptik und optimistischer Zähleraktualisierung
  - Admin-Aktionen (Statuswechsel, Löschen)
  - Vorschlag-Modal (`<Sheet>`): Formular für Titel, Beschreibung, Kategorie
- [x] Routing in `frontend/src/router.tsx` & `legacyHash.ts`: `/roadmap` Route registrieren
- [x] Navigation in `frontend/src/components/ProfileSheet.tsx`:
  - Link zu `/roadmap`

## 5. i18n & Dokumentation

- [x] Übersetzungsschlüssel in `frontend/src/i18n/de.ts` und `frontend/src/i18n/en.ts`
- [x] `docs/roadmap-2.0.md` aktualisiert: Beschreibt die interaktive In-App-Roadmap unter `/roadmap`
- [x] `README.md` aktualisiert: Neuer Feature-Eintrag für Community-driven Roadmap 2.0

## 6. Tests & Verifikation

- [x] Backend Pytest: `backend/tests/test_roadmap.py` (Listing, Create, Vote-Toggle, Admin-Update, Delete, Auth-Checks) — 8 von 8 bestanden
- [x] Frontend Vitest: `frontend/src/pages/__tests__/RoadmapPage.test.tsx` (Rendern, Phasenfilter, Upvote, Idee-Einreichung) — 6 von 6 bestanden
- [x] ProfileSheet Vitest: `frontend/src/components/__tests__/ProfileSheet.test.tsx` — 92 von 92 bestanden
- [x] i18n Paritätstest: `src/i18n/__tests__/i18n.test.ts` — 4 von 4 bestanden
- [x] TypeScript & Vite Build: `npm --prefix frontend run build` — fehlerfrei durchgelaufen
- [x] Backend Linting: `ruff check` — All checks passed!

## Review

PR #537 wurde von einem reinen Markdown-Entwurf in ein voll funktionsfähiges, interaktives Community-Roadmap-System überführt:
- **Datenbank & Backend:** Modelle `RoadmapItem` und `RoadmapVote`, Migration `072_roadmap.py` mit Vorbefüllung der Kern-Meilensteine für 2.0, REST-Endpunkte für Abruf, Einreichung, Voting und Admin-Verwaltung.
- **Frontend & Navigation:** Vollständige `/roadmap`-Seite mit Phasen-Tabs (Geplant, In Arbeit, Ideenpool, Abgeschlossen), Textsuche, haptischem Upvoting, einklappbaren 2.0-Redesign-Prinzipien und einem Einreichungsmodal (`<Sheet>`).
- **Verlinkung:** Über *Profil → Einstellungen* direkt erreichbar.
- **Doku & i18n:** Deutsche und englische Übersetzungen synchron, `docs/roadmap-2.0.md` und `README.md` angepasst.
