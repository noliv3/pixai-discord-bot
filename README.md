# PixAI Discord Bot

Ein modularer Discord-Bot für die PixAI-Community. Die aktuelle Generation setzt auf einen klaren Bot-Core mit Plugin-Modulen für Tag-Scanning, Bildevents und Moderations-Tools. Jede Guild erhält eine eigene Konfiguration, sodass Features flexibel aktiviert oder deaktiviert werden können.

## Projektüberblick

- **Bot-Kern**: Läuft auf Node.js (discord.js v14) im Verzeichnis [`bot/`](./bot/). Der Core initialisiert den Discord-Client, lädt Konfigurationen, Module und Health-Checks.
- **Module**: Befinden sich unter [`bot/modules/`](./bot/modules/) und kapseln Features wie Tag-Scanning, Picture-Events, Community-Guard und den NSFW-Scanner.
- **Persistenz**: `lib/eventStore.js` und `lib/flaggedStore.js` speichern Event-Uploads bzw. moderierte Inhalte als JSON.
- **Scanner-Integration**: `lib/scannerClient.js` bündelt alle HTTP-Aufrufe zum externen Scanner. Der Client erwartet einen reinen Text-Token vom Endpunkt `/token` und sendet ihn unverändert (ohne `Bearer`-Präfix) im `Authorization`-Header. Seit dem neuen Upload-Flow erledigt der Client auch das Herunterladen von Medien (Discord-CDN, externe Links) und baut korrekte `multipart/form-data`-Uploads über die Hilfsfunktionen `checkImageFromUrl` (Einzelbilder) sowie `batchFromUrl` (GIF/Video). Technisch kommt dafür ausschließlich die in Node.js integrierte `fetch`-Implementierung inklusive `FormData`, `File` und `Blob` zum Einsatz.

## Phase-2 Scanner (BOT1)

Die Legacy-PIX-Bot-Logik wurde als modulare Bibliothek in BOT1 integriert. Wichtige Zuordnungen:

- `scanCore_v1` ← Sammeln & Scannen von Medien (aus `handleMessageCreate.js`, `handleImageScan.js`, `handleVideoScan.js`).
- `urlSanitizer_v1` ← URL-Validierung & `og:image`-Fallback (`urlSanitizer.js`).
- `tagUtils_v1`, `riskEngine_v1`, `scanCache_v1` ← Tag-Aufbereitung, Risiko-Bewertung & TTL-Cache (`tagUtils.js`, `scannerFilter.js`, `riskUtils.js`, `scanCache.js`).
- `modReview_v1` ← Moderations-Flow inkl. Flagging, Auto-Löschung & DM-Warnungen (`modReview.js`, `modLogger.js`, `flaggedStore.js`).
- `eventUpload_v1`, `voteUtils_v1` ← Helper für Event-Uploads & Voting (`handleEventUpload.js`, `voteUtils.js`).

### Neue Konfigurationswerte

- `defaults.guild.scan.tagFilters` bzw. `guild.scan.tagFilters`: Taglisten für Level `0–3` (siehe Legacy `scanner-filters.json`).
- `guild.channels.modLog`: Kanal, in dem Auto-Mod-Embeds + Review-Reaktionen landen.
- `guild.scan.rulesLink` (optional): Hinweis-Link für Warn-DMs (Fallback: `guild.channels.rules`).

### Moderations-Flow

1. Das Modul `nsfw-scanner` registriert sich beim `moduleLoader` für `messageCreate`, `messageReactionAdd` und `messageReactionRemove` und startet nur, wenn es pro Guild aktiviert ist.
2. `scanCore_v1` normalisiert Tags, berechnet Risiko & Level und schreibt Ergebnisse nach `message._pixai.scanResults` (Kompatibilität zu Modulen).
3. `modReview_v1` entscheidet anhand von Schwellenwerten (`scan.thresholds`) über `ignore`, `flag` oder `delete`, löscht ggf. die Originalnachricht und legt einen Datensatz im `flaggedStore` an.
4. Bei Flags wird ein Embed im Mod-Channel mit Reaktionen (`✅❌⚠️🔁`) erstellt. Reaktionen laufen über die Modul-Handler (`events/message-reaction-add.js` & `events/message-reaction-remove.js`).
5. On-Demand-Scans können per `?`-Reaction ausgelöst werden (öffentliche Antwort mit den Scan-Daten), sofern das Modul `nsfw-scanner` aktiv ist.

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
    nsfw-scanner/
      module.json
      index.js
      events/
        message-create.js
        message-reaction-add.js
        message-reaction-remove.js
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
       "owners": ["123456789012345678"],
       "clientId": "DISCORD_APP_CLIENT_ID",
       "invitePermissions": 274877906944
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

   Wichtige Felder:

   - `bot.clientId`: Discord Application ID des Bots, benötigt für die Generierung von OAuth2-Invites in DMs.
   - `bot.invitePermissions`: Vorausgewählte Berechtigungen als Integer (Discord-Permissions-Bitfeld) für den Bot-Invite-Link.

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

## DM-Verwaltung & Invite-Unterstützung

Der Bot reagiert in privaten Nachrichten auf zwei zentrale Flows:

- **Server-Invite-Parsing**: Sobald ein gültiger Discord-Server-Invite gesendet wird (`discord.gg/<code>` oder `discord.com/invite/<code>`), antwortet der Bot mit einem vorbefüllten OAuth2-Bot-Invite-Link für genau diese Guild. Grundlage sind `bot.clientId` und optional `bot.invitePermissions` aus der globalen Konfiguration.
- **Admin-Konfiguration per DM**: Server-Administratoren oder -Owner können Konfigurationen verwalten, sofern sie auf der jeweiligen Guild die nötigen Rechte besitzen.

Verfügbare DM-Commands (alle mit dem globalen Prefix, standardmäßig `!`):

- `!guilds` – listet alle Guilds, auf denen der Absender Administrator ist und der Bot aktiv ist.
- `!config <guildId>` – zeigt eine kompakte JSON-Ansicht mit Prefix, Channel-/Rollen-Zuordnung, Scan-Einstellungen und Modul-Status.
- `!config set <guildId> <pfad> <wert>` – aktualisiert einen bestehenden Konfigurationswert per Dot-Notation. Änderungen werden protokolliert und in der jeweiligen `guildId.json` persistiert.

Fehlende Berechtigungen oder ungültige Pfade werden klar zurückgemeldet. Es werden keine sensiblen Daten in DMs ausgegeben.

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
