"""Initial schema

Revision ID: 001
Revises:
Create Date: 2026-03-15
"""
from alembic import op
import sqlalchemy as sa

revision = "001"
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    op.create_table("club",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("slug", sa.String, nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_table("club_setting",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("club_id", sa.Integer, sa.ForeignKey("club.id"), unique=True, nullable=False),
        sa.Column("home_venue", sa.String),
        sa.Column("logo_url", sa.String),
        sa.Column("primary_color", sa.String, default="#e8a020"),
        sa.Column("secondary_color", sa.String, default="#6b7c5a"),
        sa.Column("extra", sa.JSON, default=dict),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
    )
    op.create_table("user",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("email", sa.String, nullable=False, unique=True),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("hashed_password", sa.String, nullable=False),
        sa.Column("role", sa.Enum("superadmin","admin","member", name="userrole")),
        sa.Column("club_id", sa.Integer, sa.ForeignKey("club.id")),
        sa.Column("is_active", sa.Boolean, default=True),
        sa.Column("preferred_locale", sa.String, default="de"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
    )
    op.create_table("invite_token",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("token", sa.String, nullable=False, unique=True),
        sa.Column("club_id", sa.Integer, sa.ForeignKey("club.id"), nullable=False),
        sa.Column("created_by", sa.Integer, sa.ForeignKey("user.id"), nullable=False),
        sa.Column("used_by", sa.Integer, sa.ForeignKey("user.id")),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True)),
    )
    op.create_table("regular_member",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("club_id", sa.Integer, sa.ForeignKey("club.id"), nullable=False),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("nickname", sa.String),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("user.id")),
        sa.Column("is_active", sa.Boolean, default=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_table("penalty_type",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("club_id", sa.Integer, sa.ForeignKey("club.id"), nullable=False),
        sa.Column("icon", sa.String, default="⚠️"),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("default_amount", sa.Float, default=0.5),
        sa.Column("is_active", sa.Boolean, default=True),
        sa.Column("sort_order", sa.Integer, default=0),
    )
    op.create_table("game_template",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("club_id", sa.Integer, sa.ForeignKey("club.id"), nullable=False),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("winner_type", sa.Enum("team","individual","either", name="winnertype")),
        sa.Column("is_opener", sa.Boolean, default=False),
        sa.Column("default_loser_penalty", sa.Float, default=0),
        sa.Column("sort_order", sa.Integer, default=0),
        sa.Column("is_active", sa.Boolean, default=True),
    )
    op.create_table("evening",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("club_id", sa.Integer, sa.ForeignKey("club.id"), nullable=False),
        sa.Column("date", sa.String, nullable=False),
        sa.Column("venue", sa.String),
        sa.Column("note", sa.Text),
        sa.Column("is_closed", sa.Boolean, default=False),
        sa.Column("created_by", sa.Integer, sa.ForeignKey("user.id")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
    )
    op.create_table("team",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("evening_id", sa.Integer, sa.ForeignKey("evening.id"), nullable=False),
        sa.Column("name", sa.String, nullable=False),
    )
    op.create_table("evening_player",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("evening_id", sa.Integer, sa.ForeignKey("evening.id"), nullable=False),
        sa.Column("regular_member_id", sa.Integer, sa.ForeignKey("regular_member.id")),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("team_id", sa.Integer, sa.ForeignKey("team.id")),
    )
    op.create_table("penalty_log",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("evening_id", sa.Integer, sa.ForeignKey("evening.id"), nullable=False),
        sa.Column("player_id", sa.Integer, sa.ForeignKey("evening_player.id")),
        sa.Column("team_id", sa.Integer, sa.ForeignKey("team.id")),
        sa.Column("player_name", sa.String, nullable=False),
        sa.Column("penalty_type_name", sa.String, nullable=False),
        sa.Column("icon", sa.String, default="⚠️"),
        sa.Column("amount", sa.Float, nullable=False),
        sa.Column("mode", sa.Enum("euro","count", name="penaltymode")),
        sa.Column("is_deleted", sa.Boolean, default=False),
        sa.Column("created_by", sa.Integer, sa.ForeignKey("user.id")),
        sa.Column("client_timestamp", sa.Float, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_table("game",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("evening_id", sa.Integer, sa.ForeignKey("evening.id"), nullable=False),
        sa.Column("template_id", sa.Integer, sa.ForeignKey("game_template.id")),
        sa.Column("sort_order", sa.Integer, default=0),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("is_opener", sa.Boolean, default=False),
        sa.Column("winner_type", sa.Enum("team","individual","either", name="winnertype2")),
        sa.Column("winner_ref", sa.String),
        sa.Column("winner_name", sa.String),
        sa.Column("scores", sa.JSON, default=dict),
        sa.Column("loser_penalty", sa.Float, default=0),
        sa.Column("note", sa.Text),
        sa.Column("is_deleted", sa.Boolean, default=False),
        sa.Column("client_timestamp", sa.Float, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_table("drink_round",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("evening_id", sa.Integer, sa.ForeignKey("evening.id"), nullable=False),
        sa.Column("drink_type", sa.Enum("beer","shots", name="drinktype")),
        sa.Column("variety", sa.String),
        sa.Column("participant_ids", sa.JSON, default=list),
        sa.Column("is_deleted", sa.Boolean, default=False),
        sa.Column("client_timestamp", sa.Float, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )

def downgrade():
    for t in ["drink_round","game","penalty_log","evening_player","team",
              "evening","game_template","penalty_type","regular_member",
              "invite_token","user","club_setting","club"]:
        op.drop_table(t)
    for e in ["userrole","penaltymode","winnertype","winnertype2","drinktype"]:
        op.execute(f"DROP TYPE IF EXISTS {e}")