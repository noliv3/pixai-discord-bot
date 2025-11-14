# PixAI Discord Bot – Entwicklungsleitfaden

- ✅ Neue Implementierung lebt unter [`bot/`](./bot/). Alle Änderungen für den aktiven Bot passieren dort.
- 📁 Die Legacy-Fassung bleibt in [`_archived/`](./_archived/) und ist nur Referenz – keine Änderungen ohne ausdrückliche Aufgabe.
- 🧾 Dokumentation pflegen: Diese Datei und die README-Dateien müssen bei Strukturänderungen aktualisiert werden.
- 🔐 Sensible Dateien (`bot/config/bot-config.json`, `bot/data/`) gehören nicht in Git. Prüfe vor Commits die `.gitignore`.
- 🧪 Tests werden aktuell nicht automatisch ausgeführt; stelle sicher, dass Code syntaktisch valide ist.
