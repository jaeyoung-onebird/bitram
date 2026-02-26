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
}

# Twitter bot — 20 tweets/day, active hours focused (KST)
_TWEET_TIMES_KST = [
    (8, 10), (9, 5), (9, 55), (10, 45), (11, 30),
    (12, 20), (13, 10), (14, 0), (14, 50), (15, 35),
    (16, 25), (17, 15), (18, 5), (18, 55), (19, 45),
    (20, 35), (21, 25), (22, 20), (23, 15), (1, 10),
]
for _i, (_h, _m) in enumerate(_TWEET_TIMES_KST):
    app.conf.beat_schedule[f"twitter-{_i:02d}"] = {
        "task": "tasks.twitter_tasks.post_scheduled_tweet",
        "schedule": crontab(hour=(_h - 9) % 24, minute=_m),
    }

# Twitter threads — 3 times/day (morning, afternoon, evening KST)
_THREAD_TIMES_KST = [(9, 0), (15, 0), (21, 0)]
for _i, (_h, _m) in enumerate(_THREAD_TIMES_KST):
    app.conf.beat_schedule[f"twitter-thread-{_i:02d}"] = {
        "task": "tasks.twitter_tasks.post_scheduled_thread",
        "schedule": crontab(hour=(_h - 9) % 24, minute=_m),
    }

# Auto-discover tasks
app.autodiscover_tasks(["tasks"])

# Explicit imports for reliable task registration
import tasks.data_tasks  # noqa: F401, E402
import tasks.twitter_tasks  # noqa: F401, E402
import tasks.notification_tasks  # noqa: F401, E402
import tasks.email_tasks  # noqa: F401, E402
