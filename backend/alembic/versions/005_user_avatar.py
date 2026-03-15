"""Add avatar to user

Revision ID: 005
Revises: 004
Create Date: 2026-03-15
"""
from alembic import op
import sqlalchemy as sa

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("user", sa.Column("avatar", sa.Text, nullable=True))


def downgrade():
    op.drop_column("user", "avatar")
