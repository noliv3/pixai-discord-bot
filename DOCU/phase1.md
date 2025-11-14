# Phase 1 – Funktionsanalyse (Scanner-Backend und Module)

Fokus: Bestandsaufnahme der vorhandenen Funktionen und Klassen im Scanner-System.  
Nur Analyse, keine Architektur-Änderungen.

---

## 1. main.py – Modulverwaltung / Hot-Reload

**Rolle:** Zentraler Manager für dynamisch ladbare Module. Liest `modules.cfg`, lädt Module, reloadet sie bei Änderungen und hält eine konsistente Map.

### Klasse `ModuleManager`

- `__init__(self)`
  - Erstellt:
    - `self.modules: Dict[str, object]` → aktuell geladene Module
    - `self.lock = RLock()` → Thread-Sicherheit
    - `self.version = 0` → simple Versionsnummer
  - Ruft sofort `self.load_modules()` auf, um Module aus `modules.cfg` zu laden.

- `load_modules(self)`
  - Liest `modules.cfg`:
    - überspringt leere Zeilen
    - überspringt Kommentarzeilen mit `#`
  - Lädt alle genannten Module in ein temporäres Dict `new_modules`:
    - für jeden Namen → `_load_module(name)`
    - nur erfolgreiche Module werden eingetragen
  - Ersetzt danach atomar `self.modules` in einem Lock:
    - merkt sich `old_modules`
    - `self.modules = new_modules`
    - `self.version += 1`
  - Entfernt nicht mehr aktive Module:
    - für alle Namen in `old_modules`, die nicht in `new_modules` sind:
      - `sys.modules.pop(name, None)`
      - Logging: `Unloaded module: {name}`

- `_load_module(self, name: str)`
  - Prüft, ob das Modul bereits geladen wurde:
    - wenn ja → `importlib.reload(existing)`
    - wenn nein → `importlib.import_module(name)`
  - Bei Erfolg:
    - Logging: `Loaded module: {name}`
    - Rückgabe des Modulobjektes
  - Bei Fehler:
    - Logging: `Failed to load {name}: {exc}`
    - Rückgabe `None`

- `reload_all(self)`
  - Einfacher Wrapper:
    - Logging: `Reloading modules...`
    - ruft `self.load_modules()`

- `get_modules(self) -> Dict[str, object]`
  - Gibt eine **Kopie** der Modul-Map zurück:
    - innerhalb des Locks `dict(self.modules)` erzeugt
  - Ermöglicht sicheren Snapshot für andere Komponenten (z. B. `scanner_api`).

### Freie Funktionen

- `on_change(manager: ModuleManager)`
  - Callback für `watcher`:
    - ruft nur `manager.reload_all()`

- `main()`
  - Initialisiert:
    - `manager = ModuleManager()`
    - `observer = start_watcher(lambda: on_change(manager))`
  - Endlosschleife:
    - iteriert über `manager.modules.values()`
    - wenn Modul `run`-Funktion hat → aufrufen
    - `time.sleep(2)` als Takt
  - `KeyboardInterrupt`:
    - Logging: `Exiting...`
    - `observer.stop()` und `observer.join()`


---

## 2. scanner_api.py – HTTP-API des Scanners

**Rolle:** HTTP-Schnittstelle zum gesamten Scanner-System.  
Stellt `/token`, `/check`, `/batch`, `/stats` bereit. Nutzt intern `ModuleManager`, `token_manager`, `gif_batch` und die Module aus `modules/`.

Globale Setups:

- Logging-Konfiguration (Datei `scanner.log`)
- `manager = ModuleManager()` → eigener Instanzmanager für Laufzeit-Module
- Konstanten:
  - `MAX_IMAGE_SIZE = 10 * 1024 * 1024` (10 MB)
  - `MAX_BATCH_SIZE = 25 * 1024 * 1024` (25 MB)

### Hilfsfunktionen

