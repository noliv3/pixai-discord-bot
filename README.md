# PixAI Discord Bot

Ein modularer Discord-Bot für die PixAI-Community. Er verbindet Moderations- und Eventfunktionen mit einem externen Scanner-Dienst, der Bilder und Videos auf kritische Inhalte prüft. Die neue Architektur trennt Bot-Logik und Scanner vollständig und erlaubt die parallele Verwaltung mehrerer Discord-Guilds.

## Projektüberblick

- **Bot-Kern**: Läuft auf Node.js (discord.js v14) im Verzeichnis [`bot/`](./bot/).
- **Scanner-Integration**: Kapselt alle HTTP-Aufrufe in `lib/scannerClient.js` und kann später an eine echte API angepasst werden.
- **Event-Management**: `lib/eventStore.js` verwaltet Uploads, Votes und Statistiken pro Kanal.
- **Moderationsdaten**: `lib/flaggedStore.js` speichert zur Nachverfolgung alle geprüften und markierten Nachrichten.
- **Dokumentation**: Aktuelle Guides liegen unter [`docs/`](./docs/).

Der bisherige Legacy-Code ist weiterhin unter [`_archived/`](./_archived/) verfügbar, bleibt jedoch unverändert.

## Verzeichnisstruktur

```
README.md
AGENTS.md
DOCU/
  STRUCTURE_SYNC.md
bot/
  package.json
  index.js
  config/
    bot-config.example.json
  commands/
    eventstart.js
    eventstop.js
    eventstatus.js
    eventextend.js
    eventexport.js
    setscan.js
    # reservierter Slot: filter_v1.js
  events/
    ready.js
    messageCreate.js
    messageReactionAdd.js
    messageReactionRemove.js
  lib/
    botConfig.js
    botConfig_v1.js
    scannerClient.js
    scannerClient_v1.js
    eventStore.js
    eventStore_v1.js
    flaggedStore.js
    flaggedStore_v1.js
    permissions.js
    permissions_v1.js
    logger.js
    logger_v1.js
  data/
    events/
    deleted/
    logs/
docs/
  README.md
  AGENTS.md
_archived/
```

### Ordner im Detail

- `bot/commands/` – ein Modul pro Textbefehl (Eventstart, Export, Scan-Konfiguration usw.).
- `bot/events/` – Discord-Eventlistener (`ready`, `messageCreate`, `messageReaction*`).
- `bot/lib/` – Hilfsbibliotheken: Scanner-Client, Config-Lader, Event-/Flagged-Stores, Logging, Berechtigungen. Wrapper mit `_v1` spiegeln die Namenskonvention der Referenzdokumentation.
- `bot/data/` – Arbeitsdaten des Bots (Events, Logs, gelöschte Uploads). Wird zur Laufzeit erstellt und nicht versioniert.
- `DOCU/STRUCTURE_SYNC.md` – Verbindliche Zuordnung zwischen Referenzstruktur (`*_v1`) und produktiven Dateien.
- `docs/` – Technische und organisatorische Dokumentation für Team und Operator:innen.

## Voraussetzungen

- Node.js **18.18.0** oder neuer.
- Discord-Bot-Token mit aktivierten Message Content Intents.
- Erreichbarer HTTP-Endpunkt für den externen Scanner (oder Platzhalter während der Entwicklung).

## Installation

1. Repository klonen oder aktualisieren.
2. In das Bot-Verzeichnis wechseln und Abhängigkeiten installieren:
   ```bash
   cd bot
   npm install
   ```
3. Konfigurationsdatei erstellen:
   - `bot/config/bot-config.json` aus `bot-config.example.json` kopieren.
   - Felder anpassen (siehe unten). **Diese Datei darf nicht eingecheckt werden.**

## Konfiguration (`bot-config.json`)

```jsonc
{
  "bot": {
    "token": "DISCORD_BOT_TOKEN",
    "prefix": "!",
    "owners": ["123456789012345678"],
    "defaultGuild": {
      "modRoles": [],
      "adminRoles": [],
      "commandChannelIds": [],
      "event": {
        "enabled": true,
        "defaultDurationHours": 24,
        "maxEntriesPerUser": 3,
        "archiveAfterStop": true
      },
      "scan": {
        "enabled": true,
        "flagThreshold": 0.6,
        "deleteThreshold": 0.95,
        "reviewChannelId": null
      }
    }
  },
  "scanner": {
    "baseUrl": "https://scanner.example.com",
    "email": "bot@example.com",
    "clientId": "pixai-bot",
    "timeoutMs": 10000
  },
  "guilds": {
    "GUILD_ID": {
      "modChannelId": "123",
      "logChannelId": "456",
      "modRoles": ["789"],
      "adminRoles": ["101112"],
      "scan": {
        "enabled": true,
        "flagThreshold": 0.7,
        "deleteThreshold": 0.92,
        "reviewChannelId": "987654321"
      },
      "event": {
        "enabled": true,
        "defaultDurationHours": 24,
        "maxEntriesPerUser": 3,
        "voteEmojis": {
          "approve": "👍",
          "reject": "👎",
          "warn": "⚠️",
          "remove": "❌"
        }
      }
    }
  }
}
```

