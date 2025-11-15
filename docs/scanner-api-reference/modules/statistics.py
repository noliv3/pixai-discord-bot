"""Statistics module for tracking processed images and tag frequencies."""

from __future__ import annotations

import json
import logging
import threading
from pathlib import Path
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


STATS_FILE = Path("scanned/statistics.json")

_count = 0

# Global dictionary of tag -> count
tag_counts: Dict[str, int] = {}

# Lock to guard updates to statistics
_LOCK = threading.Lock()


def _load() -> None:
    """Load statistics from ``STATS_FILE`` if available."""
    global _count, tag_counts
    if STATS_FILE.exists():
        try:
            with STATS_FILE.open() as f:
                data = json.load(f)
            _count = int(data.get("count", 0))
            tag_counts = {
                str(k): int(v) for k, v in data.get("tag_counts", {}).items()
            }
        except Exception:
            _count = 0
            tag_counts = {}


def _save() -> None:
    """Persist current statistics to ``STATS_FILE``."""
    with _LOCK:
        _save_locked()


def _save_locked() -> None:
    """Persist statistics without acquiring the lock (internal)."""
    try:
        STATS_FILE.parent.mkdir(parents=True, exist_ok=True)
        with STATS_FILE.open("w") as f:
            json.dump({"count": _count, "tag_counts": tag_counts}, f)
    except Exception:
        pass


def record_tags(tags: List[str]) -> None:
    """Record tag occurrences in ``tag_counts``."""
    with _LOCK:
        _record_tags_locked(tags)


def _record_tags_locked(tags: List[str]) -> None:
    """Record tags without acquiring the lock (internal)."""
    for tag in tags:
        tag_counts[tag] = tag_counts.get(tag, 0) + 1
    logger.debug("Recorded tags: %s", tags)


def get_top_tags(n: int = 5) -> List[str]:
    """Return the ``n`` most common tags sorted by frequency."""
    return [
        tag
        for tag, _ in sorted(
            tag_counts.items(), key=lambda x: x[1], reverse=True
        )[:n]
    ]


def process_image(data: bytes, *, tags: Optional[List[str]] = None):
    """Increase the image count and optionally record associated tags."""
    global _count
    with _LOCK:
        _count += 1
        logger.info("Image count increased to %d", _count)

        if tags is None:
            try:  # pragma: no cover - optional dependency
                from . import tagging

                result = tagging.process_image(data)
                tags = [
                    t.get("label")
                    for t in result.get("tags", [])
                    if isinstance(t, dict)
                ]
            except Exception:
                tags = None

        if tags:
            _record_tags_locked(tags)

        _save_locked()
        return {"count": _count}


def get_statistics() -> Dict[str, object]:
    """Return total count and the most common tags."""
    return {"count": _count, "top_tags": get_top_tags()}


_load()
