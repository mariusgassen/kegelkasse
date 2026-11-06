"""Release announcement push: opt-in category, announced once per newer version."""
from unittest.mock import patch

import pytest

from core import releases
from core.config import settings
from models.app_state import AppState
from models.push import NotificationLog


@pytest.fixture(autouse=True)
def cleanup(db, club):
    yield
    db.query(NotificationLog).delete(synchronize_session=False)
    db.query(AppState).delete(synchronize_session=False)
    db.commit()


def _baseline(db, version="1.0.0"):
    db.add(AppState(key=releases.ANNOUNCED_KEY, value=version))
    db.commit()


def _opt_in(db, user, channels=("push",)):
    user.push_preferences = {"app_updates": list(channels)}
    db.commit()


class TestParseVersion:
    def test_parses_and_orders_numerically(self):
        assert releases.parse_version("1.70.1") == (1, 70, 1)
        assert releases.parse_version("v1.10.0") > releases.parse_version("1.9.9")

    def test_garbage_is_none(self):
        assert releases.parse_version("abc") is None


class TestClaimRelease:
    def test_first_run_only_records_baseline(self, db):
        assert releases.claim_release(db, "1.2.0") is False
        assert db.get(AppState, releases.ANNOUNCED_KEY).value == "1.2.0"

    def test_newer_version_is_claimed_once(self, db):
        _baseline(db)
        assert releases.claim_release(db, "1.1.0") is True
        assert releases.claim_release(db, "1.1.0") is False
        assert db.get(AppState, releases.ANNOUNCED_KEY).value == "1.1.0"

    @pytest.mark.parametrize("version", ["1.0.0", "0.9.9"])
    def test_same_or_older_version_stays_silent(self, db, version):
        _baseline(db)
        assert releases.claim_release(db, version) is False
        assert db.get(AppState, releases.ANNOUNCED_KEY).value == "1.0.0"


class TestAnnounceRelease:
    def test_default_is_off(self, db, user):
        _baseline(db)
        assert releases.announce_release(db, "1.1.0") == 0
        assert db.query(NotificationLog).count() == 0

    def test_notifies_opted_in_members_only(self, db, user, second_user):
        _baseline(db)
        _opt_in(db, user)
        assert releases.announce_release(db, "1.1.0") == 1
        logs = db.query(NotificationLog).all()
        assert [(log.user_id, log.url) for log in logs] == [(user.id, "/")]
        assert "1.1.0" in logs[0].title

    def test_localized_text(self, db, user):
        _baseline(db)
        _opt_in(db, user)
        user.preferred_locale = "en"
        db.commit()
        releases.announce_release(db, "1.1.0")
        assert db.query(NotificationLog).one().title == "New version 1.1.0"

    def test_push_payload_asks_the_service_worker_to_update(self, db, user, subscription):
        _baseline(db)
        _opt_in(db, user)
        with patch.object(settings, "VAPID_PRIVATE_KEY", "key"), \
                patch("core.push._send_one") as send:
            releases.announce_release(db, "1.1.0")
        assert send.call_count == 1
        assert send.call_args.kwargs["extra"]["update"] is True

    def test_not_announced_twice(self, db, user):
        _baseline(db)
        _opt_in(db, user)
        releases.announce_release(db, "1.1.0")
        assert releases.announce_release(db, "1.1.0") == 0
        assert db.query(NotificationLog).count() == 1

    def test_inactive_member_skipped(self, db, user):
        _baseline(db)
        _opt_in(db, user)
        user.is_active = False
        db.commit()
        assert releases.announce_release(db, "1.1.0") == 0


def test_current_version_matches_pyproject():
    from main import __version__
    assert releases.current_version() == __version__


class TestPreferenceEndpoint:
    def test_defaults_off_and_round_trips(self, client, auth_headers):
        r = client.get("/api/v1/push/preferences", headers=auth_headers)
        assert r.json()["app_updates"] == []
        r = client.patch("/api/v1/push/preferences", json={"app_updates": ["push"]}, headers=auth_headers)
        assert r.status_code == 200
        assert client.get("/api/v1/push/preferences", headers=auth_headers).json()["app_updates"] == ["push"]
