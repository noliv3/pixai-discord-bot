# PixAI Discord Bot – Entwicklungsleitfaden

- ✅ Neue Implementierung lebt unter [`bot/`](./bot/). Alle Änderungen für den aktiven Bot passieren dort.
- 📁 Die Legacy-Fassung bleibt in [`_archived/`](./_archived/) und ist nur Referenz – keine Änderungen ohne ausdrückliche Aufgabe.
- 🧾 Dokumentation pflegen: Diese Datei und die README-Dateien müssen bei Strukturänderungen aktualisiert werden.
- 🧭 Referenz-Mapping (`*_v1` ↔ produktive Module) ist in [`DOCU/STRUCTURE_SYNC.md`](./DOCU/STRUCTURE_SYNC.md) dokumentiert und wird durch Wrapper unter `bot/lib/*_v1.js` gespiegelt.
- 🧩 Die Config-Ladefunktion akzeptiert sowohl Felder aus der Referenz (`bot.discordToken`, `scanner.url`) als auch die produktiven Namen; neue Pfade/Versionen werden mit Defaults ergänzt.
- 🔐 Sensible Dateien (`bot/config/bot-config.json`, `bot/data/`) gehören nicht in Git. Prüfe vor Commits die `.gitignore`.
- 🧪 Tests werden aktuell nicht automatisch ausgeführt; stelle sicher, dass Code syntaktisch valide ist.