### Pflichtfelder

- `bot.token` – Discord-Bot-Token.
- `scanner.baseUrl`, `scanner.email`, `scanner.clientId` – Zugangsdaten zum externen Scanner.
- Pro Guild: `modChannelId`, `logChannelId` sowie passende Rollen-IDs für Admins und Moderation.

> 💡 **Kompatibilität zur Referenz-Doku:** `bot.discordToken`, `bot.ownerIds` und `scanner.url` werden automatisch auf die produktiv genutzten Felder (`bot.token`, `bot.owners`, `scanner.baseUrl`) gemappt. Fehlen `paths` oder `versions`, ergänzt der Loader Standardwerte (`./data/events`, `./data/deleted`, `./data/logs` sowie `v1`).

### Mehrere Guilds

`guilds` enthält je einen Schlüssel pro Guild-ID. Nicht gesetzte Werte fallen automatisch auf `bot.defaultGuild` zurück.

## Betrieb

- Bot starten:
  ```bash
  cd bot
  npm start
  ```
- Beim Start lädt `index.js` automatisch alle Commands und Events und verifiziert die Guild-Konfiguration.
- Scanner-Aufrufe laufen ausschließlich über `lib/scannerClient.js`. Bei fehlender Verbindung protokolliert der Bot Fehler, stürzt aber nicht ab.

## Wichtige Commands

| Befehl            | Berechtigung | Beschreibung |
|-------------------|--------------|--------------|
| `!eventstart`     | Admin        | Startet ein Event im aktuellen Kanal. |
| `!eventstop`      | Admin        | Stoppt das laufende Event und schreibt Statistiken. |
| `!eventextend`    | Admin        | Verlängert/verkürzt das Event um X Stunden. |
| `!eventstatus`    | Mod          | Zeigt aktive Events des Servers an. |
| `!eventexport`    | Admin        | Erstellt eine ZIP-Datei mit Event-Uploads. |
| `!setscan`        | Admin        | Aktualisiert Flag-/Delete-Schwellenwerte pro Guild. |

### Referenz-Mapping der Commands

| Referenz (Doku) | Produktiver Command |
|-----------------|---------------------|
| `event_start_v1` | `!eventstart` |
| `event_stop_v1`  | `!eventstop` |
| `event_stats_v1` | `!eventstatus` |
| `event_zip_v1`   | `!eventexport` |
| `setscan_v1`     | `!setscan` |
| `filter_v1`      | _nicht implementiert_ |

## Event- und Reaktionslogik

- `messageCreate` trennt Befehle (Prefix) von normalen Nachrichten.
- Uploads mit unterstützten Dateitypen werden – sofern konfiguriert – sofort zum Scanner gesendet.
- Bei laufenden Events registriert der `eventStore` jeden Upload, inklusive Scan-Ergebnis.
- `messageReactionAdd`/`Remove` synchronisieren Emojis mit dem `eventStore` und aktualisieren Flag-Status in `flaggedStore`.

## Sicherheit & Datenschutz

- Bot-Token und Scanner-Credentials gehören ausschließlich in `bot-config.json` und dürfen nicht geteilt werden.
- Logs liegen unter `bot/data/logs/` und enthalten Moderationsereignisse. Zugriff beschränken!
- Geflaggte Inhalte werden lokal in `bot/data/flagged.json` gespeichert und sollten regelmäßig überprüft sowie nach Abschluss eines Falls gelöscht werden.
- Scanner-Ergebnisse können sensible Tags enthalten (NSFW, Gewalt). Stelle sicher, dass nur autorisierte Personen Zugriff auf Mod-/Log-Kanäle haben.

## Weiterführende Dokumentation

- Ausführliche technische Details, Rollenbeschreibungen und Prozessdokumentation: [`docs/README.md`](./docs/README.md)
- Rollen- und Agentenmodell: [`docs/AGENTS.md`](./docs/AGENTS.md)

## Legacy-Code

Die ursprüngliche Implementierung inklusive weiterer Referenzen verbleibt unverändert in [`_archived/`](./_archived/). Änderungen sind dort nur auf ausdrückliche Anweisung erlaubt.
