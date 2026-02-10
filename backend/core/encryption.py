"""
BITRAM Encryption Utilities
AES-256 encryption for API keys.
"""
from cryptography.fernet import Fernet
from config import get_settings

_fernet = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        settings = get_settings()
        key = settings.ENCRYPTION_KEY
        if not key:
            raise RuntimeError("ENCRYPTION_KEY is required and must be set in backend/.env")
        if isinstance(key, str):
            key = key.encode()
        try:
            _fernet = Fernet(key)
        except Exception as exc:
            raise RuntimeError("Invalid ENCRYPTION_KEY: must be a valid Fernet key") from exc
    return _fernet


def encrypt_key(plaintext: str) -> str:
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt_key(ciphertext: str) -> str:
    return _get_fernet().decrypt(ciphertext.encode()).decode()


def generate_encryption_key() -> str:
    return Fernet.generate_key().decode()
