"""Make password_reset_token.created_by nullable — self-service resets have no admin creator."""
from alembic import op
import sqlalchemy as sa

revision = '052'
down_revision = '051'
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column('password_reset_token', 'created_by',
                    existing_type=sa.Integer(), nullable=True)


def downgrade():
    op.alter_column('password_reset_token', 'created_by',
                    existing_type=sa.Integer(), nullable=False)
