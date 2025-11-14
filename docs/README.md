# Dokumentation – PixAI Discord Bot

## Kanonische Quellen

- [`README.md`](../README.md) – Repository-Überblick und Setup.
- [`docs/README.md`](./README.md) – dieses Dokument mit der Detailarchitektur.
- [`docs/AGENTS.md`](./AGENTS.md) – Rollen, Verantwortlichkeiten und Prozessketten.
- [`bot/docs/README.md`](../bot/docs/README.md) – Vertiefende Techniknotizen für den aktiven Bot.

Legacy-Dokumente und Altkonzeptenotizen befinden sich gesammelt im Archiv unter [`_archived/`](../_archived/). Sie werden nicht mehr gepflegt und dienen nur als Referenz.

## 1. Architekturüberblick

Die neue Bot-Generation trennt konsequent zwischen Discord-Interaktion und Scanner-Anbindung. Kernkomponenten:

- **Bot Core (`bot/index.js`)** – Initialisiert den Discord-Client, lädt Config, Commands und Events.
- **Commands (`bot/commands/`)** – Textbasierte Moderations- und Administrationsbefehle. Jeder Befehl exportiert `{ name, description, requiredPermissions, execute }`.
- **Events (`bot/events/`)** – Listener für `ready`, `messageCreate`, `messageReactionAdd`, `messageReactionRemove`.
- **Libraries (`bot/lib/`)**:
  - `botConfig.js` – Lesen/Speichern von `bot-config.json`, Mergen von Default-Guild-Werten.
  - `scannerClient.js` – HTTP-Client für den externen Scanner (`/token`, `/check`, `/batch`, `/stats`).
  - `eventStore.js` – Map-basierter Eventmanager inkl. JSON-Persistenz pro Event.
  - `flaggedStore.js` – Ablage geprüfter/gefährdeter Inhalte in `bot/data/flagged.json`.
  - `permissions.js` – Owner-/Admin-/Mod-Prüfungen.
  - `logger.js` – Zentrales JSON-Logging (Konsole + `bot/data/logs/bot.log`).

### Architekturprinzipien (Phase 2)

- **Trennung Bot vs. Scanner**: Der Bot enthält ausschließlich Discord-spezifische Logik und persistente Hilfsstrukturen. Alle Scans laufen über `scannerClient.js` als HTTP-Client zu einem externen Dienst.
- **Versionierbare Module**: Produktive Dateien liegen ohne Suffix (`eventStore.js`, `scannerClient.js` etc.). Schlanke Wrapper mit `_v1` spiegeln die Referenznamen und ermöglichen spätere Varianten (`*_v2`) ohne den stabilen Einstiegspunkt zu brechen.
- **Klare Verantwortlichkeiten**: `index.js` bootstrapped nur, Commands/Events kapseln Discord-Flows, Libraries bündeln wiederverwendbare Fachlogik.

## 2. Scanner-Anbindung

`scannerClient.js` kapselt alle HTTP-Aufrufe:

- `ensureToken()` ruft `/token?email=...&clientId=...` ab, cached das Ergebnis und erneuert bei 403 automatisch.
- `scanImage(buffer, filename, mime)` sendet ein Attachment via `POST /check` (Multipart).
- `scanBatch(buffer, mime)` erlaubt den Upload mehrerer Frames oder ZIPs via `POST /batch`.
- `getStats()` liest Statistikdaten (`GET /stats`).

Zeitüberschreitungen werden über `AbortSignal.timeout` abgesichert. Netzwerkfehler erzeugen Logeinträge, ohne den Bot zu beenden.

## 3. Konfiguration

### 3.1 Struktur

`bot-config.json` besteht aus drei Ebenen:

1. `bot` – Globale Bot-Einstellungen (Token, Prefix, Owner-IDs, Default-Guild).
2. `scanner` – Zugangsdaten zum externen Scanner (Base-URL, Service-Mail, Client-ID, Timeout).
3. `guilds` – Individuelle Overrides pro Guild-ID (Rollen, Kanäle, Scan- & Event-Settings).

Jede Guild-Konfiguration erbt automatisch Werte aus `bot.defaultGuild`. Fehlt ein Eintrag, greift der Default.

### 3.2 Felder im Detail

