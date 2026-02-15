"""
Celery application for background tasks.
"""
from celery import Celery
from celery.schedules import crontab
from config import get_settings

settings = get_settings()

app = Celery(
    "bitram",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Seoul",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)

# Periodic tasks
app.conf.beat_schedule = {
    "collect-ohlcv-1m": {
        "task": "tasks.data_tasks.collect_ohlcv",
        "schedule": 60.0,  # Every minute
        "args": ("1m",),
    },
    "collect-ohlcv-15m": {
        "task": "tasks.data_tasks.collect_ohlcv",
        "schedule": 900.0,  # Every 15 minutes
        "args": ("15m",),
    },
    "collect-ohlcv-1h": {
        "task": "tasks.data_tasks.collect_ohlcv",
        "schedule": 3600.0,
        "args": ("1h",),
    },
    "check-subscriptions": {
        "task": "tasks.data_tasks.check_expired_subscriptions",
        "schedule": crontab(hour=0, minute=5),
    },
    "weekly-digest": {
        "task": "tasks.notification_tasks.send_weekly_digest",
        "schedule": crontab(hour=0, minute=0, day_of_week="monday"),  # Monday 09:00 KST (00:00 UTC)
    },
    # Twitter bot (5 tweets/day, KST active hours)
    "twitter-morning": {
        "task": "tasks.twitter_tasks.post_scheduled_tweet",
        "schedule": crontab(hour=0, minute=30),  # 09:30 KST
    },
    "twitter-noon": {
        "task": "tasks.twitter_tasks.post_scheduled_tweet",
        "schedule": crontab(hour=3, minute=0),  # 12:00 KST
    },
    "twitter-afternoon": {
        "task": "tasks.twitter_tasks.post_scheduled_tweet",
        "schedule": crontab(hour=6, minute=0),  # 15:00 KST
    },
    "twitter-evening": {
        "task": "tasks.twitter_tasks.post_scheduled_tweet",
        "schedule": crontab(hour=9, minute=30),  # 18:30 KST
    },
    "twitter-night": {
        "task": "tasks.twitter_tasks.post_scheduled_tweet",
        "schedule": crontab(hour=12, minute=0),  # 21:00 KST
    },
}

# Auto-discover tasks
app.autodiscover_tasks(["tasks"])