- `_is_valid_image(data: bytes) -> bool`
  - nutzt Pillow (`Image.open`, `img.verify()`)
  - prüft, ob die Bytes ein valides Bild sind
  - Rückgabe: `True` bei Erfolg, sonst `False`

- `process_image(image_bytes: bytes) -> dict`
  - Zweck: Orchestrierung der Bildverarbeitung über die einzelnen Module.
  - Schritte:
    1. Leeres Dict `results = {}`
    2. Modul `nsfw_scanner`:
       - `nsfw_scanner.process_image(image_bytes)`
       - Ergebnis oder `{"error": str(e)}` bei Exception
       - Speichern unter `"modules.nsfw_scanner"`
    3. Modul `tagging`:
       - `tagging.process_image(image_bytes)`
       - Ergebnis oder `{"error": str(e)}`
       - Speichern unter `"modules.tagging"`
       - extrahiert Tags: `t.get("label")`, wenn `t` ein Dict ist
    4. Modul `deepdanbooru_tags`:
       - `deepdanbooru_tags.process_image(image_bytes)`
       - Ergebnis oder `{"error": str(e)}`
       - Speichern unter `"modules.deepdanbooru_tags"`
       - weitere Tags aus `ddb_result.get("tags", [])`
    5. Aggregation:
       - `all_labels = tags + ddb_tags`
       - `statistics.record_tags(all_labels)`
       - Ergebnis oder `{"error": str(e)}` unter `"modules.statistics"`
    6. Modul `image_storage`:
       - `image_storage.process_image(image_bytes, tags=..., nsfw_meta=..., danbooru_tags=...)`
       - Ergebnis oder `{"error": str(e)}` unter `"modules.image_storage"`
    7. Dynamische Module:
       - `manager.get_modules().items()`
       - überspringt Kernmodule (`nsfw_scanner`, `tagging`, `deepdanbooru_tags`, `image_storage`, `statistics`)
       - wenn Modul `process_image` hat:
         - ausführen und Ergebnis in `results[name]`
         - Fehler loggen, `{"error": str(e)}` bei Exception
  - Bei Gesamtfehler:
    - Log: `process_image failed`
    - Rückgabe: `{"error": str(e)}`

### Klasse `ScannerHandler(BaseHTTPRequestHandler)`

`protocol_version = "HTTP/1.1"`, aber alle Antworten setzen `Connection: close`.

Hilfs-Methoden:

- `_send_bytes(self, code: int, body: bytes, ctype: str)`
  - sendet:
    - Statuscode
    - `Content-Type`
    - `Content-Length`
    - `Connection: close`
  - schreibt Body, flush, setzt `self.close_connection = True`
  - fängt Exceptions ab, ignoriert sie still

- `_send_json(self, code: int, payload: dict)`
  - serialisiert `payload` per `json.dumps`
  - ruft `_send_bytes(code, ..., "application/json")`

- `_send_text(self, code: int, text: str)`
  - ruft `_send_bytes(code, text.encode(), "text/plain; charset=utf-8")`

- `_log_raw_request(self, note: str)`
  - versucht mit `self.request.recv(..., socket.MSG_PEEK)` einen Einblick in rohe TCP-Daten
  - schreibt Eintrag in `raw_connections.log`:
    - Peer-Adresse
    - Notiz
    - rohen Daten-Chunk, soweit dekodierbar
  - Fehlertolerant, Exceptions werden ignoriert

- `_validate_token(self) -> bool`
  - liest `Authorization`-Header
  - prüft via `token_manager.is_valid_token(tok)`
  - bei Fehlschlag:
    - `_log_raw_request("Token ungültig oder fehlt")`
    - `_send_json(403, {"error": "forbidden"})`
    - Rückgabe `False`
  - bei Erfolg → `True`

HTTP-Methoden:

- `do_GET(self)`
  - Pfad beginnt mit `/token`:
    - parsed `email` aus Query (`?email=...`)
    - optional `renew` (nur Präsenz relevant)
    - wenn `email` fehlt: `400 {"error":"missing email"}`
    - sonst:
      - `token_manager.get_token(email, renew=renew)`
      - Antwort: `200` Text, nur der Token
  - Pfad exakt `/stats`:
    - zuerst `_validate_token()`
    - bei Erfolg:
      - `statistics.get_statistics()`
      - `200` JSON
  - sonst: `404 {"error":"not found"}`
  - Exceptions:
    - Log: `GET failed`
    - Antwort: `500 {"error": str(e)}`

- `do_POST(self)`
  - prüft zunächst `Content-Type`:
    - wenn nicht `multipart/form-data` enthalten:
      - `_log_raw_request("Ungültiger Content-Type")`
      - `403 {"error":"invalid content-type"}`
  - Pfad `/check`:
    - ruft `_handle_check()`
  - Pfad `/batch`:
    - ruft `asyncio.run(self._handle_batch())`
  - sonst:
    - `_log_raw_request("Ungültiger POST-Pfad: ...")`
    - `403 {"error":"invalid path"}`
  - Exceptions:
    - Log: `POST failed`
    - `500 {"error": str(e)}`

Endpunkt-Implementierungen:

- `_handle_check(self)`
  - `_validate_token()`, bei False Rückkehr
  - `_parse_multipart()`:
    - erwartet Field `"image"`
  - Fehlerfälle:
    - kein `image` oder kein `file` → `400 {"error":"image missing"}` + Log
    - zu großes Bild (> `MAX_IMAGE_SIZE`) → `413 {"error":"payload too large"}`
    - `_is_valid_image` False → `400 {"error":"invalid image"}`
  - bei Erfolg:
    - `result = process_image(buf)`
    - `200` JSON

- `_handle_batch(self)` (async)
  - `_validate_token()`
  - prüft erneut `Content-Type`
  - `_parse_multipart()`:
    - erwartet Field `"file"`
  - Fehlerfälle:
    - fehlendes Feld → `400 {"error":"file missing"}` + Log
    - Datei zu groß (> `MAX_BATCH_SIZE`) → `413 {"error":"payload too large"}`
  - ermittelt MIME-Type:
    - aus `item.type` oder `mimetypes.guess_type(...)`
  - ruft `await scan_batch(raw, mime)`
  - Antwort `200` JSON oder `500` mit Fehler-Log bei Exception

Utility:

- `_parse_multipart(self)`
  - nutzt `cgi.FieldStorage`:
    - `fp=self.rfile`
    - `headers=self.headers`
    - `environ` mit `REQUEST_METHOD` und `CONTENT_TYPE`
  - bei Exception:
    - Log: `multipart parse failed`
    - `_log_raw_request("Multipart parse exception")`
    - Rückgabe `None`

- `log_message(self, *a)`
  - überschreibt Standard-Logging von `BaseHTTPRequestHandler`
  - tut nichts (keine Konsolen-Spam)

### Freie Funktion

- `run(port: int = 8000)`
  - innere Klasse `SafeServer(ThreadingHTTPServer)`:
    - überschreibt `handle_error`, schreibt Verbindungsfehler in `raw_connections.log`
  - setzt `allow_reuse_address = True`
  - startet Server auf `("", port)` mit `ScannerHandler`
  - läuft blockierend im Vordergrund


---

## 3. gif_batch.py – GIF/Video-Frames scannen (Batch-Scan)

**Rolle:** Entgegennahme von GIF/Video-Daten, Extraktion von Frames via ffmpeg, multipler Bildscan und Aggregation eines Risikowerts.

Wichtige Konstanten (vereinfachter Überblick):

- `GIF_STEP` → Schrittweite für GIF-Frames
- `VIDEO_STEP` → Schrittweite für Video-Frames
- `MAX_OUT_FRAMES` → maximale Anzahl extrahierter Frames
- `FFMPEG` → Pfad zur ffmpeg-Binary (Umgebung oder lokaler Pfad)

### Hilfsfunktionen