| Feld | Beschreibung |
|------|--------------|
| `bot.token` | Discord-Bot-Token. Muss geheim bleiben. |
| `bot.prefix` | Prefix für Textbefehle (Standard: `!`). |
| `bot.owners` | User-IDs mit uneingeschränktem Zugriff. |
| `bot.defaultGuild.modRoles` | Rollen, die Moderationsrechte erhalten. |
| `bot.defaultGuild.adminRoles` | Rollen mit Adminbefehlen. |
| `bot.defaultGuild.event.*` | Standardwerte für Events (Aktivierung, Dauer, Upload-Limit). |
| `bot.defaultGuild.scan.*` | Standard-Schwellen für Flag/Delete, Review-Channel. |
| `scanner.baseUrl` | Basis-URL des Scanner-Dienstes. |
| `scanner.email` / `scanner.clientId` | Authentifizierungsdaten für `/token`. |
| `scanner.timeoutMs` | Timeout in Millisekunden für alle Requests. |
| `guilds[ID].modChannelId` | Kanal für Moderationsmeldungen. |
| `guilds[ID].logChannelId` | Kanal für Bot-Logs innerhalb der Guild. |
| `guilds[ID].event.voteEmojis` | Zuordnung von Emojis zu den Reaktionsaktionen (`approve`, `reject`, `warn`, `remove`). |

### 3.3 Secrets & Speicherung

- `bot/config/bot-config.json` darf nie committed werden.
- Zur Laufzeit aktualisierte Werte (z. B. durch `!setscan`) werden direkt in der Datei gespeichert.

### Beispiel: Multi-Guild-Konfiguration

Das Konfigurationsmodell unterstützt beliebig viele Server. Jedes Guild-Objekt ergänzt oder überschreibt Werte aus `bot.defaultGuild`:

```jsonc
{
  "bot": {
    "token": "DISCORD_BOT_TOKEN",
    "owners": ["123456789012345678"]
  },
  "guilds": {
    "123456789012345678": {
      "modChannelId": "1111",
      "modRoles": ["moderator-role"],
      "scan": {
        "enabled": true,
        "flagThreshold": 0.6,
        "deleteThreshold": 0.9
      }
    },
    "987654321098765432": {
      "modChannelId": "2222",
      "modRoles": ["another-mod-role"],
      "scan": {
        "enabled": true,
        "flagThreshold": 0.7,
        "deleteThreshold": 0.95
      }
    }
  },
  "scanner": {
    "baseUrl": "https://scanner.example/api",
    "email": "bot@example.com",
    "clientId": "pixai-bot"
  },
  "paths": {
    "eventFiles": "./data/events",
    "deletedFiles": "./data/deleted",
    "logs": "./data/logs"
  },
  "versions": {
    "events": "v1",
    "commands": "v1",
    "scannerClient": "v1",
    "eventStore": "v1"
  }
}
```

Ältere Feldnamen wie `bot.discordToken` oder `scanner.url` werden weiterhin von `bot/lib/botConfig.js` unterstützt und automatisch auf die produktiven Schlüssel (`bot.token`, `scanner.baseUrl` usw.) gemappt.

## 4. Datenablage

- `bot/data/events/` – Ein Unterordner pro aktivem/abgeschlossenem Event (`<channelId>_<eventName>` mit `event.json` & optionalen ZIPs).
- `bot/data/flagged.json` – JSON-Liste geflaggter Nachrichten inklusive Risiko und Tags.
- `bot/data/deleted/` – Platzhalter für gelöschte Uploads (kann von Moderation befüllt werden).
- `bot/data/logs/bot.log` – Strukturierte Logdatei.

Alle Ordner werden automatisch erstellt und sind per `.gitignore` vom Repository ausgeschlossen.

## 5. Events & Ablauf

### 5.1 `ready`
- Loggt Bot-Tag und alle Guilds.
- Prüft pro Guild, ob Pflichtwerte gesetzt sind (`modChannelId`, `logChannelId`, Scan-Schwellen).

### 5.2 `messageCreate`
- Erkennt Commands via Prefix (`client.commands`).
- Führt Berechtigungsprüfungen mittels `permissions.js` durch.
- Scannt Attachments, sofern der Scanner aktiv ist und das Guild-Profil `scan.enabled` gesetzt hat.
- Schreibt Treffer in `flaggedStore` (Status `flag` oder `delete`).
- Registriert Event-Uploads via `eventStore.registerUpload(...)`.

