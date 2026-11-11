"""Community-driven roadmap and member upvotes for Kegelkasse 2.0.

Creates roadmap_item and roadmap_vote tables and seeds official Kegelkasse 2.0
roadmap milestones so they are immediately visible in the community roadmap.
"""
from alembic import op
import sqlalchemy as sa

revision = '072'
down_revision = '071'
branch_labels = None
depends_on = None

OFFICIAL_ITEMS = [
    {
        "title": "In-App Community-Roadmap & Feedback",
        "description": "Direkt aus der App Ideen und Feedback einreichen, über geplante Features abstimmen und Entwicklungsschritte verfolgen.",
        "status": "in_progress",
        "category": "feature",
        "target_version": "2.0",
        "is_official": True,
        "author_name": "Kegelkasse Team",
    },
    {
        "title": "Desktop-Master-Detail",
        "description": "Zweispaltige Master-Detail-Ansicht auf Desktop und Tablets für schnelleres Navigieren (#75).",
        "status": "planned",
        "category": "feature",
        "target_version": "2.0",
        "is_official": True,
        "author_name": "Kegelkasse Team",
    },
    {
        "title": "Onboarding, App-Shortcuts & Sprach-Schnellerfassung",
        "description": "Geführter Einstieg für Neulinge, direkte PWA-Shortcuts auf dem Homescreen und Spracheingabe für Strafen (#76).",
        "status": "planned",
        "category": "feature",
        "target_version": "2.0",
        "is_official": True,
        "author_name": "Kegelkasse Team",
    },
    {
        "title": "Königs-Tippspiel",
        "description": "Vor dem Eröffnungsspiel auf den nächsten Kegelkönig tippen, Extrapunkte im Saisonrückblick (Wrapped) und Auszeichnungen.",
        "status": "idea",
        "category": "feature",
        "target_version": "2.0",
        "is_official": True,
        "author_name": "Kegelkasse Team",
    },
    {
        "title": "Geburtstage und Jubiläen",
        "description": "Automatische Erinnerung im nächsten Termin, Glückwunsch-Banner und Option für eine Geburtstagsrunde.",
        "status": "idea",
        "category": "feature",
        "target_version": "2.0",
        "is_official": True,
        "author_name": "Kegelkasse Team",
    },
    {
        "title": "Admin-Audit-Log",
        "description": "Revisionssicheres Änderungsprotokoll: Wer hat welche Buchung, Strafe oder Vereinseinstellung geändert.",
        "status": "idea",
        "category": "feature",
        "target_version": "2.1",
        "is_official": True,
        "author_name": "Kegelkasse Team",
    },
    {
        "title": "Bank-Import (CSV / CAMT)",
        "description": "Kontoauszug einlesen und Überweisungen automatisch offenen Strafen und Beiträgen zuordnen.",
        "status": "idea",
        "category": "feature",
        "target_version": "2.1",
        "is_official": True,
        "author_name": "Kegelkasse Team",
    },
    {
        "title": "Sticker-Wand",
        "description": "Vereins-Sticker auf der interaktiven Weltkarte sammeln, Fotos hochladen und durchsuchen.",
        "status": "completed",
        "category": "feature",
        "target_version": "1.73",
        "is_official": True,
        "author_name": "Kegelkasse Team",
    },
    {
        "title": "Zeugwart-Inventar",
        "description": "Material, Pokale, Pins und Zubehör mit Zu- und Abgängen und Soll-Beständen verwalten.",
        "status": "completed",
        "category": "feature",
        "target_version": "1.72",
        "is_official": True,
        "author_name": "Kegelkasse Team",
    },
    {
        "title": "KI-Suche & intelligenter Assistent",
        "description": "Antworten auf Vereinsfragen in natürlicher Sprache und globale Schnellsuche über Termine, Strafen und Sticker.",
        "status": "completed",
        "category": "feature",
        "target_version": "1.71",
        "is_official": True,
        "author_name": "Kegelkasse Team",
    },
]


def upgrade():
    roadmap_item_table = op.create_table(
        'roadmap_item',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('club_id', sa.Integer(), sa.ForeignKey('club.id', ondelete='CASCADE'), nullable=True),
        sa.Column('created_by_user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('author_name', sa.String(length=100), nullable=True),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='idea'),
        sa.Column('category', sa.String(length=30), nullable=True, server_default='feature'),
        sa.Column('target_version', sa.String(length=20), nullable=True),
        sa.Column('is_official', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('ix_roadmap_item_id', 'roadmap_item', ['id'])
    op.create_index('ix_roadmap_item_club_id', 'roadmap_item', ['club_id'])
    op.create_index('ix_roadmap_item_status', 'roadmap_item', ['status'])

    op.create_table(
        'roadmap_vote',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('item_id', sa.Integer(), sa.ForeignKey('roadmap_item.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint('item_id', 'user_id', name='uq_roadmap_vote'),
    )
    op.create_index('ix_roadmap_vote_id', 'roadmap_vote', ['id'])
    op.create_index('ix_roadmap_vote_item_id', 'roadmap_vote', ['item_id'])
    op.create_index('ix_roadmap_vote_user_id', 'roadmap_vote', ['user_id'])

    # Seed official items
    op.bulk_insert(roadmap_item_table, OFFICIAL_ITEMS)


def downgrade():
    op.drop_table('roadmap_vote')
    op.drop_table('roadmap_item')
