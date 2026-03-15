"""Add username to user

Revision ID: 004
Revises: 003
Create Date: 2026-03-15
"""
from alembic import op
import sqlalchemy as sa

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("user",
        sa.Column("username", sa.String, nullable=True)
    )
    op.create_index("ix_user_username", "user", ["username"], unique=True)


def downgrade():
    op.drop_index("ix_user_username", "user")
    op.drop_column("user", "username")
