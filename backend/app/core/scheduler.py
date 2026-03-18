"""APScheduler setup — daily reminder job."""
import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


def start_scheduler() -> None:
    scheduler.add_job(run_daily_reminders, CronTrigger(hour=9, minute=0), id="daily_reminders", replace_existing=True)
    scheduler.start()
    logger.info("Scheduler started — daily reminders at 09:00")


def stop_scheduler() -> None:
    scheduler.shutdown(wait=False)
    logger.info("Scheduler stopped")


async def run_daily_reminders() -> None:
    """Entry point for the daily reminder job — runs all reminder checks."""
    from core.database import SessionLocal
    from core.reminders import send_all_reminders
    logger.info("Running daily reminders")
    with SessionLocal() as db:
        await send_all_reminders(db)
    logger.info("Daily reminders complete")
