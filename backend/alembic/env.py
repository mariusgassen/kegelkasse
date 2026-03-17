from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from core.config import settings
from core.database import Base
import app.models  # noqa: F401 — registers all models with Base.metadata for Alembic autogenerate

config = context.config
if config.config_file_name:
    fileConfig(config.config_file_name)

config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)
target_metadata = Base.metadata

def run_offline():
    context.configure(url=settings.DATABASE_URL, target_metadata=target_metadata,
                      literal_binds=True, dialect_opts={"paramstyle": "named"})
    with context.begin_transaction():
        context.run_migrations()

def run_online():
    engine = engine_from_config(config.get_section(config.config_ini_section),
                                 prefix="sqlalchemy.", poolclass=pool.NullPool)
    with engine.connect() as conn:
        context.configure(connection=conn, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_offline()
else:
    run_online()
