# PixAI Discord Bot

Ein modularer Discord-Bot für die PixAI-Community. Die aktuelle Generation setzt auf einen klaren Bot-Core mit Plugin-Modulen für Tag-Scanning, Bildevents und Moderations-Tools. Jede Guild erhält eine eigene Konfiguration, sodass Features flexibel aktiviert oder deaktiviert werden können.

## Projektüberblick

- **Bot-Kern**: Läuft auf Node.js (discord.js v14) im Verzeichnis [`bot/`](./bot/). Der Core initialisiert den Discord-Client, lädt Konfigurationen, Module und Health-Checks.
- **Module**: Befinden sich unter [`bot/modules/`](./bot/modules/) und kapseln Features wie Tag-Scanning, Picture-Events und Community-Guard.
- **Persistenz**: `lib/eventStore.js` und `lib/flaggedStore.js` speichern Event-Uploads bzw. moderierte Inhalte als JSON.
- **Scanner-Integration**: `lib/scannerClient.js` bündelt alle HTTP-Aufrufe zum externen Scanner.

## Kanonische Dokumentation

Die folgenden Dokumente sind die Referenz für Architektur, Prozesse und Rollen:

- [`README.md`](./README.md) – Gesamtüberblick und Einstieg.
- [`docs/README.md`](./docs/README.md) – Detailarchitektur, Flows und Betriebsleitfäden.
- [`docs/AGENTS.md`](./docs/AGENTS.md) – Rollen- und Verantwortlichkeitsmatrix.
- [`AGENTS.md`](./AGENTS.md) – Arbeitsrichtlinien für dieses Repository.

Historische Unterlagen liegen unter [`_archived/`](./_archived/) und dienen nur als Referenz.

## Verzeichnisstruktur

```
README.md
AGENTS.md
bot/
  package.json
  index.js
  commands/
    health.js
  config/
    bot-global.example.json
    guilds/
      .gitkeep
  events/
    ready.js
    guildCreate.js
  lib/
    botConfig.js
    healthCheck.js
    moduleLoader.js
    scannerClient.js
    eventStore.js
    flaggedStore.js
    permissions.js
    logger.js
  modules/
    tag-scan/
      module.json
      index.js
      commands/
        scan-config.js
      events/
        message-create.js
    picture-events/
      module.json
      index.js
      commands/
        event-*.js
      events/
        message-create.js
        message-reaction-*.js
    community-guard/
      module.json
      index.js
      events/
        message-reaction-*.js
  data/
    events/
    logs/
    flagged.json
  docs/
    README.md
    AGENTS.md
```

### Ordner im Detail

- `bot/commands/` – Core-Commands des Bots (z. B. `!health`).
- `bot/events/` – zentrale Eventlistener, die unabhängig von Modulen laufen (`ready`, `guildCreate`).
- `bot/modules/` – Feature-Module mit eigenen Commands und Event-Handlern.
- `bot/lib/` – Hilfsbibliotheken für Config-Management, Module, Health-Check, Logging usw.
- `bot/config/` – Konfigurationsdateien (werden lokal gepflegt, nicht eingecheckt).
- `bot/data/` – Laufzeitdaten (Events, Flagged-Inhalte, Logs), wird automatisch angelegt.

## Voraussetzungen

- Node.js **18.18.0** oder neuer.
- Discord-Bot-Token mit aktivierten Message-Content-Intents.
- Erreichbarer HTTP-Endpunkt für den Scanner (oder ein Mock während der Entwicklung).

## Installation

1. Repository klonen oder aktualisieren.
2. Abhängigkeiten installieren:
   ```bash
   cd bot
   npm install
   ```
3. Konfigurationsdateien anlegen (siehe unten).

## Konfiguration

Die Konfiguration ist zweistufig aufgebaut:

1. **Globale Settings**: `bot/config/bot-global.json`
   ```jsonc
   {
     "bot": {
       "token": "DISCORD_BOT_TOKEN",
       "prefix": "!",
       "owners": ["123456789012345678"]
     },
     "scanner": {
       "baseUrl": "https://scanner.example.com",
       "email": "bot@example.com",
       "clientId": "pixai-bot"
     },
     "defaults": {
       "guild": {
         "channels": {
           "events": null,
           "modLog": null
         },
         "roles": {
           "admins": [],
           "moderators": []
         },
         "scan": {
           "enabled": true,
           "thresholds": { "flag": 0.6, "delete": 0.95 }
         },
         "modules": {
           "tag-scan": { "enabled": true },
           "picture-events": {
             "enabled": true,
             "defaultDurationHours": 24,
             "maxEntriesPerUser": 3,
             "voteEmojis": {
               "approve": "👍",
               "reject": "👎",
               "warn": "⚠️",
               "remove": "❌"
             }
           },
           "community-guard": {
             "enabled": true,
             "moderationEmojis": {
               "approve": "👍",
               "reject": "👎",
               "warn": "⚠️",
               "remove": "❌"
             }
           }
         }
       }
     }
   }
   ```

