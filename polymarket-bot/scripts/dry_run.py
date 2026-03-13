#!/usr/bin/env python3
"""Quick dry-run: one cycle of the maker bot."""
import subprocess
import sys
from pathlib import Path

project_root = Path(__file__).resolve().parent.parent
sys.exit(subprocess.run(
    [sys.executable, "-m", "src.main", "--dry-run", "--once"],
    cwd=project_root,
).returncode)
