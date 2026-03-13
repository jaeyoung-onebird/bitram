#!/usr/bin/env python3
"""Check USDC balance, open positions, and today's PnL."""
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


async def main() -> None:
    from src.config import load_config
    from src.polymarket.client import PolymarketClient

    cfg = load_config(dry_run=True)

    if not cfg.credentials.private_key:
        print("ERROR: PRIVATE_KEY not set in .env")
        sys.exit(1)

    client = PolymarketClient(cfg.credentials, dry_run=True)

    print("=== Polymarket Account Status ===\n")

    # Check connection
    try:
        ok = await client.verify_connection()
        print(f"API Connection: {'OK' if ok else 'FAILED'}")
    except Exception as e:
        print(f"API Connection: FAILED ({e})")

    # Get open orders
    try:
        orders = await client.get_open_orders()
        print(f"Open Orders: {len(orders)}")
        for o in orders[:5]:
            print(f"  {o.get('side', '?')} {o.get('size', '?')} @ ${o.get('price', '?')} — {o.get('asset_id', '?')[:16]}...")
    except Exception as e:
        print(f"Open Orders: error ({e})")

    await client.close()
    print("\nDone.")


if __name__ == "__main__":
    asyncio.run(main())
