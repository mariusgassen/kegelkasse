"""Extended tests for evening endpoints — covers previously uncovered lines in evenings.py.

Focuses on:
- Duplicate/blocked evening creation (line 113)
- Date update via PATCH (line 155)
- Evening delete (lines 176-178)
- Player management: team_id required when teams exist (line 195),
  update_player (lines 210-215), remove_player cascade (lines 221-240)
- Team management: create, update, delete (lines 253-294)
- Penalty endpoints: add_penalty via team, update_penalty, delete_penalty (lines 357-451)
- Absence penalties endpoint (lines 566-573)
- Game management: add_game, start_game, finish_game, update_game, delete_game (lines 589-946)
- Camera throws: add, clear, delete single, update, active-player (lines 697-810)
- Drink endpoints: update_drink_round, delete_drink_round (lines 978-994)
- Highlight endpoints: add_highlight (closed evening), delete_highlight (lines 1004-1030)
"""
import time
import pytest
from datetime import datetime, UTC
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from core.security import create_access_token, get_password_hash
from models.club import Club
from models.evening import Evening, EveningPlayer, Team, RegularMember
from models.game import Game, GameThrowLog
from models.penalty import PenaltyLog, PenaltyType
from models.drink import DrinkRound
from models.user import User, UserRole


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def admin_user(db: Session, club: Club) -> User:
    u = User(
        email="ext_admin@evening.de",
        name="Ext Admin",
        hashed_password=get_password_hash("pass"),
        role=UserRole.admin,
        club_id=club.id,
        is_active=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


@pytest.fixture()
def admin_headers(admin_user: User) -> dict:
    token = create_access_token({"sub": str(admin_user.id)})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def regular_member(db: Session, club: Club) -> RegularMember:
    m = RegularMember(club_id=club.id, name="Regular Hans", nickname="Hans")
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


@pytest.fixture()
def evening(db: Session, club: Club, admin_user: User) -> Evening:
    e = Evening(
        club_id=club.id,
        created_by=admin_user.id,
        date=datetime(2025, 6, 15, 20, 0, 0, tzinfo=UTC),
        venue="Testlokal",
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    return e


@pytest.fixture()
def player(db: Session, evening: Evening) -> EveningPlayer:
    p = EveningPlayer(evening_id=evening.id, name="Test Player")
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


@pytest.fixture()
def team(db: Session, evening: Evening) -> Team:
    t = Team(evening_id=evening.id, name="Team A")
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


@pytest.fixture(autouse=True)
def cleanup(db: Session, club: Club):
    yield
    from models.evening import EveningHighlight
    evenings = db.query(Evening).filter(Evening.club_id == club.id).all()
    for e in evenings:
        db.query(GameThrowLog).filter(GameThrowLog.game_id.in_(
            db.query(Game.id).filter(Game.evening_id == e.id)
        )).delete(synchronize_session=False)
        db.query(PenaltyLog).filter(PenaltyLog.evening_id == e.id).delete(synchronize_session=False)
        db.query(EveningPlayer).filter(EveningPlayer.evening_id == e.id).delete(synchronize_session=False)
        db.query(Game).filter(Game.evening_id == e.id).delete(synchronize_session=False)
        db.query(DrinkRound).filter(DrinkRound.evening_id == e.id).delete(synchronize_session=False)
        db.query(EveningHighlight).filter(EveningHighlight.evening_id == e.id).delete(synchronize_session=False)
        db.query(Team).filter(Team.evening_id == e.id).delete(synchronize_session=False)
    db.query(Evening).filter(Evening.club_id == club.id).delete(synchronize_session=False)
    db.query(PenaltyType).filter(PenaltyType.club_id == club.id).delete(synchronize_session=False)
    # Clean up ScheduledEvening + RSVP (created by mark_cancelled tests)
    from models.schedule import MemberRsvp, ScheduledEvening
    se_ids = [se.id for se in db.query(ScheduledEvening).filter(ScheduledEvening.club_id == club.id).all()]
    if se_ids:
        db.query(MemberRsvp).filter(MemberRsvp.scheduled_evening_id.in_(se_ids)).delete(synchronize_session=False)
    db.query(ScheduledEvening).filter(ScheduledEvening.club_id == club.id).delete(synchronize_session=False)
    db.query(RegularMember).filter(RegularMember.club_id == club.id).delete(synchronize_session=False)
    db.commit()


# ---------------------------------------------------------------------------
# POST /evening/ — duplicate (another open evening)
# ---------------------------------------------------------------------------

class TestCreateEveningErrors:
    def test_cannot_create_when_another_open(
            self, client: TestClient, admin_headers: dict, evening: Evening):
        """Line 113: raises 400 when another evening is already open."""
        resp = client.post("/api/v1/evening/", headers=admin_headers,
                           json={"date": "2025-09-01"})
        assert resp.status_code == 400
        assert "already active" in resp.json()["detail"].lower()

    def test_delete_evening(self, client: TestClient, admin_headers: dict, db: Session, club: Club, admin_user: User):
        """Lines 176-178: admin can hard-delete an evening."""
        e = Evening(club_id=club.id, created_by=admin_user.id,
                    date=datetime(2025, 11, 1, tzinfo=UTC))
        db.add(e)
        db.commit()
        db.refresh(e)
        resp = client.delete(f"/api/v1/evening/{e.id}", headers=admin_headers)
        assert resp.status_code == 204
        assert db.query(Evening).filter(Evening.id == e.id).first() is None


# ---------------------------------------------------------------------------
# PATCH /evening/{eid} — date update
# ---------------------------------------------------------------------------

class TestUpdateEveningDate:
    def test_update_date(self, client: TestClient, auth_headers: dict, evening: Evening):
        """Line 155: PATCH with a date string parses and stores it."""
        resp = client.patch(f"/api/v1/evening/{evening.id}", headers=auth_headers,
                            json={"date": "2025-12-24"})
        assert resp.status_code == 200
        data = resp.json()
        assert "2025-12-24" in data["date"]


# ---------------------------------------------------------------------------
# Player management
# ---------------------------------------------------------------------------

class TestPlayerManagement:
    def test_team_id_required_when_teams_exist(
            self, client: TestClient, auth_headers: dict, evening: Evening, team: Team):
        """Line 195: 400 when evening has teams but no team_id provided."""
        resp = client.post(f"/api/v1/evening/{evening.id}/players",
                           headers=auth_headers,
                           json={"name": "Player Without Team"})
        assert resp.status_code == 400
        assert "team_id" in resp.json()["detail"].lower()

    def test_add_player_with_team_id(
            self, client: TestClient, auth_headers: dict, evening: Evening, team: Team):
        """Adding a player succeeds when team_id is supplied."""
        resp = client.post(f"/api/v1/evening/{evening.id}/players",
                           headers=auth_headers,
                           json={"name": "Player With Team", "team_id": team.id})
        assert resp.status_code == 200
        assert resp.json()["team_id"] == team.id

    def test_update_player_name(
            self, client: TestClient, auth_headers: dict, evening: Evening, player: EveningPlayer):
        """Lines 210-215: PATCH player updates name."""
        resp = client.patch(f"/api/v1/evening/{evening.id}/players/{player.id}",
                            headers=auth_headers,
                            json={"name": "Renamed Player"})
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_update_player_404_for_wrong_id(
            self, client: TestClient, auth_headers: dict, evening: Evening):
        """Lines 210-215: 404 when player ID not found."""
        resp = client.patch(f"/api/v1/evening/{evening.id}/players/99999",
                            headers=auth_headers, json={"name": "Ghost"})
        assert resp.status_code == 404

    def test_remove_player(
            self, client: TestClient, auth_headers: dict, evening: Evening, player: EveningPlayer):
        """Lines 221-240: DELETE player returns ok."""
        resp = client.delete(f"/api/v1/evening/{evening.id}/players/{player.id}",
                             headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_remove_player_404_for_wrong_id(
            self, client: TestClient, auth_headers: dict, evening: Evening):
        """Lines 221-240: 404 when player not found."""
        resp = client.delete(f"/api/v1/evening/{evening.id}/players/99999",
                             headers=auth_headers)
        assert resp.status_code == 404

    def test_remove_player_cascades_penalties(
            self, client: TestClient, auth_headers: dict, evening: Evening,
            player: EveningPlayer, db: Session):
        """Lines 225: penalty logs for deleted player are removed."""
        log = PenaltyLog(
            evening_id=evening.id,
            player_id=player.id,
            player_name=player.name,
            penalty_type_name="Test",
            icon="⚠️",
            amount=1.0,
            mode="euro",
            client_timestamp=time.time() * 1000,
            created_by=1,
        )
        db.add(log)
        db.commit()
        db.refresh(log)
        log_id = log.id

        client.delete(f"/api/v1/evening/{evening.id}/players/{player.id}",
                      headers=auth_headers)
        assert db.query(PenaltyLog).filter(PenaltyLog.id == log_id).first() is None


# ---------------------------------------------------------------------------
# Team management
# ---------------------------------------------------------------------------

class TestTeamManagement:
    def test_create_team(self, client: TestClient, auth_headers: dict, evening: Evening):
        """Lines 253-261: create a team."""
        resp = client.post(f"/api/v1/evening/{evening.id}/teams",
                           headers=auth_headers,
                           json={"name": "New Team", "player_ids": []})
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "New Team"
        assert "id" in data

    def test_create_team_with_players(
            self, client: TestClient, auth_headers: dict, evening: Evening,
            player: EveningPlayer, db: Session):
        """Lines 253-261: create team assigns players."""
        resp = client.post(f"/api/v1/evening/{evening.id}/teams",
                           headers=auth_headers,
                           json={"name": "Team With Players", "player_ids": [player.id]})
        assert resp.status_code == 200
        team_id = resp.json()["id"]
        db.refresh(player)
        assert player.team_id == team_id

    def test_update_team_name(
            self, client: TestClient, auth_headers: dict, evening: Evening, team: Team):
        """Lines 272-282: PATCH team name."""
        resp = client.patch(f"/api/v1/evening/{evening.id}/teams/{team.id}",
                            headers=auth_headers,
                            json={"name": "Renamed Team"})
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_update_team_404(
            self, client: TestClient, auth_headers: dict, evening: Evening):
        """Lines 272-282: 404 for nonexistent team."""
        resp = client.patch(f"/api/v1/evening/{evening.id}/teams/99999",
                            headers=auth_headers, json={"name": "Ghost"})
        assert resp.status_code == 404

    def test_update_team_player_ids(
            self, client: TestClient, auth_headers: dict, evening: Evening,
            team: Team, player: EveningPlayer, db: Session):
        """Lines 276-280: update team's player_ids."""
        resp = client.patch(f"/api/v1/evening/{evening.id}/teams/{team.id}",
                            headers=auth_headers,
                            json={"player_ids": [player.id]})
        assert resp.status_code == 200
        db.refresh(player)
        assert player.team_id == team.id

    def test_delete_team(
            self, client: TestClient, auth_headers: dict, evening: Evening, team: Team):
        """Lines 288-294: DELETE team."""
        resp = client.delete(f"/api/v1/evening/{evening.id}/teams/{team.id}",
                             headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_delete_team_404(
            self, client: TestClient, auth_headers: dict, evening: Evening):
        """Lines 288-294: 404 for nonexistent team."""
        resp = client.delete(f"/api/v1/evening/{evening.id}/teams/99999",
                             headers=auth_headers)
        assert resp.status_code == 404

    def test_delete_team_clears_player_assignments(
            self, client: TestClient, auth_headers: dict, evening: Evening,
            team: Team, player: EveningPlayer, db: Session):
        """Line 291: deleting a team clears player team_id."""
        player.team_id = team.id
        db.commit()
        client.delete(f"/api/v1/evening/{evening.id}/teams/{team.id}", headers=auth_headers)
        db.refresh(player)
        assert player.team_id is None


# ---------------------------------------------------------------------------
# Penalty management
# ---------------------------------------------------------------------------

class TestPenaltyManagement:
    def _add_player(self, client, headers, evening):
        resp = client.post(f"/api/v1/evening/{evening.id}/players",
                           headers=headers, json={"name": "Penalty Player"})
        return resp.json()["id"]

    def test_add_penalty_via_team(
            self, client: TestClient, auth_headers: dict, evening: Evening,
            team: Team, player: EveningPlayer, db: Session):
        """Lines 355-360: team_id targets all team members."""
        player.team_id = team.id
        db.commit()
        resp = client.post(f"/api/v1/evening/{evening.id}/penalties",
                           headers=auth_headers,
                           json={
                               "team_id": team.id,
                               "penalty_type_name": "Teamstrafe",
                               "icon": "🏆",
                               "amount": 2.0,
                               "mode": "euro",
                               "client_timestamp": time.time() * 1000,
                           })
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_update_penalty(
            self, client: TestClient, auth_headers: dict, evening: Evening,
            player: EveningPlayer, db: Session):
        """Lines 406-422: PATCH penalty updates amount."""
        log = PenaltyLog(
            evening_id=evening.id, player_id=player.id, player_name=player.name,
            penalty_type_name="Test", icon="⚠️", amount=1.0, mode="euro",
            client_timestamp=time.time() * 1000, created_by=1,
        )
        db.add(log)
        db.commit()
        db.refresh(log)
        resp = client.patch(f"/api/v1/evening/{evening.id}/penalties/{log.id}",
                            headers=auth_headers,
                            json={"amount": 5.0})
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_update_penalty_404(
            self, client: TestClient, auth_headers: dict, evening: Evening):
        """Lines 406-422: 404 for nonexistent penalty."""
        resp = client.patch(f"/api/v1/evening/{evening.id}/penalties/99999",
                            headers=auth_headers, json={"amount": 1.0})
        assert resp.status_code == 404

    def test_delete_penalty(
            self, client: TestClient, auth_headers: dict, evening: Evening,
            player: EveningPlayer, db: Session):
        """Lines 431-451: soft-delete penalty."""
        log = PenaltyLog(
            evening_id=evening.id, player_id=player.id, player_name=player.name,
            penalty_type_name="Delete Me", icon="🗑️", amount=1.0, mode="euro",
            client_timestamp=time.time() * 1000, created_by=1,
        )
        db.add(log)
        db.commit()
        db.refresh(log)
        resp = client.delete(f"/api/v1/evening/{evening.id}/penalties/{log.id}",
                             headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["ok"] is True
        db.refresh(log)
        assert log.is_deleted is True

    def test_delete_penalty_404(
            self, client: TestClient, auth_headers: dict, evening: Evening):
        """Lines 431-451: 404 for nonexistent penalty."""
        resp = client.delete(f"/api/v1/evening/{evening.id}/penalties/99999",
                             headers=auth_headers)
        assert resp.status_code == 404

    def test_update_penalty_date_requires_admin(
            self, client: TestClient, auth_headers: dict, admin_headers: dict,
            evening: Evening, player: EveningPlayer, db: Session):
        """Lines 410-419: non-admin cannot change penalty date."""
        log = PenaltyLog(
            evening_id=evening.id, player_id=player.id, player_name=player.name,
            penalty_type_name="Test", icon="⚠️", amount=1.0, mode="euro",
            client_timestamp=time.time() * 1000, created_by=1,
        )
        db.add(log)
        db.commit()
        db.refresh(log)
        resp = client.patch(f"/api/v1/evening/{evening.id}/penalties/{log.id}",
                            headers=auth_headers,
                            json={"date": "2025-06-15"})
        assert resp.status_code == 403

    def test_update_penalty_date_as_admin(
            self, client: TestClient, admin_headers: dict,
            evening: Evening, player: EveningPlayer, db: Session):
        """Lines 411-417: admin can override penalty date."""
        log = PenaltyLog(
            evening_id=evening.id, player_id=player.id, player_name=player.name,
            penalty_type_name="Test", icon="⚠️", amount=1.0, mode="euro",
            client_timestamp=time.time() * 1000, created_by=1,
        )
        db.add(log)
        db.commit()
        db.refresh(log)
        resp = client.patch(f"/api/v1/evening/{evening.id}/penalties/{log.id}",
                            headers=admin_headers,
                            json={"date": "2025-06-15"})
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Absence penalties endpoint
# ---------------------------------------------------------------------------

class TestAbsencePenalties:
    def test_admin_can_trigger_absence_penalties(
            self, client: TestClient, admin_headers: dict, evening: Evening,
            regular_member: RegularMember, db: Session):
        """Lines 566-573: POST absence-penalties endpoint."""
        player = EveningPlayer(evening_id=evening.id, name="Present Player")
        db.add(player)
        db.commit()
        resp = client.post(f"/api/v1/evening/{evening.id}/absence-penalties",
                           headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "avg" in data
        assert "absent_count" in data

    def test_member_cannot_trigger_absence_penalties(
            self, client: TestClient, auth_headers: dict, evening: Evening):
        """Lines 566-573: member role gets 403."""
        resp = client.post(f"/api/v1/evening/{evening.id}/absence-penalties",
                           headers=auth_headers)
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Game management
# ---------------------------------------------------------------------------

class TestGameManagement:
    def _create_game(self, client, headers, evening):
        resp = client.post(f"/api/v1/evening/{evening.id}/games",
                           headers=headers,
                           json={
                               "name": "Eröffnung",
                               "is_opener": False,
                               "loser_penalty": 1.0,
                               "per_point_penalty": 0,
                               "client_timestamp": time.time() * 1000,
                           })
        assert resp.status_code == 200
        return resp.json()["id"]

    def test_add_game(self, client: TestClient, auth_headers: dict, evening: Evening):
        """Lines 645-667: create game."""
        gid = self._create_game(client, auth_headers, evening)
        assert isinstance(gid, int)

    def test_start_game(self, client: TestClient, auth_headers: dict, evening: Evening):
        """Lines 670-684: start game transitions to running."""
        gid = self._create_game(client, auth_headers, evening)
        resp = client.post(f"/api/v1/evening/{evening.id}/games/{gid}/start",
                           headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_start_game_already_running_fails(
            self, client: TestClient, auth_headers: dict, evening: Evening):
        """Line 677: cannot start a running game."""
        gid = self._create_game(client, auth_headers, evening)
        client.post(f"/api/v1/evening/{evening.id}/games/{gid}/start", headers=auth_headers)
        resp = client.post(f"/api/v1/evening/{evening.id}/games/{gid}/start",
                           headers=auth_headers)
        assert resp.status_code == 400

    def test_start_game_404(self, client: TestClient, auth_headers: dict, evening: Evening):
        """Line 675: 404 for nonexistent game."""
        resp = client.post(f"/api/v1/evening/{evening.id}/games/99999/start",
                           headers=auth_headers)
        assert resp.status_code == 404

    def test_finish_game(
            self, client: TestClient, auth_headers: dict, evening: Evening,
            player: EveningPlayer):
        """Lines 868-905: finish game sets winner, creates penalties."""
        gid = self._create_game(client, auth_headers, evening)
        resp = client.post(f"/api/v1/evening/{evening.id}/games/{gid}/finish",
                           headers=auth_headers,
                           json={
                               "winner_ref": f"p:{player.id}",
                               "winner_name": player.name,
                               "scores": {f"p:{player.id}": 10},
                           })
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_finish_game_404(self, client: TestClient, auth_headers: dict, evening: Evening):
        """Line 874: 404 for nonexistent game finish."""
        resp = client.post(f"/api/v1/evening/{evening.id}/games/99999/finish",
                           headers=auth_headers,
                           json={"winner_ref": "p:1", "winner_name": "Nobody"})
        assert resp.status_code == 404

    def test_finish_game_opener_sets_king(
            self, client: TestClient, auth_headers: dict, evening: Evening,
            player: EveningPlayer, db: Session):
        """Lines 884-899: opener game with individual winner sets is_king."""
        gid = self._create_game(client, auth_headers, evening)
        # Update game to be opener
        g = db.query(Game).filter(Game.id == gid).first()
        g.is_opener = True
        db.commit()
        client.post(f"/api/v1/evening/{evening.id}/games/{gid}/finish",
                    headers=auth_headers,
                    json={"winner_ref": f"p:{player.id}", "winner_name": player.name})
        db.refresh(player)
        assert player.is_king is True

    def test_update_game(
            self, client: TestClient, auth_headers: dict, evening: Evening):
        """Lines 919-933: PATCH game updates fields."""
        gid = self._create_game(client, auth_headers, evening)
        resp = client.patch(f"/api/v1/evening/{evening.id}/games/{gid}",
                            headers=auth_headers,
                            json={"name": "Renamed Game"})
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_update_game_404(
            self, client: TestClient, auth_headers: dict, evening: Evening):
        """Lines 919-933: 404 for nonexistent game update."""
        resp = client.patch(f"/api/v1/evening/{evening.id}/games/99999",
                            headers=auth_headers, json={"name": "X"})
        assert resp.status_code == 404

    def test_delete_game(
            self, client: TestClient, auth_headers: dict, evening: Evening):
        """Lines 936-946: soft-delete game."""
        gid = self._create_game(client, auth_headers, evening)
        resp = client.delete(f"/api/v1/evening/{evening.id}/games/{gid}",
                             headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_delete_game_404(
            self, client: TestClient, auth_headers: dict, evening: Evening):
        """Lines 936-946: 404 for nonexistent game."""
        resp = client.delete(f"/api/v1/evening/{evening.id}/games/99999",
                             headers=auth_headers)
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Camera throw log
# ---------------------------------------------------------------------------

class TestCameraThrows:
    def _setup_game(self, client, admin_headers, evening):
        resp = client.post(f"/api/v1/evening/{evening.id}/games",
                           headers=admin_headers,
                           json={"name": "Camera Game", "loser_penalty": 0, "per_point_penalty": 0,
                                 "client_timestamp": time.time() * 1000})
        return resp.json()["id"]

    def test_add_camera_throw(
            self, client: TestClient, admin_headers: dict, evening: Evening):
        """Lines 697-730: add camera throw."""
        gid = self._setup_game(client, admin_headers, evening)
        resp = client.post(f"/api/v1/evening/{evening.id}/games/{gid}/throws",
                           headers=admin_headers,
                           json={"throw_num": 1, "pins": 7, "pin_states": []})
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_add_camera_throw_upsert(
            self, client: TestClient, admin_headers: dict, evening: Evening):
        """Lines 713-718: adding same throw_num updates existing."""
        gid = self._setup_game(client, admin_headers, evening)
        client.post(f"/api/v1/evening/{evening.id}/games/{gid}/throws",
                    headers=admin_headers,
                    json={"throw_num": 1, "pins": 7, "pin_states": []})
        resp = client.post(f"/api/v1/evening/{evening.id}/games/{gid}/throws",
                           headers=admin_headers,
                           json={"throw_num": 1, "pins": 9, "pin_states": []})
        assert resp.status_code == 200

    def test_add_camera_throw_game_not_found(
            self, client: TestClient, admin_headers: dict, evening: Evening):
        """Line 704-705: 404 when game not found."""
        resp = client.post(f"/api/v1/evening/{evening.id}/games/99999/throws",
                           headers=admin_headers,
                           json={"throw_num": 1, "pins": 5, "pin_states": []})
        assert resp.status_code == 404

    def test_clear_camera_throws(
            self, client: TestClient, admin_headers: dict, evening: Evening):
        """Lines 733-745: DELETE all throws for a game."""
        gid = self._setup_game(client, admin_headers, evening)
        client.post(f"/api/v1/evening/{evening.id}/games/{gid}/throws",
                    headers=admin_headers,
                    json={"throw_num": 1, "pins": 5, "pin_states": []})
        resp = client.delete(f"/api/v1/evening/{evening.id}/games/{gid}/throws",
                             headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_clear_camera_throws_game_not_found(
            self, client: TestClient, admin_headers: dict, evening: Evening):
        """Lines 740-741: 404 when game not found."""
        resp = client.delete(f"/api/v1/evening/{evening.id}/games/99999/throws",
                             headers=admin_headers)
        assert resp.status_code == 404

    def test_delete_single_throw(
            self, client: TestClient, admin_headers: dict, evening: Evening, db: Session):
        """Lines 748-763: DELETE single throw by tid."""
        gid = self._setup_game(client, admin_headers, evening)
        client.post(f"/api/v1/evening/{evening.id}/games/{gid}/throws",
                    headers=admin_headers,
                    json={"throw_num": 2, "pins": 4, "pin_states": []})
        throw = db.query(GameThrowLog).filter(GameThrowLog.game_id == gid).first()
        assert throw is not None
        resp = client.delete(f"/api/v1/evening/{evening.id}/games/{gid}/throws/{throw.id}",
                             headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_delete_single_throw_not_found(
            self, client: TestClient, admin_headers: dict, evening: Evening):
        """Line 758-759: 404 when throw not found."""
        gid = self._setup_game(client, admin_headers, evening)
        resp = client.delete(f"/api/v1/evening/{evening.id}/games/{gid}/throws/99999",
                             headers=admin_headers)
        assert resp.status_code == 404

    def test_delete_single_throw_game_not_found(
            self, client: TestClient, admin_headers: dict, evening: Evening):
        """Lines 754-756: 404 when game not found."""
        resp = client.delete(f"/api/v1/evening/{evening.id}/games/99999/throws/1",
                             headers=admin_headers)
        assert resp.status_code == 404

    def test_update_camera_throw(
            self, client: TestClient, admin_headers: dict, evening: Evening, db: Session):
        """Lines 772-790: PATCH camera throw."""
        gid = self._setup_game(client, admin_headers, evening)
        client.post(f"/api/v1/evening/{evening.id}/games/{gid}/throws",
                    headers=admin_headers,
                    json={"throw_num": 3, "pins": 5, "pin_states": []})
        throw = db.query(GameThrowLog).filter(GameThrowLog.game_id == gid).first()
        resp = client.patch(f"/api/v1/evening/{evening.id}/games/{gid}/throws/{throw.id}",
                            headers=admin_headers,
                            json={"pins": 9})
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_update_camera_throw_not_found(
            self, client: TestClient, admin_headers: dict, evening: Evening):
        """Lines 781-782: 404 when throw not found."""
        gid = self._setup_game(client, admin_headers, evening)
        resp = client.patch(f"/api/v1/evening/{evening.id}/games/{gid}/throws/99999",
                            headers=admin_headers,
                            json={"pins": 9})
        assert resp.status_code == 404

    def test_update_camera_throw_game_not_found(
            self, client: TestClient, admin_headers: dict, evening: Evening):
        """Lines 778-780: 404 when game not found."""
        resp = client.patch(f"/api/v1/evening/{evening.id}/games/99999/throws/1",
                            headers=admin_headers,
                            json={"pins": 9})
        assert resp.status_code == 404

    def test_set_active_player(
            self, client: TestClient, auth_headers: dict, evening: Evening,
            player: EveningPlayer):
        """Lines 797-810: PATCH active-player sets game's active_player_id."""
        gid = self._setup_game(client, auth_headers, evening)
        resp = client.patch(f"/api/v1/evening/{evening.id}/games/{gid}/active-player",
                            headers=auth_headers,
                            json={"player_id": player.id})
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_set_active_player_game_not_found(
            self, client: TestClient, auth_headers: dict, evening: Evening):
        """Lines 804-806: 404 when game not found."""
        resp = client.patch(f"/api/v1/evening/{evening.id}/games/99999/active-player",
                            headers=auth_headers, json={"player_id": None})
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Drink management
# ---------------------------------------------------------------------------

class TestDrinkManagement:
    def _add_drink(self, client, headers, evening):
        resp = client.post(f"/api/v1/evening/{evening.id}/drinks",
                           headers=headers,
                           json={
                               "drink_type": "beer",
                               "participant_ids": [],
                               "client_timestamp": time.time() * 1000,
                           })
        assert resp.status_code == 200
        return resp.json()["id"]

    def test_update_drink_round(
            self, client: TestClient, auth_headers: dict, evening: Evening):
        """Lines 978-983: PATCH drink round."""
        rid = self._add_drink(client, auth_headers, evening)
        resp = client.patch(f"/api/v1/evening/{evening.id}/drinks/{rid}",
                            headers=auth_headers,
                            json={"variety": "Weizen"})
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_update_drink_round_404(
            self, client: TestClient, auth_headers: dict, evening: Evening):
        """Lines 978-983: 404 for nonexistent drink round."""
        resp = client.patch(f"/api/v1/evening/{evening.id}/drinks/99999",
                            headers=auth_headers, json={"variety": "x"})
        assert resp.status_code == 404

    def test_delete_drink_round(
            self, client: TestClient, auth_headers: dict, evening: Evening, db: Session):
        """Lines 987-994: soft-delete drink round."""
        rid = self._add_drink(client, auth_headers, evening)
        resp = client.delete(f"/api/v1/evening/{evening.id}/drinks/{rid}",
                             headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["ok"] is True
        dr = db.query(DrinkRound).filter(DrinkRound.id == rid).first()
        assert dr.is_deleted is True

    def test_delete_drink_round_404(
            self, client: TestClient, auth_headers: dict, evening: Evening):
        """Lines 987-994: 404 for nonexistent drink round."""
        resp = client.delete(f"/api/v1/evening/{evening.id}/drinks/99999",
                             headers=auth_headers)
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Highlight management
# ---------------------------------------------------------------------------

class TestHighlightManagement:
    def test_add_highlight(
            self, client: TestClient, auth_headers: dict, evening: Evening):
        """Lines 1004-1019: add highlight."""
        resp = client.post(f"/api/v1/evening/{evening.id}/highlights",
                           headers=auth_headers,
                           json={"text": "Toller Abend!"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["text"] == "Toller Abend!"
        assert "id" in data

    def test_add_highlight_to_closed_evening_fails(
            self, client: TestClient, auth_headers: dict, db: Session,
            club: Club, admin_user: User):
        """Lines 1007-1009: 400 when evening is closed."""
        closed = Evening(
            club_id=club.id,
            created_by=admin_user.id,
            date=datetime(2025, 1, 1, tzinfo=UTC),
            is_closed=True,
        )
        db.add(closed)
        db.commit()
        db.refresh(closed)
        resp = client.post(f"/api/v1/evening/{closed.id}/highlights",
                           headers=auth_headers,
                           json={"text": "Should fail"})
        assert resp.status_code == 400
        assert "closed" in resp.json()["detail"].lower()

    def test_add_highlight_no_text_and_no_media_fails(
            self, client: TestClient, auth_headers: dict, evening: Evening):
        """Lines 1012-1013: 400 when neither text nor media_url provided."""
        resp = client.post(f"/api/v1/evening/{evening.id}/highlights",
                           headers=auth_headers,
                           json={})
        assert resp.status_code == 400

    def test_delete_highlight(
            self, client: TestClient, auth_headers: dict, evening: Evening):
        """Lines 1022-1030: delete highlight."""
        add_resp = client.post(f"/api/v1/evening/{evening.id}/highlights",
                               headers=auth_headers,
                               json={"text": "To be deleted"})
        hid = add_resp.json()["id"]
        resp = client.delete(f"/api/v1/evening/{evening.id}/highlights/{hid}",
                             headers=auth_headers)
        assert resp.status_code == 204

    def test_delete_highlight_404(
            self, client: TestClient, auth_headers: dict, evening: Evening):
        """Lines 1026-1028: 404 for nonexistent highlight."""
        resp = client.delete(f"/api/v1/evening/{evening.id}/highlights/99999",
                             headers=auth_headers)
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# apply_club_team_templates and mark_cancelled (lines 303-334, 589-626)
# ---------------------------------------------------------------------------

class TestApplyClubTeamTemplates:
    """Cover lines 303-334: apply_club_team_templates endpoint."""

    def test_no_templates_returns_400(self, client, auth_headers, evening):
        resp = client.post(
            f"/api/v1/evening/{evening.id}/teams/from-templates",
            headers=auth_headers,
        )
        assert resp.status_code == 400
        assert "Vorlagen" in resp.json()["detail"]

    def test_applies_templates(self, client, admin_headers, db, evening, club):
        from models.evening import ClubTeam
        t1 = ClubTeam(club_id=club.id, name="Team A", sort_order=1)
        t2 = ClubTeam(club_id=club.id, name="Team B", sort_order=2)
        db.add_all([t1, t2])
        db.commit()
        resp = client.post(
            f"/api/v1/evening/{evening.id}/teams/from-templates",
            headers=admin_headers,
        )
        assert resp.status_code == 200
        teams = resp.json()["teams"]
        team_names = {t["name"] for t in teams}
        assert "Team A" in team_names
        assert "Team B" in team_names
        # cleanup
        db.query(ClubTeam).filter(ClubTeam.club_id == club.id).delete(synchronize_session=False)
        db.commit()

    def test_shuffle_distributes_players(self, client, admin_headers, db, evening, club):
        from models.evening import ClubTeam
        t1 = ClubTeam(club_id=club.id, name="Shuffle A", sort_order=1)
        t2 = ClubTeam(club_id=club.id, name="Shuffle B", sort_order=2)
        db.add_all([t1, t2])
        # Add players
        p1 = EveningPlayer(evening_id=evening.id, name="Player1")
        p2 = EveningPlayer(evening_id=evening.id, name="Player2")
        db.add_all([p1, p2])
        db.commit()
        resp = client.post(
            f"/api/v1/evening/{evening.id}/teams/from-templates?shuffle=true",
            headers=admin_headers,
        )
        assert resp.status_code == 200
        # cleanup
        db.query(ClubTeam).filter(ClubTeam.club_id == club.id).delete(synchronize_session=False)
        db.commit()


class TestMarkCancelled:
    """Cover lines 580-626: mark_cancelled endpoint."""

    def test_mark_cancelled_creates_rsvp(self, client, admin_headers, db, evening, club):
        from models.evening import RegularMember
        m = RegularMember(club_id=club.id, name="Absenter", is_active=True)
        db.add(m)
        db.commit()
        resp = client.post(
            f"/api/v1/evening/{evening.id}/mark-cancelled",
            headers=admin_headers,
            json={"member_ids": [m.id]},
        )
        assert resp.status_code == 200
        assert resp.json()["count"] == 1
        # cleanup
        from models.schedule import MemberRsvp, ScheduledEvening
        db.query(MemberRsvp).delete(synchronize_session=False)
        db.query(ScheduledEvening).filter(ScheduledEvening.club_id == club.id).delete(synchronize_session=False)
        db.delete(m)
        db.commit()

    def test_mark_cancelled_ignores_unknown_members(self, client, admin_headers, evening):
        resp = client.post(
            f"/api/v1/evening/{evening.id}/mark-cancelled",
            headers=admin_headers,
            json={"member_ids": [999999]},
        )
        assert resp.status_code == 200
        assert resp.json()["count"] == 1  # count = len(member_ids), not valid members

    def test_mark_cancelled_updates_existing_rsvp(self, client, admin_headers, db, evening, club):
        from models.evening import RegularMember
        from models.schedule import MemberRsvp, ScheduledEvening, RsvpStatus
        m = RegularMember(club_id=club.id, name="RsvpMember", is_active=True)
        db.add(m)
        db.flush()
        se = ScheduledEvening(
            club_id=club.id,
            scheduled_at=evening.date,
            created_by=1,
        )
        db.add(se)
        db.flush()
        existing_rsvp = MemberRsvp(
            scheduled_evening_id=se.id,
            regular_member_id=m.id,
            status=RsvpStatus.attending,
        )
        db.add(existing_rsvp)
        db.commit()
        resp = client.post(
            f"/api/v1/evening/{evening.id}/mark-cancelled",
            headers=admin_headers,
            json={"member_ids": [m.id]},
        )
        assert resp.status_code == 200
        db.refresh(existing_rsvp)
        assert existing_rsvp.status == RsvpStatus.absent
        # cleanup
        db.query(MemberRsvp).filter(MemberRsvp.scheduled_evening_id == se.id).delete(synchronize_session=False)
        db.delete(se)
        db.delete(m)
        db.commit()


class TestAbsencePenalties:
    """Cover lines 566-578: calculate_absence_penalties endpoint."""

    def test_calculates_absence_penalties(self, client, admin_headers, db, evening, club):
        from models.evening import RegularMember, EveningPlayer
        from models.schedule import ScheduledEvening, MemberRsvp, RsvpStatus
        m = RegularMember(club_id=club.id, name="Abwesend", is_active=True)
        db.add(m)
        db.commit()
        resp = client.post(
            f"/api/v1/evening/{evening.id}/absence-penalties",
            headers=admin_headers,
        )
        assert resp.status_code == 200
        # cleanup
        from models.penalty import PenaltyLog
        db.query(PenaltyLog).filter(PenaltyLog.evening_id == evening.id).delete(synchronize_session=False)
        db.delete(m)
        db.commit()

    def test_requires_admin(self, client, auth_headers, evening):
        resp = client.post(
            f"/api/v1/evening/{evening.id}/absence-penalties",
            headers=auth_headers,
        )
        assert resp.status_code == 403
