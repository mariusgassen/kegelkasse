"""
Bootstrap script — creates the first superadmin user, default club,
and seeds the club with default penalty types and game templates.
Run via: python -m app.scripts.create_admin
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../.."))

from core.database import SessionLocal
from core.security import get_password_hash
from core.config import settings
from models.user import User, UserRole
from models.club import Club, ClubSettings
from models.penalty import PenaltyType
from models.game import GameTemplate, WinnerType

DEFAULT_PENALTY_TYPES = [
    ("⏰", "Zu spät", 0.50, 0),
    ("🚫", "Gosse", 0.10, 1),
    ("💥", "Bande", 0.50, 2),
]

DEFAULT_GAME_TEMPLATES = [
    # name, description, winner_type, is_opener, default_loser_penalty, sort_order
    ("Große Hausnummer", "Eröffnungsspiel", "individual", True, 1.00, 0),
    ("Kleine Hausnummer", "Kleines Hausspiel", "individual", False, 0.50, 1),
    ("Fass", "Alle Kegel auf einmal abräumen", "team", False, 0.50, 2),
    ("Bunkern", "Verteidigungs-Kegelspiel", "team", False, 0.50, 3),
    ("Fußball", "Team-Spiel mit Fußball-Regeln", "team", False, 0.50, 4),
    ("Klassisch", "Standard-Kegelrunde", "individual", False, 0.00, 5),
]


def main():
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == settings.FIRST_SUPERADMIN_EMAIL).first()
        if existing:
            print(f"Superadmin already exists: {settings.FIRST_SUPERADMIN_EMAIL}")
            return

        # Create club
        club = Club(name="Kegelkasse", slug="kegelkasse")
        db.add(club)
        db.flush()

        # Club settings with default brand colors
        club_settings = ClubSettings(
            club_id=club.id,
            home_venue="Altes Schalthaus, Darmstadt",
            primary_color="#e8a020",
            secondary_color="#6b7c5a"
        )
        db.add(club_settings)

        # Default penalty types
        for icon, name, amount, order in DEFAULT_PENALTY_TYPES:
            db.add(PenaltyType(club_id=club.id, icon=icon, name=name,
                               default_amount=amount, sort_order=order))

        # Default game templates
        for name, desc, wtype, is_opener, penalty, order in DEFAULT_GAME_TEMPLATES:
            db.add(GameTemplate(
                club_id=club.id, name=name, description=desc,
                winner_type=WinnerType(wtype), is_opener=is_opener,
                default_loser_penalty=penalty, sort_order=order
            ))

        # Superadmin
        admin = User(
            email=settings.FIRST_SUPERADMIN_EMAIL,
            name="Admin",
            hashed_password=get_password_hash(settings.FIRST_SUPERADMIN_PASSWORD),
            role=UserRole.superadmin,
            club_id=club.id
        )
        db.add(admin)
        db.commit()

        print(f"✅ Created superadmin: {settings.FIRST_SUPERADMIN_EMAIL}")
        print(f"✅ Created club: {club.name} (id={club.id})")
        print(f"✅ Seeded {len(DEFAULT_PENALTY_TYPES)} penalty types, {len(DEFAULT_GAME_TEMPLATES)} game templates")
    finally:
        db.close()


if __name__ == "__main__":
    main()
