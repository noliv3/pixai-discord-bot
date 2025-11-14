# PixAI Discord Bot – Phase 2 (Bot-only) Architekturentwurf

Fokus: Nur der Discord-Bot  
Der Scanner bleibt externer HTTP-Dienst und wird hier nur als Schnittstelle (Client) betrachtet.

---

## 1. Ziele der Neuausrichtung

1. Klare Trennung  
   - Bot = Discord-Logik, Events, Commands, Dateipersistenz  
   - Scanner = externer Dienst, nur über HTTP-Client ansprechbar

2. Modularität mit Versionssuffix  
   - Alle neuen Bot-Module mit `_v1` im Dateinamen  
   - Spätere Änderungen als `_v2`, `_v3` usw., ohne Altcode wegwerfen zu müssen

3. Eindeutige Verantwortlichkeiten  
   - `index.js` nur Bootstrap  
   - `commands/` nur Befehlslogik  
   - `events/` nur Discord-Events  
   - `lib/` nur wiederverwendbare Bausteine (Config, Scanner-Client, EventStore etc.)

---

## 2. Ziel-Projektstruktur (nur Bot)

Wurzelordner (vereinfachtes Zielbild):

- `index.js`
- `commands/`
  - `event_start_v1.js`
  - `event_stop_v1.js`
  - `event_stats_v1.js`
  - `event_zip_v1.js`
  - `setscan_v1.js`
  - `filter_v1.js`
- `events/`
  - `ready_v1.js`
  - `messageCreate_v1.js`
  - `messageReactionAdd_v1.js`
  - `messageReactionRemove_v1.js`
- `lib/`
  - `scannerClient_v1.js`
  - `botConfig_v1.js`
  - `eventStore_v1.js`
  - `flaggedStore_v1.js`
  - `logger_v1.js`
  - `permissions_v1.js`
- `config/`
  - `bot-config.json`
- `logs/`
  - `bot.log`
  - weitere Logfiles

Bestehende Dateien (`scanner-config.json`, alte `lib/*.js`) bleiben zunächst parallel und werden schrittweise in diese Struktur migriert.

---

## 3. Zentrales Konfigurationsmodell (Bot-Seite)

Neue Datei: `config/bot-config.json`

Beispielstruktur:

```json
{
  "bot": {
    "discordToken": "DISCORD_BOT_TOKEN",
    "ownerIds": ["OWNER_ID_1", "OWNER_ID_2"]
  },
  "guilds": {
    "123456789012345678": {
      "moderatorChannelIds": ["1111", "2222"],
      "rulesChannelId": "3333",
      "moderatorRoleIds": ["4444"],
      "scanEnabled": true
    }
  },
  "scanner": {
    "url": "http://localhost:8000",
    "email": "BOT"
  },
  "paths": {
    "eventFiles": "./event_files",
    "deletedFiles": "./deleted",
    "logs": "./logs"
  },
  "versions": {
    "events": "v1",
    "commands": "v1",
    "scannerClient": "v1",
    "eventStore": "v1"
  }
}
```

Funktion:

- `bot` → reine Bot-Infos (Token, Owners)  
- `guilds` → pro Server: Mod-Channel, Rollen, Scan-Schalter  
- `scanner` → Endpunkt und Identity (`email`) für Token vom Scanner  
- `paths` → zentrale Pfade für Dateien  
- `versions` → aktive Modulversionen

---

## 4. Einstiegspunkt `index.js` (Bot-Bootstrap)

Verantwortung von `index.js`:

1. Config laden über `botConfig_v1`
2. Discord-Client erstellen (Intents, Partials)
3. Globale Properties an `client` hängen:
   - `client.config` (fertige Konfiguration)
   - `client.commands` (Collection)
   - `client.activeEvents` (Map)
   - `client.flaggedReviews` (Map oder ähnliches)
   - `client.scanner` (Instanz von `scannerClient_v1`)
4. Commands aus `./commands/*_v1.js` laden und registrieren
5. Events aus `./events/*_v1.js` laden und registrieren
6. Fehler-Logging für `unhandledRejection` und `uncaughtException`
7. `client.login(client.config.bot.discordToken)`

`index.js` enthält keine Fachlogik, nur Verkabelung.

---

## 5. Commands – Struktur und Verantwortung

### 5.1 Gemeinsames Command-Schema

Alle Command-Dateien in `commands/`:

```js
module.exports = {
  name: 'start',
  version: 'v1',
  description: 'Startet ein Event',
  usage: '!start <tage> <uploads> <name>',
  permissions: ['MANAGE_GUILD'],
  async execute(message, client, args) {
    // Command-Logik
  }
};
```

