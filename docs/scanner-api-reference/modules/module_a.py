"""Sample module A.

This module demonstrates the standard ``process_image`` interface.
"""

import logging

logger = logging.getLogger(__name__)


def run():
    logger.info("Module A running")


def process_image(data: bytes):
    """Trivial image processor.

    Prints the size of the received image and returns it in a dict.
    """
    size = len(data)
    logger.info("Processed image with %d bytes", size)
    return {"size": size}
