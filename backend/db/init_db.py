"""
Database initialization script.
Runs Alembic migrations up to head.
Run: python -m db.init_db
"""
import subprocess
import sys
from pathlib import Path


def init():
    backend_dir = Path(__file__).resolve().parents[1]
    print("Applying Alembic migrations...")

    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=str(backend_dir),
        check=False,
    )
    if result.returncode != 0:
        raise SystemExit(result.returncode)
    print("Database migration complete.")


if __name__ == "__main__":
    init()
