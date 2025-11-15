"""Image tagging module using MobileNetV2.

This module detects objects in images and returns the top predictions.
"""

import logging
from io import BytesIO

logger = logging.getLogger(__name__)

from PIL import Image

try:
    from tensorflow.keras.applications.mobilenet_v2 import (
        MobileNetV2,
        decode_predictions,
        preprocess_input,
    )
    from tensorflow.keras.preprocessing.image import img_to_array
except Exception:  # pragma: no cover - optional dependency
    logger.exception("Failed to import TensorFlow MobileNetV2")
    MobileNetV2 = None
    decode_predictions = None
    preprocess_input = None

_model = None


def _ensure_model():
    """Load the MobileNetV2 model if available."""
    global _model
    if _model is None:
        if MobileNetV2 is None:
            raise RuntimeError("TensorFlow not available")
        _model = MobileNetV2(weights="imagenet")
    return _model


def process_image(data: bytes):
    """Return top image classification tags."""
    if MobileNetV2 is None:
        return {"error": "tensorflow not installed"}
    try:
        model = _ensure_model()
    except Exception as exc:  # pragma: no cover - environment dependent
        return {"error": str(exc)}
    try:
        with Image.open(BytesIO(data)) as img:
            img = img.convert("RGB")
            img = img.resize((224, 224))
            arr = img_to_array(img)
    except Exception as exc:
        logger.exception("Failed to preprocess image")
        return {"error": str(exc)}
    arr = preprocess_input(arr)
    import numpy as np

    batch = np.expand_dims(arr, axis=0)
    preds = model.predict(batch)
    decoded = decode_predictions(preds, top=3)[0]
    tags = [
        {"label": label, "score": float(score)}
        for (_, label, score) in decoded
    ]
    logger.info("Tags detected: %s", tags)
    return {"tags": tags}
