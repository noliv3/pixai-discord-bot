"""Image storage module.

Saves incoming images scaled to fit within a 16:9 box and writes metadata
including tagging results to disk.
"""

import json
import logging
import secrets
import time
from io import BytesIO
from pathlib import Path

from PIL import Image as PILImage

from . import tagging, nsfw_scanner

logger = logging.getLogger(__name__)
BASE_DIR = Path("scanned")


def _scale_image(
    img: PILImage.Image,
    max_width: int = 1280,
    max_height: int = 720,
) -> PILImage.Image:
    """Scale image to fit within max dimensions while keeping aspect ratio."""
    img = img.copy()
    img.thumbnail((max_width, max_height))
    return img


def process_image(data: bytes, *, tags=None, nsfw_meta=None, danbooru_tags=None):
    """Save the image and metadata to disk."""
    if tags is None:
        try:
            tags = tagging.process_image(data).get("tags")
        except Exception:  # pragma: no cover - optional dependency
            logging.exception("Tagging failed")
            tags = None

    if nsfw_meta is None:
        try:
            nsfw_meta = nsfw_scanner.process_image(data)
        except Exception:  # pragma: no cover - optional dependency
            logging.exception("NSFW scan failed")
            nsfw_meta = {}
    try:
        with PILImage.open(BytesIO(data)) as img:
            img = img.convert("RGB")
            img = _scale_image(img)
            month_dir = BASE_DIR / time.strftime("%Y_%m")
            month_dir.mkdir(parents=True, exist_ok=True)
            timestamp = time.strftime("%Y%m%d_%H%M%S")
            unique = secrets.token_hex(3)
            path = month_dir / f"{timestamp}_{unique}.jpg"
            img.save(path, format="JPEG")
            meta = {
                "width": img.width,
                "height": img.height,
                "tags": tags,
                "danbooru_tags": danbooru_tags,
            }
            meta.update(nsfw_meta)
            meta_path = path.with_suffix(".json")
            with meta_path.open("w") as f:
                json.dump(meta, f)
            result = {"path": str(path), "metadata": meta}
            logger.info("Stored image at %s", result["path"])
            logger.debug("Metadata: %s", meta)
            return result
    except Exception as exc:
        logging.exception("Failed to store image")
        return {"error": str(exc)}
