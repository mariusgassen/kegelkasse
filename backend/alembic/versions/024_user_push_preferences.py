"""Add push_preferences JSON column to user

Revision ID: 024
Revises: 023
Create Date: 2026-03-17
"""
import sqlalchemy as sa
from alembic import op

revision = "024"
down_revision = "023"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("user", sa.Column("push_preferences", sa.JSON(), nullable=True))


def downgrade():
    op.drop_column("user", "push_preferences")
