"""APScheduler setup — daily reminder and database backup jobs."""
import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


def start_scheduler() -> None:
    scheduler.add_job(run_daily_reminders, CronTrigger(hour=9, minute=0), id="daily_reminders", replace_existing=True)

    from core.config import settings
    if settings.BACKUP_SCHEDULE:
        try:
            trigger = CronTrigger.from_crontab(settings.BACKUP_SCHEDULE)
            scheduler.add_job(run_scheduled_backup, trigger, id="db_backup", replace_existing=True)
            logger.info(f"Backup job scheduled: {settings.BACKUP_SCHEDULE}")
        except Exception as e:
            logger.warning(f"Invalid BACKUP_SCHEDULE '{settings.BACKUP_SCHEDULE}': {e} — backup job not scheduled")

    scheduler.start()
    logger.info("Scheduler started — daily reminders at 09:00")


def stop_scheduler() -> None:
    scheduler.shutdown(wait=False)
    logger.info("Scheduler stopped")


async def run_scheduled_backup() -> None:
    """Entry point for the scheduled pgbackrest full backup job."""
    from services.backup import run_backup
    logger.info("Running scheduled pgbackrest full backup")
    try:
        await run_backup("full")
        logger.info("Scheduled pgbackrest backup completed")
    except Exception as e:
        logger.error(f"Scheduled backup failed: {e}")


async def run_daily_reminders() -> None:
    """Entry point for the daily reminder job — runs all reminder checks."""
    from core.database import SessionLocal
    from core.reminders import send_all_reminders
    logger.info("Running daily reminders")
    with SessionLocal() as db:
        await send_all_reminders(db)
    logger.info("Daily reminders complete")
