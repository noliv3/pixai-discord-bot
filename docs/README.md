# Dokumentation – PixAI Discord Bot

Dieses Dokument beschreibt die aktuelle modulare Architektur, Konfigurationsflüsse und Betriebsprozesse des PixAI Discord-Bots.

## 1. Architekturüberblick

Die aktive Codebasis lebt unter [`bot/`](../bot/). Der Core besteht aus folgenden Bausteinen:

- **`index.js`** – Bootstrapping des Discord-Clients, Laden der Konfigurationen, Initialisierung von Logger, Stores, Health-Check und Module Loader.
- **`lib/`** – Technische Infrastruktur:
  - `botConfig.js` – `ConfigManager` mit Global-/Guild-Dateien, Auto-Onboarding & Caching.
  - `moduleLoader.js` – Discovery und Registrierung der Module in `bot/modules/`.
  - `healthCheck.js` – Konfigurations-, Scanner-, Modul- und Runtime-Prüfungen.
  - `eventStore.js` & `flaggedStore.js` – Persistenzschicht für Events bzw. moderierte Inhalte.
  - `scannerClient.js` – HTTP-Client für den externen Scanner.
  - `permissions.js`, `logger.js` – Berechtigungen und Logging.
- **`commands/`** – Core-Commands, die nicht an ein Modul gebunden sind (`!health`).
- **`events/`** – Guild-unabhängige Events (`ready`, `guildCreate`). Modul-spezifische Events werden direkt im Modul registriert.
- **`modules/`** – Feature-Plugins mit eigener `module.json`, Commands und Event-Handlern.

### Module (Phase 2)

| Modul | Zweck | Hauptdateien |
|-------|-------|--------------|
| `tag-scan` | Lädt Attachments, ruft den externen Scanner auf und aktualisiert den `flaggedStore`. | `modules/tag-scan/*` |
| `picture-events` | Verwaltet Bildevents inkl. Commands, Upload-Registrierung und Reaction-Votes. | `modules/picture-events/*` |
| `community-guard` | Moderationsreaktionen auf geflaggte Inhalte (Warnung/Löschung). | `modules/community-guard/*` |

Der Module Loader stellt jedem Modul ein `coreApi` bereit (`client`, `configManager`, `eventStore`, `flaggedStore`, `scanner`, `permissions`, Registrierungsfunktionen). Commands und Events werden dadurch zur Laufzeit beim Bot angemeldet.

## 2. Scanner-Anbindung

`scannerClient.js` kapselt alle Interaktionen mit dem externen Dienst:

- `ensureToken()` holt und cached ein API-Token.
- `scanImage(buffer, filename, mimeType)` sendet Attachments an `/check`.
- `scanBatch(buffer, mimeType)` erlaubt Batch-Uploads (z. B. ZIPs).
- `getStats()` liefert Statusinformationen für den Health-Check.

Fehler oder Zeitüberschreitungen werden protokolliert. Ist kein `baseUrl` gesetzt, bleibt der Client deaktiviert – der Bot läuft weiter, markiert Uploads aber nicht automatisch.

## 3. Konfigurationsmodell

Die Konfiguration ist zweistufig aufgebaut:

1. **Global:** `bot/config/bot-global.json`
   - `bot.token`, `bot.prefix`, `bot.owners`
   - `scanner.baseUrl`, `scanner.email`, `scanner.clientId`
   - `defaults.guild` enthält Standardwerte für Channels, Rollen, Scan-Thresholds und Modul-Defaults.
2. **Pro Guild:** `bot/config/guilds/<GUILD_ID>.json`
   - `channels.events`, `channels.modLog`
   - `roles.admins`, `roles.moderators`
   - `scan.enabled`, `scan.reviewChannelId`, `scan.thresholds.flag/delete`
   - `modules.<modulName>` mit modul-spezifischen Einstellungen (`enabled`, `thresholds`, `voteEmojis`, ...)

Der `ConfigManager` sorgt für Auto-Onboarding (`guildCreate` erzeugt Dateien bei Bedarf), hält ein Cache mit Mtime-Tracking und verhindert Reloads während kritischer Operationen. Legacy-Felder wie `bot.discordToken` oder `scanner.url` werden weiterhin auf die neuen Schlüssel gemappt.

## 4. Health-Check

`lib/healthCheck.js` führt vier Prüfblöcke aus:

- **Config Integrity** – Pflichtfelder in globalen/guild-spezifischen JSONs, Modul-Konfigurationen.
- **Scanner Connectivity** – `getStats()` gegen den konfigurierten Scanner-Endpunkt.
- **Module Consistency** – Abgleich `module.json` mit registrierten Commands/Events.
- **Runtime Checks** – Schreibrechte auf `bot/data/` und `bot/data/events/`.

