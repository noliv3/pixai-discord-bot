# PixAI Discord Bot – Entwicklungsleitfaden

- ✅ Neue Implementierung lebt unter [`bot/`](./bot/). Alle Änderungen für den aktiven Bot passieren dort.
- 📁 Die Legacy-Fassung bleibt in [`_archived/`](./_archived/) und ist nur Referenz – keine Änderungen ohne ausdrückliche Aufgabe. Die historischen DOCU-Unterlagen liegen jetzt unter [`_archived/DOCU/`](./_archived/DOCU/).
- 🧾 Dokumentation pflegen: Diese Datei sowie [`README.md`](./README.md), [`docs/README.md`](./docs/README.md) und [`docs/AGENTS.md`](./docs/AGENTS.md) sind die verbindlichen Quellen.
- 🔄 Scanner-Client: `/token` liefert einen reinen Text-Token. Verwende ihn unverändert im `Authorization`-Header (kein `Bearer`).
- 🧭 Referenz-Mapping (`*_v1` ↔ produktive Module) ist in [`_archived/DOCU/STRUCTURE_SYNC.md`](./_archived/DOCU/STRUCTURE_SYNC.md) dokumentiert. Die aktuelle Architektur nutzt den `moduleLoader` unter `bot/lib/moduleLoader.js` und modulare Verzeichnisse unter `bot/modules/`.
- 🧩 Konfiguration erfolgt zweistufig: globale Defaults in `bot/config/bot-global.json`, Guild-spezifische Dateien unter `bot/config/guilds/<GUILD_ID>.json`. Der `ConfigManager` sorgt für Auto-Onboarding und Reloads – bitte keine Legacy-`bot-config.json` mehr verwenden.
- ✉️ Direktnachrichten: Der Core routet DM-Nachrichten an `bot/lib/dmHandler.js`. Dort sind Invite-Parsing sowie Admin-Konfigurationsbefehle implementiert (`!guilds`, `!config`, `!config set`). Neue DM-Features hier integrieren.
- 🔐 Sensible Dateien (`bot/config/bot-global.json`, `bot/config/guilds/*.json`, `bot/data/`) gehören nicht in Git. Prüfe vor Commits die `.gitignore`.
- 🧪 Tests werden aktuell nicht automatisch ausgeführt; stelle sicher, dass Code syntaktisch valide ist.