- `name` → Aufrufname
- `version` → Implementationsversion
- `permissions` → Basis-Check; Feinlogik in `permissions_v1`

### 5.2 Event-Kommandos

- `event_start_v1.js`
  - Befehl: `!start <tage> <uploads> <name>`
  - ruft `eventStore_v1.startEvent({ ... })` auf
  - erstellt ggf. Event-Channel
  - setzt Laufzeit, Uploadlimit, Eventname

- `event_stop_v1.js`
  - Befehl: `!stop <eventname>`
  - ruft `eventStore_v1.stopEvent(name)` auf
  - löscht Timer, erzeugt Stats, meldet Ergebnis im Channel

- `event_stats_v1.js`
  - Befehl: `!eventstats`
  - ruft `eventStore_v1.getActiveEvents()` auf
  - zeigt laufende Events, Laufzeiten, Upload-Zahlen

- `event_zip_v1.js`
  - Befehl: `!zip <eventname> [topX]`
  - triggert ZIP-Erstellung über `eventStore_v1`
  - optional: Ergebnis posten oder per FTP weitergeben

### 5.3 Scan-/Filter-Kommandos

- `setscan_v1.js`
  - Befehl: `!setscan <flag> <delete>`
  - passt Schwellenwerte in `client.config` an
  - persistiert über `botConfig_v1.saveConfig`

- `filter_v1.js`
  - Befehl: `!filter <level> +tag|-tag`
  - verwaltet Taglisten (Level → Tags) in der Config
  - persistiert Änderungen

---

## 6. Events – Trennung nach Discord-Eventtypen

### 6.1 `ready_v1.js`

```js
module.exports = {
  name: 'ready',
  once: true,
  version: 'v1',
  async execute(client) {
    // Logging, Sanity-Checks
  }
};
```

Verantwortung:

- Bot-Tag und Anzahl Guilds loggen
- Prüfen, ob alle in `bot-config.json` definierten Guilds existieren
- Hinweise bei fehlenden Config-Einträgen

### 6.2 `messageCreate_v1.js`

```js
module.exports = {
  name: 'messageCreate',
  once: false,
  version: 'v1',
  async execute(message, client) {
    // Command-Pfad vs. Content-Pfad
  }
};
```

Verantwortung:

1. Command-Nachrichten erkennen (Prefix, z. B. `!`)  
   - Command-Namen und Argumente parsen  
   - `client.commands.get(name)?.execute(message, client, args)`

2. Content-Nachrichten mit Attachments/Links erkennen  
   - relevante Attachments (Images/Videos) sammeln  
   - pro Datei `scannerClient_v1.scanImage` oder `scanBatch` aufrufen  
   - Ergebnis verarbeiten (Risiko, Tags)  
   - Event-Logik: bei aktivem Event im Channel → `eventStore_v1.registerUpload(...)`

3. Fehler loggen, keine Crashes

### 6.3 `messageReactionAdd_v1.js`

```js
module.exports = {
  name: 'messageReactionAdd',
  once: false,
  version: 'v1',
  async execute(reaction, user, client) {
    // Mod-Logik
  }
};
```

Verantwortung:

- relevante Channels (z. B. Mod-Log) filtern  
- Emojis auswerten:
  - 👍 / 👎 → Review/Statistik  
  - ❌ → Originalnachricht löschen, Datei nach `deleted/` verschieben  
  - ⚠ → automatische DM-Warnung an Uploader (mit Link zum Regel-Channel)
- Punkte/Stats an `eventStore_v1.applyReaction(...)` bzw. `flaggedStore_v1` übergeben

### 6.4 `messageReactionRemove_v1.js`

```js
module.exports = {
  name: 'messageReactionRemove',
  once: false,
  version: 'v1',
  async execute(reaction, user, client) {
    // Rücknahme von Stimmen
  }
};
```

Verantwortung:

- Stimmen-/Flag-Entzug verarbeiten  
- Event-Punktestand aktualisieren (`eventStore_v1.applyReaction` mit entsprechendem Effekt)  
- Flagged-Status zurücksetzen, falls nötig

---

## 7. Lib-Module – Bot-interne Bausteine

### 7.1 `scannerClient_v1.js`

Aufgabe:

- HTTP-Client zum Scanner
- Token-Verwaltung für `Authorization`-Header

Schnittstelle (Skizze):

```js
async function ensureToken() { /* holt /token und cached */ }

async function scanImage(buffer, filename, mime) {
  // POST /check, multipart image
  // Rückgabe: { risk, tags, raw }
}

async function scanBatch(buffer, mime) {
  // POST /batch
  // Rückgabe: { risk, tags, frameCount, raw }
}

async function getStats() {
  // GET /stats
}

module.exports = { ensureToken, scanImage, scanBatch, getStats };
```

