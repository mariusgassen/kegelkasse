"""Trim leading/trailing whitespace from existing names and labels.

The API now trims on the way in (core/schemas.py::TrimmedModel), but rows written before that keep
their stray spaces — and those are exactly the ones that show up wrong in reports, exports and the
config bundle ("Pin fehlt " vs "Pin fehlt"). This is a one-off cleanup of the columns a member
actually reads; it is idempotent, so re-running it is a no-op.
"""
from alembic import op

revision = '057'
down_revision = '056'
branch_labels = None
depends_on = None

# (table, column) pairs holding a name/label a member sees. Free-text bodies (comments, announcement
# text) are deliberately left alone: they are prose, and rewriting historical posts is not cleanup.
COLUMNS = [
    ('penalty_type', 'name'), ('penalty_type', 'icon'),
    ('penalty_log', 'penalty_type_name'), ('penalty_log', 'player_name'),
    ('club_pin', 'name'), ('club_pin', 'icon'), ('club_pin', 'holder_name'),
    ('regular_member', 'name'), ('regular_member', 'nickname'),
    ('evening_player', 'name'),  # no nickname column here — it comes from the linked member
    ('game_template', 'name'), ('game_template', 'description'),
    ('game', 'name'), ('game', 'winner_name'),
    ('club_team', 'name'), ('team', 'name'),
    ('evening', 'venue'),
    ('club', 'name'),
    ('"user"', 'name'), ('"user"', 'username'),
]

# Spaces, tabs and stray newlines — a name pasted from a spreadsheet often carries all three.
_WHITESPACE = r"E' \t\r\n'"


def upgrade():
    for table, column in COLUMNS:
        op.execute(
            f"UPDATE {table} SET {column} = TRIM(BOTH {_WHITESPACE} FROM {column}) "
            f"WHERE {column} IS NOT NULL AND {column} <> TRIM(BOTH {_WHITESPACE} FROM {column})"
        )


def downgrade():
    # Whitespace that was removed cannot be put back, and nothing depends on it being there.
    pass