2. **Guild-spezifische Settings**: eine Datei pro Guild unter `bot/config/guilds/<GUILD_ID>.json`
   ```jsonc
   {
     "channels": {
       "events": "123456789012345678",
       "modLog": "234567890123456789"
     },
     "roles": {
       "admins": ["345678901234567890"],
       "moderators": ["456789012345678901"]
     },
     "scan": {
       "enabled": true,
       "reviewChannelId": "567890123456789012",
       "thresholds": { "flag": 0.7, "delete": 0.92 }
     },
     "modules": {
       "tag-scan": {
         "enabled": true
       },
       "picture-events": {
         "enabled": true,
         "defaultDurationHours": 48,
         "maxEntriesPerUser": 5
       },
       "community-guard": {
         "enabled": true
       }
     }
   }
   ```

Beim ersten Join einer neuen Guild legt der Bot automatisch eine Default-Datei an (`ConfigManager.ensureGuildConfig`). Änderungen an den JSON-Dateien werden zur Laufzeit erkannt und automatisch neu geladen, sofern kein kritischer Vorgang läuft.

> ⚠️ **Sensible Daten** dürfen nicht ins Repository eingecheckt werden. Die tatsächlichen JSON-Dateien (`bot-global.json`, `guilds/*.json`) sind durch die `.gitignore` ausgeschlossen.

## Module

| Modul             | Zweck | Aktivierung | Wichtige Konfiguration |
|-------------------|-------|-------------|------------------------|
| `tag-scan`        | Lädt Attachments herunter, ruft den externen Scanner auf und pflegt das Flagged-Register. | pro Guild (`modules.tag-scan.enabled`) | Thresholds `modules.tag-scan.thresholds` und globale `scan.thresholds` |
| `picture-events`  | Organisiert Bildevents, Commands für Start/Stop/Export, Votes per Reactions. | pro Guild (`modules.picture-events.enabled`) | Standarddauer, Upload-Limits, Emoji-Mapping |
| `community-guard` | Reaktionsbasierte Moderation für geflaggte Inhalte (Warnung/Löschen). | pro Guild (`modules.community-guard.enabled`) | Emoji-Mapping `moderationEmojis` |

## Wichtige Commands

| Befehl         | Modul/Core        | Berechtigung | Beschreibung |
|----------------|-------------------|--------------|--------------|
| `!health`      | Core              | Admin        | Führt den Health-Check aus und zeigt Ergebnis je Abschnitt. |
| `!scanconfig` / `!setscan` | tag-scan | Admin        | Zeigt oder aktualisiert die Flag/Delete-Schwellenwerte. |
| `!eventstart`  | picture-events    | Admin        | Startet ein Event im aktuellen Kanal. |
| `!eventstop`   | picture-events    | Admin        | Stoppt das Event und archiviert Statistik. |
| `!eventextend` | picture-events    | Admin        | Verlängert/verkürzt das Event um X Stunden. |
| `!eventstatus` | picture-events    | Mod          | Listet aktive Events der Guild. |
| `!eventexport` | picture-events    | Admin        | Erstellt einen ZIP-Export der Uploads. |

## Betrieb

- Bot starten:
  ```bash
  cd bot
  npm start
  ```
- Beim Start lädt der Core globale und Guild-Konfiguration, initialisiert Module und führt einen Health-Check aus. Bei kritischen Fehlern (z. B. fehlendes Token) wird der Prozess beendet.
- Der Health-Check überprüft Konfigurationsintegrität, Scanner-Erreichbarkeit, Modulkonsistenz sowie Schreibrechte auf den Datenverzeichnissen und protokolliert das Ergebnis.
- Module werden pro Guild nur ausgeführt, wenn sie in der jeweiligen JSON-Konfiguration aktiviert sind.

## Troubleshooting

- **Health-Check schlägt fehl**: `!health` ausführen oder Logs prüfen (`bot/data/logs/`). Fehlerhafte JSON-Struktur oder fehlende Felder beheben.
- **Scanner nicht erreichbar**: `scanner.baseUrl`, `scanner.email`, `scanner.clientId` prüfen. Ohne funktionierenden Scanner läuft der Bot weiter, markiert Uploads aber nicht automatisch.
- **Neue Guild ohne Konfiguration**: Der `guildCreate`-Event legt automatisch eine Datei in `bot/config/guilds/` an. Danach Werte anpassen und speichern.

---

Weitere Details zu Prozessen, Datenflüssen und Rollen siehe [`docs/README.md`](./docs/README.md).