Fehlerverhalten:

- Bei HTTP 403 → einmal `/token?email=BOT&renew` holen und Request wiederholen  
- Bei Netzwerkfehlern Fehlerwert zurück, kein Prozessabsturz

### 7.2 `botConfig_v1.js`

Aufgabe:

- Laden und Speichern von `config/bot-config.json`
- Zugriffsfunktionen

```js
function loadConfig() { ... }         // JSON laden, Defaults ergänzen
function saveConfig(cfg) { ... }      // JSON schreiben
function getGuildConfig(cfg, guildId) { ... } // sicherer Zugriff

module.exports = { loadConfig, saveConfig, getGuildConfig };
```

### 7.3 `eventStore_v1.js`

Aufgabe:

- Verwaltung aller laufenden Events inkl. Dateistruktur

Datenstruktur:

```ts
type EventData_v1 = {
  name: string;
  channelId: string;
  startTime: number;
  endTime: number;
  maxEntriesPerUser: number;
  folder: string;
  entries: Array<{
    messageId: string;
    userId: string;
    filename: string;
    score: number;
  }>;
  users: Set<string>;
  timeoutHandle: Timeout;
};
```

Schnittstelle (Skizze):

```js
function startEvent(client, options) { ... }
function stopEvent(client, eventName) { ... }
function getActiveEvents(client) { ... }
function registerUpload(client, eventName, message, fileInfo) { ... }
function applyReaction(client, eventName, messageId, userId, emoji) { ... }
function toStatsJson(event) { ... }

module.exports = {
  startEvent,
  stopEvent,
  getActiveEvents,
  registerUpload,
  applyReaction,
  toStatsJson
};
```

Filenamen: `eventname_userid_msgid_rate3_timestamp.ext`

### 7.4 `flaggedStore_v1.js`

Aufgabe:

- Speicherung von moderierten Fällen (Flags, Entscheidungen)

```js
function loadFlaggedReviews() { ... }
function saveFlaggedReviews(store) { ... }

module.exports = { loadFlaggedReviews, saveFlaggedReviews };
```

### 7.5 `logger_v1.js`

Aufgabe:

- Einheitliches Logging in Konsole und Datei

```js
function info(msg, meta) { ... }
function warn(msg, meta) { ... }
function error(msg, meta) { ... }

module.exports = { info, warn, error };
```

### 7.6 `permissions_v1.js`

Aufgabe:

- Zentrale Prüfung von Rechten

```js
function canUseCommand(message, commandName) {
  // Owner-Check, Admin-Check, Mod-Rollen anhand bot-config
}

module.exports = { canUseCommand };
```

Commands nutzen nur `permissions.canUseCommand(...)`.

---

## 8. Datenmodelle im Bot

### 8.1 `client.activeEvents`

```js
client.activeEvents: Map<string, EventData_v1>;
```

Key:

- Empfohlen: Channel-ID

`EventData_v1` wie in 7.3.

### 8.2 `client.flaggedReviews`

Beispielstruktur:

```ts
{
  [messageId: string]: {
    guildId: string;
    channelId: string;
    userId: string;
    reason: string;
    emoji: string;
    moderatorId: string;
    timestamp: number;
  }
}
```

Persistenz über `flaggedStore_v1`.

---

## 9. Migrationsstrategie (nur Bot)

1. Config auslagern  
   - `config/bot-config.json` anlegen  
   - `botConfig_v1.js` schreiben  
   - `index.js` so umbauen, dass nur noch diese Config genutzt wird

2. Scanner-Client kapseln  
   - `scannerClient_v1.js` bauen  
   - alle Scanner-Aufrufe im Bot über dieses Modul leiten

3. Events neu zuschneiden  
   - existierende Event-Handler nach `events/*_v1.js` überführen  
   - `index.js` so anpassen, dass nur `_v1`-Events geladen werden

4. Commands strukturieren  
   - Logik in einzelne Dateien `commands/*_v1.js` auslagern  
   - gemeinsames Export-Schema nutzen

5. EventStore und FlaggedStore isolieren  
   - Event- und Flag-Logik nach `eventStore_v1` und `flaggedStore_v1` verschieben  
   - Event-Handler selbst nur noch als Dispatcher nutzen

6. Weitere Änderungen über neue Versionen  
   - neue Architektur jeweils als `_v2`-Module  
   - Aktivierung über den `versions`-Block in `bot-config.json`
