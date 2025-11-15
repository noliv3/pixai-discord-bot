import json
import secrets
from pathlib import Path
import time

try:
    import fcntl  # type: ignore
    LOCK_SH = fcntl.LOCK_SH
    LOCK_EX = fcntl.LOCK_EX

    def _lock(f, flag):
        fcntl.flock(f, flag)

    def _unlock(f):
        fcntl.flock(f, fcntl.LOCK_UN)
except Exception:  # pragma: no cover - depends on platform
    import portalocker

    LOCK_SH = portalocker.LOCK_SH
    LOCK_EX = portalocker.LOCK_EX

    def _lock(f, flag):
        portalocker.lock(f, flag)

    def _unlock(f):
        portalocker.unlock(f)

TOKENS_FILE = Path('tokens.json')
EXPIRY_SECONDS = 3600 * 24 * 30  # 30 days


def _load_tokens() -> dict:
    if not TOKENS_FILE.exists():
        return {}
    try:
        with TOKENS_FILE.open() as f:
            _lock(f, LOCK_SH)
            try:
                return json.load(f)
            except Exception:
                return {}
            finally:
                _unlock(f)
    except Exception:
        return {}


def _save_tokens(tokens: dict) -> None:
    try:
        with TOKENS_FILE.open('w') as f:
            _lock(f, LOCK_EX)
            json.dump(tokens, f)
            _unlock(f)
    except Exception:
        pass


def _cleanup(tokens: dict) -> None:
    now = int(time.time())
    removed = []
    for email, info in list(tokens.items()):
        if isinstance(info, dict):
            token = info.get("token")
            ts = int(info.get("ts", 0))
        else:  # legacy format
            token = info
            ts = 0
        if now - ts > EXPIRY_SECONDS:
            removed.append(email)
    for email in removed:
        tokens.pop(email, None)
    if removed:
        _save_tokens(tokens)


def get_token(email: str, *, renew: bool = False) -> str:
    tokens = _load_tokens()
    _cleanup(tokens)
    if renew or email not in tokens:
        tokens[email] = {"token": secrets.token_hex(16), "ts": int(time.time())}
        _save_tokens(tokens)
    else:
        info = tokens[email]
        if isinstance(info, dict):
            return info.get("token")
        return info
    return tokens[email]["token"]


def is_valid_token(token: str) -> bool:
    tokens = _load_tokens()
    _cleanup(tokens)
    for info in tokens.values():
        if isinstance(info, dict):
            if info.get("token") == token:
                return True
        elif info == token:  # legacy
            return True
    return False
