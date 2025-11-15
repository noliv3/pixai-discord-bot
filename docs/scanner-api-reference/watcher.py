"""Module change watcher using watchdog.

`start_watcher` returns the underlying ``Observer`` instance. It should be
stopped with ``observer.stop()`` and ``observer.join()`` when the program
terminates.
"""

from pathlib import Path
from threading import Thread
from typing import Callable

from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

WATCH_PATHS = [Path("modules"), Path("modules.cfg")]


class ChangeHandler(FileSystemEventHandler):
    def __init__(self, callback: Callable[[], None]):
        self.callback = callback

    def on_any_event(self, event):
        # Trigger callback on any event affecting watched paths
        if event.is_directory:
            return
        print(f"Detected change: {event.src_path}")
        self.callback()


def start_watcher(on_change: Callable[[], None]):
    """Start watchdog observer in a separate thread."""
    handler = ChangeHandler(on_change)
    observer = Observer()
    for path in WATCH_PATHS:
        # Watch the file directly to avoid reacting to unrelated changes
        observer.schedule(handler, str(path), recursive=path.is_dir())
    observer_thread = Thread(target=observer.start, daemon=True)
    observer_thread.start()
    return observer
