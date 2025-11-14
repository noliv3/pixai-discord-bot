# Strukturabgleich Referenz ↔ aktuelle Implementierung

Dieses Dokument fixiert die Abbildung zwischen der versionierten Referenz aus `/docu/` und dem produktiven Bot-Code unter `bot/`.

## Commands
- `event_start_v1` → `bot/commands/eventstart.js`
- `event_stop_v1` → `bot/commands/eventstop.js`
- `event_stats_v1` → `bot/commands/eventstatus.js`
- `event_zip_v1` → `bot/commands/eventexport.js`
- `setscan_v1` → `bot/commands/setscan.js`
- `filter_v1` → **nicht implementiert** (Platzhalter für zukünftiges Feature)

## Services & Libraries
- `scannerClient_v1` → `bot/lib/scannerClient.js`
- `botConfig_v1` → `bot/lib/botConfig.js`
- `eventStore_v1` → `bot/lib/eventStore.js`
- `flaggedStore_v1` → `bot/lib/flaggedStore.js`
- `logger_v1` → `bot/lib/logger.js`
- `permissions_v1` → `bot/lib/permissions.js`

## Verzeichnisstruktur (Soll/Ist)
```
bot/
  index.js
  commands/
    eventstart.js
    eventstop.js
    eventstatus.js
    eventextend.js
    eventexport.js
    setscan.js
    # filter_v1.js reserviert
  config/
    bot-config.json
    bot-config.example.json
  events/
    ready.js
    messageCreate.js
    messageReactionAdd.js
    messageReactionRemove.js
  lib/
    botConfig.js
    scannerClient.js
    eventStore.js
    flaggedStore.js
    permissions.js
    logger.js
    # *_v1.js Wrapper für Referenznamen
  data/
    events/
    deleted/
    logs/
```

Die `data/`-Unterordner werden zur Laufzeit erzeugt und bleiben von Git ausgeschlossen.