Das Ergebnis wird beim Start protokolliert. Kritische Fehler führen zum Abbruch, Warnungen lassen den Bot weiterlaufen. Der Core-Command `!health` kann den Check jederzeit erneut auslösen.

## 5. Event-Flows

### 5.1 Core Events

- **`ready`** – loggt Bot-Tag und vorhandene Guilds, stellt sicher, dass pro Guild eine Konfiguration existiert.
- **`guildCreate`** – ruft `ConfigManager.ensureGuildConfig` auf und loggt das Onboarding.

### 5.2 Modul-Events

- **`nsfw-scanner` → `messageCreate` / `messageReactionAdd/Remove`** – orchestriert die Phase-2-Scans, erstellt Moderations-Embeds und synchronisiert Reaktionen über `modReview_v1`.
- **`tag-scan` → `messageCreate`** – stellt Legacy-Fallbacks bereit: Lädt Attachments nur dann direkt beim Scanner hoch, wenn kein Ergebnis von `nsfw-scanner` vorliegt, und liefert Kommandos zur Schwellenwert-Anpassung.
- **`picture-events` → `messageCreate`** – registriert Uploads in aktiven Event-Kanälen (`eventStore`). Nutzt optional die Scan-Metadaten.
- **`picture-events` → `messageReactionAdd/Remove`** – mappt Reaktionen auf Votes und pflegt Event-Statistiken.
- **`community-guard` → `messageReactionAdd/Remove`** – interpretiert Moderations-Emojis auf geflaggten Nachrichten und aktualisiert den `flaggedStore` (inkl. optionalem Delete).

## 6. Commands

### Core

| Name | Beschreibung | Berechtigung |
|------|--------------|--------------|
| `health` | Führt den Health-Check aus und gibt eine zusammengefasste Statusübersicht. | Admin |

### Modulgebunden

| Modul | Commands |
|-------|----------|
| `tag-scan` | `scanconfig`, `setscan` – Thresholds anzeigen/ändern. |
| `picture-events` | `eventstart`, `eventstop`, `eventextend`, `eventstatus`, `eventexport`. |
| `community-guard` | aktuell keine Text-Commands. |

Die Berechtigungsprüfung erfolgt zentral über `permissions.canUseCommand(...)`. Owners umgehen sämtliche Checks.

## 7. Datenablage

- `bot/data/events/` – Unterordner je Event (`<channelId>_<name>` mit `event.json` & optionalen ZIP-Exports).
- `bot/data/flagged.json` – JSON-Liste moderierter Nachrichten.
- `bot/data/logs/` – strukturierte Log-Dateien des Bots.

Alle Pfade werden beim Start automatisch angelegt und sind per `.gitignore` ausgeschlossen.

## 8. Betriebsablauf

1. Start: `node bot/index.js` (bzw. `npm start`).
2. Core lädt globale Konfiguration, initialisiert Services, Module und führt den Health-Check aus.
3. Module registrieren Commands/Events. Aktivierung erfolgt pro Guild anhand der JSON-Konfiguration.
4. Während des Betriebs erkennt der ConfigManager Änderungen an JSON-Dateien über Mtime-Vergleiche und lädt sie neu, sofern keine kritische Operation läuft (`beginGuildOperation`/`endGuildOperation`).

## 9. Troubleshooting

| Problem | Ursache | Lösung |
|---------|---------|--------|
| Health-Check stoppt den Start | Fehlende Pflichtfelder oder keine Schreibrechte | Konfiguration prüfen, Verzeichnisse anlegen/setzen. |
| Scanner-Calls schlagen fehl | `scanner.baseUrl`/Credentials falsch oder Service offline | Werte korrigieren, Service prüfen. Ohne Scanner läuft der Bot weiter, markiert aber nichts automatisch. |
| Event-Uploads werden abgelehnt | Upload-Limit erreicht (`maxEntriesPerUser`) | Limit anpassen oder bestehende Einträge löschen. |
| Moderations-Reaktionen greifen nicht | Modul deaktiviert oder Emoji-Mapping falsch | `modules.community-guard` aktivieren bzw. `moderationEmojis` aktualisieren. |

## 10. Weiterführende Hinweise

- Neue Module folgen der Struktur `modules/<name>/module.json` + `index.js` + optional `commands/`/`events/`.
- `module.json` enthält Metadaten (`name`, `description`, `commands`, `events`, `defaultConfig`). Diese Informationen nutzt der Health-Check.
- Für neue Commands innerhalb eines Moduls `registerCommand` aus dem Core-API verwenden; Event-Handler werden über `registerEventHandler` eingebunden.
- Dokumentation immer in README & AGENTS aktualisieren, sobald sich Konfigurations- oder Betriebsabläufe ändern.

Weitere Rollen- und Prozessdetails siehe [`docs/AGENTS.md`](./AGENTS.md).
