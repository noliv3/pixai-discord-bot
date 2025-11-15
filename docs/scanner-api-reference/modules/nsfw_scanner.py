"""NSFW detection module using ``nsfw_detector``.

The module lazily loads a pre-trained model and exposes a ``process_image``
function that returns prediction probabilities for the provided image bytes.
If the ``nsfw_detector`` library is not installed or no model is available,
``process_image`` returns an error dictionary instead of raising an exception.
The implementation is defensive: missing dependencies or model loading errors
are logged and communicated via the returned dictionary instead of raising
exceptions.
"""

import logging
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Dict

logger = logging.getLogger(__name__)

try:
    from nsfw_detector import predict
    import tensorflow as tf
except Exception:  # pragma: no cover - library may be missing
    logger.exception("Fehler beim Import von nsfw_detector:")
    predict = None
    tf = None


MODEL_PATH = Path(__file__).with_name("nsfw_model.h5")
_model = None


def _ensure_model():
    """Load the NSFW model if it hasn't been loaded yet."""
    global _model
    if _model is None:
        if predict is None:
            raise RuntimeError("nsfw_detector not importiert")
        if not MODEL_PATH.exists():
            raise FileNotFoundError(f"NSFW model fehlt: {MODEL_PATH}")
        logger.info("Lade Modell von: %s", MODEL_PATH)
        try:
            _model = predict.load_model(str(MODEL_PATH))
        except Exception:
            logger.exception(
                "Fehler beim Aufruf von predict.load_model, versuche tf.keras:"
            )
            if tf is None:
                raise
            _model = tf.keras.models.load_model(str(MODEL_PATH), compile=False)
    return _model


def process_image(data: bytes) -> Dict[str, float]:
    """Classify the given image bytes for NSFW content."""
    if predict is None:
        logger.error(
            "predict ist None – nsfw_detector konnte nicht geladen werden."
        )
        return {"error": "nsfw_detector not installed"}
    try:
        model = _ensure_model()
    except Exception as exc:  # pragma: no cover - dependent on environment
        logger.exception("Fehler beim Laden des Modells:")
        return {"error": str(exc)}

    tmp_path = None
    try:
        with NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
            tmp.write(data)
            tmp.flush()
            tmp_path = tmp.name

        preds = predict.classify(model, tmp_path)
        result = preds.get(tmp_path, {})
        logger.info("NSFW scores: %s", result)
        return result
    except Exception as e:
        logger.exception("Fehler bei der Bildklassifikation:")
        return {"error": str(e)}
    finally:
        if tmp_path:
            try:
                Path(tmp_path).unlink()
            except Exception:
                pass
