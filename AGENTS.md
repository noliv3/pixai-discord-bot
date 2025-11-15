# PixAI Discord Bot – Entwicklungsleitfaden

- ✅ Neue Implementierung lebt unter [`bot/`](./bot/). Alle Änderungen für den aktiven Bot passieren dort.
- 📁 Die Legacy-Fassung bleibt in [`_archived/`](./_archived/) und ist nur Referenz – keine Änderungen ohne ausdrückliche Aufgabe. Die historischen DOCU-Unterlagen liegen jetzt unter [`_archived/DOCU/`](./_archived/DOCU/).
- 🧾 Dokumentation pflegen: Diese Datei sowie [`README.md`](./README.md), [`docs/README.md`](./docs/README.md) und [`docs/AGENTS.md`](./docs/AGENTS.md) sind die verbindlichen Quellen.
- 🔄 Scanner-Client: `/token` liefert einen reinen Text-Token. Verwende ihn unverändert im `Authorization`-Header (kein `Bearer`). Der Client in `bot/lib/scannerClient.js` übernimmt Downloads & Multipart-Aufbau – nutze dort `checkImageFromUrl` für Einzelbilder bzw. `batchFromUrl` für GIF/Video-Uploads.
- 📦 Für den Scanner-Client werden `undici` (HTTP) sowie `formdata-node` mit `form-data-encoder` (Multipart) vorausgesetzt. Diese Pakete sind in `bot/package.json` hinterlegt und müssen installiert sein.
- 🧭 Referenz-Mapping (`*_v1` ↔ produktive Module) ist in [`_archived/DOCU/STRUCTURE_SYNC.md`](./_archived/DOCU/STRUCTURE_SYNC.md) dokumentiert. Die aktuelle Architektur nutzt den `moduleLoader` unter `bot/lib/moduleLoader.js` und modulare Verzeichnisse unter `bot/modules/`.
- 🛰️ Phase-2 Scanner: Kernlogik wird über das Modul `bot/modules/nsfw-scanner/` angebunden. Die Bibliotheken `bot/lib/scanCore_v1.js`, `urlSanitizer_v1.js`, `tagUtils_v1.js`, `riskEngine_v1.js`, `scanCache_v1.js`, `modReview_v1.js`, `eventUpload_v1.js`, `voteUtils_v1.js` liefern weiterhin die Funktionen. Nur `scannerClient_v1.js` spricht HTTP mit dem Scanner.
- ⚙️ Konfiguration: Für Auto-Moderation werden `guild.channels.modLog`, optionale `guild.scan.rulesLink` sowie `scan.tagFilters` (Level `0–3`) benötigt. Ohne Mod-Channel findet keine Veröffentlichung der Cases statt.
- 🧩 Konfiguration erfolgt zweistufig: globale Defaults in `bot/config/bot-global.json`, Guild-spezifische Dateien unter `bot/config/guilds/<GUILD_ID>.json`. Der `ConfigManager` sorgt für Auto-Onboarding und Reloads – bitte keine Legacy-`bot-config.json` mehr verwenden.
- ✉️ Direktnachrichten: Der Core routet DM-Nachrichten an `bot/lib/dmHandler.js`. Dort sind Invite-Parsing sowie Admin-Konfigurationsbefehle implementiert (`!guilds`, `!config`, `!config set`). Neue DM-Features hier integrieren.
- 🔐 Sensible Dateien (`bot/config/bot-global.json`, `bot/config/guilds/*.json`, `bot/data/`) gehören nicht in Git. Prüfe vor Commits die `.gitignore`.
- 🧪 Tests werden aktuell nicht automatisch ausgeführt; stelle sicher, dass Code syntaktisch valide ist.