- `_extract_frames(src: Path) -> tuple[list[Path], Path]`
  - legt temporäres Verzeichnis an
  - ruft `ffmpeg` auf, um Frames als PNGs zu extrahieren
  - begrenzt auf `MAX_OUT_FRAMES`
  - Rückgabe:
    - Liste von Frame-Dateipfaden
    - das Temp-Verzeichnis selbst (für späteres Aufräumen)

- `_sample_indices(total: int, step: int) -> list[int]`
  - berechnet Indexliste der zu scannenden Frames:
    - immer erstes und letztes Frame
    - dazu alle `step`-basierten Zwischenframes
    - Indizes innerhalb `0..total-1`
  - stellt sicher, dass bei wenigen Frames keine Duplikate entstehen

- `_risk_from(nsfw_res, ddb_res) -> float`
  - extrahiert aus:
    - NSFW-Ergebnis (z. B. Scores für hentai/porn/sexy)
    - Danbooru-Tags (`rating:explicit`, `rating:questionable`, etc.)
  - berechnet daraus eine normalisierte Risiko-Zahl (0.0–1.0)
  - rundet Ergebnis ggf. auf bestimmte Nachkommastellen

### Hauptfunktion

- `async scan_batch(buf: bytes, mime: str = "") -> dict`
  - schreibt `buf` in temporäre Datei
  - ruft `_extract_frames` auf, erhält Liste von Frames
  - wählt anhand `mime` die Schrittweite:
    - GIF → `GIF_STEP`
    - sonst → `VIDEO_STEP`
  - erzeugt Sample-Indizes via `_sample_indices`
  - lädt entsprechende Frames und scannt sie:
    - `nsfw_scanner` (Bildweise)
    - `tagging` (Bildweise)
    - `deepdanbooru_tags` (Bildweise)
  - pro Frame:
    - bestimmt Risiko via `_risk_from` aus NSFW + DDB-Ergebnis
  - aggregiert über alle Frames:
    - `max_risk` (Maximum)
    - Vereinigungsmenge aller Tags
    - Gesamtzahl der Frames
  - möglicher Early-Exit:
    - wenn `max_risk >= 1.0` (harte Grenze)
  - räumt temporäre Dateien und Ordner auf
  - Rückgabe:
    - `{"risk": max_risk, "tags": [...], "frameCount": total}`


---

## 4. token_manager.py – Token-Generierung und -Verwaltung

**Rolle:** Stellt Token-Speicher bereit, der Nutzer/Emails (z. B. `BOT`) auf Token abbildet.  
Sorgt für Erzeugung, Persistenz, Locking und Ablauf (Expiry).

### Konfiguration und Locking

- `TOKENS_FILE = Path('tokens.json')`
  - JSON-Datei für Token-Speicher, Format etwa:
    - `{ "email": {"token": "...", "ts": <timestamp>}, ... }`
    - oder Legacy: `"email": "<token>"`

- `EXPIRY_SECONDS = 3600 * 24 * 30`
  - 30 Tage Gültigkeit

Plattformabhängiges Locking:

- versucht `fcntl`:
  - `LOCK_SH`, `LOCK_EX`
  - `_lock(f, flag)` → `fcntl.flock`
  - `_unlock(f)` → `flock` mit `LOCK_UN`
- Fallback `portalocker`:
  - gleiche API auf höherem Level

### Interne Funktionen

- `_load_tokens() -> dict`
  - wenn `tokens.json` nicht existiert:
    - Rückgabe `{}`
  - sonst:
    - öffnet Datei im Shared-Lock
    - versucht `json.load(f)`
    - bei Fehler → `{}`
    - Lock wird in jedem Fall wieder freigegeben

- `_save_tokens(tokens: dict) -> None`
  - öffnet `tokens.json` im Schreibmodus
  - Exclusive-Lock
  - `json.dump(tokens, f)`
  - Lockfreigabe
  - Exceptions werden komplett geschluckt (kein Crash)

