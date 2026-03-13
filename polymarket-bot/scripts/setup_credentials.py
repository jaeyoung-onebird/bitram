#!/usr/bin/env python3
"""Generate Polymarket API credentials from private key.

Run once: python scripts/setup_credentials.py
Appends POLY_API_KEY, POLY_API_SECRET, POLY_API_PASSPHRASE to .env
"""
import os
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env")


def main() -> None:
    private_key = os.getenv("PRIVATE_KEY", "")
    if not private_key:
        print("ERROR: PRIVATE_KEY not set in .env")
        print("Copy .env.example to .env and fill in your private key first.")
        sys.exit(1)

    chain_id = int(os.getenv("CHAIN_ID", "137"))
    sig_type = int(os.getenv("SIGNATURE_TYPE", "0"))
    safe_address = os.getenv("SAFE_ADDRESS", "")

    print(f"Private key: {private_key[:6]}...{private_key[-4:]}")
    print(f"Chain ID: {chain_id}")
    print(f"Signature type: {sig_type}")
    if safe_address:
        print(f"Safe address: {safe_address}")

    try:
        from py_clob_client.client import ClobClient

        client = ClobClient(
            "https://clob.polymarket.com",
            key=private_key,
            chain_id=chain_id,
            signature_type=sig_type,
            funder=safe_address or None,
        )

        print("\nDeriving API credentials...")
        creds = client.create_or_derive_api_creds()

        print(f"API Key:        {creds.api_key}")
        print(f"API Secret:     {creds.api_secret[:8]}...")
        print(f"API Passphrase: {creds.api_passphrase[:8]}...")

        # Append to .env
        env_path = PROJECT_ROOT / ".env"
        with open(env_path, "a") as f:
            f.write(f"\n# Auto-generated Polymarket API credentials\n")
            f.write(f"POLY_API_KEY={creds.api_key}\n")
            f.write(f"POLY_API_SECRET={creds.api_secret}\n")
            f.write(f"POLY_API_PASSPHRASE={creds.api_passphrase}\n")

        print(f"\n✓ Credentials written to {env_path}")

    except ImportError:
        print("ERROR: py-clob-client not installed. Run: pip install py-clob-client")
        sys.exit(1)
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
