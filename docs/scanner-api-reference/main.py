"""Dynamic module loader and watcher.

This module is intentionally limited to loading and reloading modules.
All processing logic belongs in the modules themselves or in separate
components such as the API. ``main.py`` should only orchestrate module
management so that malfunctioning modules remain isolated.
"""

import importlib
import sys
from pathlib import Path
from typing import Dict
from threading import RLock

from watcher import start_watcher

MODULES_CFG = Path("modules.cfg")


class ModuleManager:
    """Handles dynamic loading and reloading of modules."""

    def __init__(self):
        self.modules: Dict[str, object] = {}
        self.lock = RLock()
        self.version = 0
        self.load_modules()

    def load_modules(self):
        """Load modules listed in modules.cfg."""
        if not MODULES_CFG.exists():
            print("Config file not found:", MODULES_CFG)
            return
        with MODULES_CFG.open() as cfg:
            names = [
                line.strip() for line in cfg
                if line.strip() and not line.startswith('#')
            ]

        # Load modules without modifying the currently active ones
        new_modules: Dict[str, object] = {}
        for name in names:
            module = self._load_module(name)
            if module is not None:
                new_modules[name] = module

        with self.lock:
            old_modules = self.modules
            self.modules = new_modules
            self.version += 1

        # Unload modules that are no longer active
        for name in set(old_modules) - set(new_modules):
            sys.modules.pop(name, None)
            print(f"Unloaded module: {name}")

    def _load_module(self, name: str):
        try:
            existing = None
            with self.lock:
                if name in self.modules:
                    existing = self.modules[name]
            if existing is not None:
                module = importlib.reload(existing)
            else:
                module = importlib.import_module(name)
            print(f"Loaded module: {name}")
            return module
        except Exception as exc:
            print(f"Failed to load {name}: {exc}")
            return None

    def reload_all(self):
        """Reload all modules from the configuration file."""
        print("Reloading modules...")
        self.load_modules()

    def get_modules(self) -> Dict[str, object]:
        """Return a snapshot of the loaded modules."""
        with self.lock:
            return dict(self.modules)


def on_change(manager: ModuleManager):
    """Callback for watcher when files change."""
    manager.reload_all()


def main():
    manager = ModuleManager()
    observer = start_watcher(lambda: on_change(manager))
    print("Watcher started. Press Ctrl+C to exit.")
    try:
        while True:
            # Run a loop to keep the process alive and show loaded modules
            for mod in list(manager.modules.values()):
                if hasattr(mod, "run"):
                    mod.run()
            import time
            time.sleep(2)
    except KeyboardInterrupt:
        print("Exiting...")
        observer.stop()
        observer.join()


if __name__ == "__main__":
    main()
