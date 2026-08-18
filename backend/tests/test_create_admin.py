"""
Tests for the initial seed script (app/scripts/create_admin.py).

`docker/entrypoint.sh` runs this on every container start, so a mismatch between its DEFAULT_*
tuples and the models they construct breaks production boot — not just a test. That is exactly what
happened when `PenaltyType.sort_order` was dropped: the script still passed the keyword, and the
only thing that caught it was the e2e job.
"""

from models.game import GameTemplate, WinnerType
from models.penalty import PenaltyType


class TestSeedDefaults:
    def test_default_penalty_types_construct(self):
        from app.scripts.create_admin import DEFAULT_PENALTY_TYPES

        assert DEFAULT_PENALTY_TYPES
        for icon, name, amount in DEFAULT_PENALTY_TYPES:
            pt = PenaltyType(club_id=1, icon=icon, name=name, default_amount=amount)
            assert pt.name == name

    def test_default_game_templates_construct(self):
        from app.scripts.create_admin import DEFAULT_GAME_TEMPLATES

        assert DEFAULT_GAME_TEMPLATES
        for name, desc, wtype, is_opener, penalty, order in DEFAULT_GAME_TEMPLATES:
            gt = GameTemplate(
                club_id=1, name=name, description=desc, winner_type=WinnerType(wtype),
                is_opener=is_opener, default_loser_penalty=penalty, sort_order=order,
            )
            assert gt.name == name
