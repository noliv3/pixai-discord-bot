"""Tagging module using DeepDanbooru.

This module applies a DeepDanbooru model to classify anime style or AI
generated images. The result mirrors the ``modules.tagging`` output and
returns a list of tags with confidence scores.
"""

import logging
from io import BytesIO
from pathlib import Path

import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)

try:
    import tensorflow as tf
except Exception:
    tf = None

_MODEL = None
_TAGS = None
PROJECT_PATH = Path(__file__).with_name("deepdanbooru_model")


def _ensure_model():
    """Load DeepDanbooru model and tag list if available."""
    global _MODEL, _TAGS
    if _MODEL is None:
        if tf is None:
            raise RuntimeError("TensorFlow not available")
        if not PROJECT_PATH.exists():
            raise FileNotFoundError(f"Model directory missing: {PROJECT_PATH}")
        model_path = PROJECT_PATH / "model-resnet_custom_v3.h5"
        tags_path = PROJECT_PATH / "tags.txt"
        _MODEL = tf.keras.models.load_model(str(model_path), compile=False)
        with open(tags_path, "r", encoding="utf-8") as f:
            _TAGS = [line.strip() for line in f.readlines()]
    return _MODEL, _TAGS


def process_image(data: bytes):
    """Return DeepDanbooru tag predictions for the image."""
    if tf is None:
        return {"error": "TensorFlow not installed"}
    try:
        model, tags = _ensure_model()
    except Exception as exc:
        logger.exception("Failed to load DeepDanbooru model")
        return {"error": str(exc)}

    try:
        with Image.open(BytesIO(data)) as img:
            img = img.convert("RGB")
            img = img.resize((512, 512), Image.BICUBIC)
            arr = np.asarray(img).astype(np.float32) / 255.0
            arr = arr.reshape((1, 512, 512, 3))
    except Exception as exc:
        logger.exception("Failed to preprocess image")
        return {"error": str(exc)}

    try:
        preds = model.predict(arr)[0]
        result_tags = [
            {"label": tag, "score": float(score)}
            for tag, score in zip(tags, preds)
            if float(score) > 0.2  # optional Threshold
        ]
        result_tags.sort(key=lambda x: x["score"], reverse=True)
        logger.info("DeepDanbooru tags: %s", result_tags[:5])
        return {"tags": result_tags}
    except Exception as exc:
        logger.exception("DeepDanbooru prediction failed")
        return {"error": str(exc)}