### 5.3 `messageReactionAdd` / `messageReactionRemove`
- Übersetzt Emojis anhand der Guild-Konfiguration (`event.voteEmojis`).
- Aktualisiert Votes in `eventStore`.
- Synchronisiert Entscheidungen im `flaggedStore` (Warnung/Löschung).

## 6. Commands

| Name | Rolle | Zweck |
|------|-------|-------|
| `eventstart` | Admin | Neues Event im Kanal starten (`!eventstart <name> [stunden] [max]`). |
| `eventstop` | Admin | Laufendes Event beenden. |
| `eventextend` | Admin | Laufzeit um ±X Stunden anpassen. |
| `eventstatus` | Mod | Liste aller aktiven Events des Servers. |
| `eventexport` | Admin | ZIP der Uploads erstellen (optional top N). |
| `setscan` | Admin | Flag-/Delete-Thresholds aktualisieren und speichern. |

## 7. Rollen & Rechte

Siehe ergänzend [`docs/AGENTS.md`](./AGENTS.md). Kurzfassung:

- **Owner**: Immer berechtigt, Commands auszuführen.
- **Admins**: Müssen in `adminRoles` stehen oder Discord-`ADMINISTRATOR` besitzen.
- **Moderatoren**: Rollen aus `modRoles`. Dürfen Events einsehen und reagieren.
- **User**: Können an Events teilnehmen; Upload-Limits werden im `eventStore` überwacht.

## 8. Sicherheit & Compliance

- Discord-Bot-Token und Scanner-Credentials niemals in Tickets, Logs oder Commits posten.
- Geflaggte Inhalte enthalten sensible Medien; Zugriff auf `bot/data/` nur für Moderationspersonal.
- Lösch- oder Warnaktionen werden durch Reaction-Emojis gesteuert. Prüfe regelmäßig, dass `voteEmojis` serverweit konsistent sind.
- Bei Fehlern im Scanner (Timeout/403) bleibt die Moderation aktiv; die Meldung erscheint im Log.

## 9. Erweiterung & Wartung

- Neue Commands: Datei unter `bot/commands/` anlegen, `name` eindeutig wählen, Berechtigungen definieren.
- Neue Events: Datei unter `bot/events/`, Export `{ name, once?, execute }`.
- Event-Datenpersistenz kann erweitert werden (z. B. zusätzliche JSON-Exports). Nutze `eventStore.updateEvent` für Modifikationen.
- Für Video/GIF-Handling können zusätzliche Batch-Scans über `scannerClient.scanBatch` implementiert werden (vgl. Legacy-Code in `_archived/`).

## 10. Troubleshooting

| Problem | Ursache | Lösung |
|---------|---------|--------|
| Keine Scans trotz Uploads | Scanner deaktiviert oder keine Guild-Konfiguration | Prüfen, ob `scan.enabled` true und `scanner.baseUrl` gesetzt ist. Logs unter `bot/data/logs/bot.log` prüfen. |
| Commands reagieren nicht | Fehlende Berechtigungen oder falscher Prefix | `bot.prefix` prüfen, Rollen in `bot-config.json` anpassen. |
| Event-Upload abgelehnt | Upload-Limit erreicht | `maxEntriesPerUser` erhöhen oder Einträge löschen. |
| ZIP-Export fehlschlägt | Attachment nicht mehr verfügbar | Log prüfen, ggf. Export direkt nach Event-Ende durchführen. |

## 11. Bezug zur Legacy-Version

Das alte Projekt (`_archived/`) liefert Referenzcode für erweiterte Funktionen (Filter-Management, öffentliche Scanner-API, Video-Scans). Die strukturierte Zuordnung zwischen den historischen `*_v1`-Dateien und den produktiven Modulen ist in [`_archived/DOCU/STRUCTURE_SYNC.md`](../_archived/DOCU/STRUCTURE_SYNC.md) dokumentiert. Bei Portierungen stets prüfen, dass keine Scanner-Details außerhalb von `lib/scannerClient.js` landen und Legacy-Code nicht direkt eingebunden wird.