- `_cleanup(tokens: dict) -> None`
  - berechnet `now = int(time.time())`
  - iteriert über alle Einträge:
    - unterscheidet zwischen Dict-Format `{token, ts}` und Legacy-String
    - wenn `now - ts > EXPIRY_SECONDS`:
      - markiert Email zum Entfernen
  - entfernt abgelaufene Einträge
  - speichert geänderte Daten bei Bedarf

### Öffentliche Funktionen

- `get_token(email: str, *, renew: bool = False) -> str`
  - lädt Token-Daten (`_load_tokens`)
  - bereinigt abgelaufene Token (`_cleanup`)
  - wenn `renew` oder Email nicht vorhanden:
    - erzeugt neuen Token via `secrets.token_hex(16)`
    - speichert `{"token": ..., "ts": now}` unter der Email
    - `_save_tokens(tokens)`
  - bei vorhandenem Eintrag:
    - Dict-Format:
      - Rückgabe `info.get("token")`
    - Legacy-Format:
      - Rückgabe `info`
  - finale Rückgabe: `tokens[email]["token"]` (im Dict-Fall)

- `is_valid_token(token: str) -> bool`
  - lädt Tokens
  - `_cleanup(tokens)`
  - iteriert über alle Einträge:
    - Dict-Format:
      - wenn `info.get("token") == token` → True
    - Legacy-Format:
      - wenn `info == token` → True
  - sonst: False

Einsatzgebiet:

- `scanner_api._validate_token()` nutzt diese Funktion, um `Authorization`-Header zu prüfen.
- `scanner_api` gibt Tokens via `/token?email=...` aus.


---

## 5. watcher.py – Dateisystem-Watcher für Module

**Rolle:** Überwacht `modules/` und `modules.cfg`.  
Bei jeder Änderung wird ein Callback getriggert, typischerweise `ModuleManager.reload_all()`.

Globale Konfiguration:

- `WATCH_PATHS = [Path("modules"), Path("modules.cfg")]`

### Klasse `ChangeHandler(FileSystemEventHandler)`

- `__init__(self, callback: Callable[[], None])`
  - speichert `self.callback`
- `on_any_event(self, event)`
  - wenn `event.is_directory` → ignorieren
  - sonst:
    - Logging: `Detected change: {event.src_path}`
    - ruft `self.callback()`

### Funktion `start_watcher(on_change: Callable[[], None])`

- erzeugt `handler = ChangeHandler(on_change)`
- erstellt `observer = Observer()`
- für jeden Pfad in `WATCH_PATHS`:
  - `observer.schedule(handler, str(path), recursive=path.is_dir())`
- startet Observer in eigenem Thread (`daemon=True`)
- Rückgabe:
  - `observer`, der später mit `stop()` und `join()` beendet werden kann

---

## 6. Gesamtbild Phase 1

- **ModuleManager / watcher**
  - sorgen für dynamisches Laden/Reloaden von Bildverarbeitungsmodulen
  - Trennung zwischen Konfiguration (`modules.cfg`) und actual code

- **scanner_api**
  - zentraler HTTP-Einstiegspunkt → `/token`, `/check`, `/batch`, `/stats`
  - authentifiziert Requests mit `Authorization`-Header via `token_manager`
  - orchestriert Bildverarbeitung über Kernmodule und dynamische Module

- **gif_batch**
  - Spezialpfad für Videos/GIFs
  - nutzt ffmpeg, extrahiert Frames, berechnet Risikowert über mehrere Frames

- **token_manager**
  - kümmert sich um Tokens, die der Bot nutzen kann, um den Scanner anzusprechen
  - 30-Tage-Expiry, plattformunabhängige Locks

- **watcher**
  - verbindet Dateisystem-Änderungen mit Modul-Reload
  - erleichtert Hot-Reload von Analyse-Modulen ohne Neustart des gesamten Scanners

Diese Analyse beschreibt den IST-Zustand der Kernteile des Scanner-Backends und dient als Grundlage für Phase 2 (Architektur- und Modularisierungsentwurf des Bots).
