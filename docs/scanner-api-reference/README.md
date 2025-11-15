# PixAI Sensible Scanner

Der **PixAI Sensible Scanner** stellt eine API bereit, mit der Bilder auf Verstöße gegen definierte Richtlinien untersucht werden. Typische Anwendungsfälle sind Bots oder Webserver, die Bilder entgegennehmen und vor der Weiterverarbeitung prüfen möchten.

## Funktionen

- **Bildanalyse**: Prüfung eingereichter Bilder anhand fester Richtlinien und einer konfigurierbaren Schlagwortliste.
- **Konfigurierbare Keywords**: Die Liste verbotener oder sensibler Begriffe wird in einer `cfg`-Datei gepflegt und kann beliebig erweitert werden.
- **REST-API**: Ein HTTP-Endpunkt nimmt Bilder entgegen und liefert ein Ergebnis, ob das Bild den Richtlinien entspricht.
- **NSFW-Erkennung**: Modul auf Basis von `nsfw_detector`, das Bilder auf nicht jugendfreie Inhalte prüft.
- **Tagging**: Ermittelt Schlagwörter zum Bildinhalt per `MobileNetV2`.
- **DeepDanbooru-Tagging**: Spezielles Modell zur Klassifikation von
  AI- oder Anime-Bildern.
- **Speicherung**: Skalierte Bilder und Metadaten werden unter `scanned/` abgelegt.
- **Statistik**: Zählt verarbeitete Bilder und erfasst, welche Tags am
  häufigsten vorkommen. Die Zähler werden im Arbeitsspeicher geführt und nach
  jedem Upload zusätzlich in `scanned/statistics.json` abgelegt. Über den
  Endpunkt `/stats` lassen sich die aktuellen Werte abrufen.
- **Größenlimit**: Bilder über 10&nbsp;MB werden vom Server abgewiesen, um
  Speicherprobleme zu vermeiden.
- **Parallele Verarbeitung**: Die API nutzt nun einen
  `ThreadingHTTPServer` und kann mehrere Uploads gleichzeitig bearbeiten.
- **Token-Lebensdauer**: API-Tokens verfallen automatisch nach 30&nbsp;Tagen
  und werden in `tokens.json` mit Zeitstempel gespeichert.
- **Automatisches Modul-Reloading**:
  Ein Watcher erkennt Änderungen im Verzeichnis `modules/` oder der Datei
  `modules.cfg` und lädt betroffene Module automatisch neu. Dank einer
  Versionsverwaltung mit Lock greifen laufende Requests weiterhin auf die
  bisher aktive Modulversion zu, bis das neue Set vollständig geladen ist.
  Weder die API noch `main.py` müssen dazu neu gestartet werden.

## Statistikmodul

Das Modul `modules.statistics` führt eine globale Zählung aller verarbeiteten
Bilder und hält fest, welche Tags besonders oft erkannt werden. Diese Daten
liegen zunächst im Arbeitsspeicher vor, werden nach jeder Verarbeitung aber in
`scanned/statistics.json` gespeichert, sodass sie auch nach einem Neustart
erhalten bleiben. Die API stellt dafür den Endpunkt `/stats` bereit.

Beispiel:

```bash
curl http://localhost:8000/stats
```

## Projektstruktur

```
LICENSE     GPLv3-Lizenztext
README.md   Projektdokumentation
main.py     Einstiegspunkt für die Anwendung
scanner_api.py Einfacher API-Server
watcher.py  Überwacht Module und Konfiguration
modules/    Beispielmodule
modules.cfg Liste der zu ladenden Module
scanned/    Ablage verarbeiteter Bilder und Metadaten
```

## Installation (geplant)

Voraussetzung ist Python 3.10.

1. Repository klonen
   ```bash
   git clone https://example.com/pixai-sensible.git
   ```
2. Abhängigkeiten installieren
   ```bash
   pip install -r requirements.txt
   ```
   Das vortrainierte Modell `nsfw_mobilenet2.224x224.h5` ist nicht im Repository enthalten. Lade es von https://github.com/Silicon27/NSFW-image-detector/raw/main/nsfw_mobilenet2.224x224.h5 herunter und speichere es als `modules/nsfw_model.h5` im gleichen Verzeichnis.

3. Optional: DeepDanbooru unterstützen
   ```bash
   pip install deepdanbooru
   ```
   Lade das DeepDanbooru-Modell herunter und lege es in
   `modules/deepdanbooru_model/` ab. Falls du dieses Paket nicht installierst,
   entferne `modules.deepdanbooru_tags` aus `modules.cfg`.


### Installation verifizieren

Führe nach der Einrichtung die Tests aus, um sicherzustellen, dass alle Module korrekt geladen werden und die API funktioniert:

```bash
pytest
```

Die Testfälle decken sowohl das Laden der Module als auch das Verhalten der API-Endpunkte ab.

## Konfiguration

Die Keywords werden manuell in einer Konfigurationsdatei gepflegt. Beispiel `scanner.cfg`:

```
[keywords]
forbidden = wort1, wort2, wort3
```

Diese Datei wird vom Scanner geladen, um unerwünschte Inhalte zu erkennen.

## Nutzung

1. API-Server starten
   ```bash
   python scanner_api.py
   ```
2. Bild prüfen (Beispiel)
   ```bash
   curl -F "image=@beispiel.png" \
        -H "Authorization: <TOKEN>" \
        http://localhost:8000/check
   ```

   Die API gibt ein JSON-Objekt mit den Resultaten aller geladenen Module
   zurück, z. B.:

   ```json
   {
       "modules.module_a": {"size": 12345},
       "modules.nsfw_scanner": {"sfw": 0.99}
   }
   ```
   Weitere Details zur Verarbeitung werden in der Datei
   `scanner.log` abgelegt. Nach einem Request kannst du dort
   nachvollziehen, welche Tags oder NSFW-Werte ermittelt wurden.

   ```bash
   tail -f scanner.log
   ```
   zeigt laufend neue Einträge während du weitere Bilder prüfst.

3. Statistiken abrufen
   ```bash
   curl -H "Authorization: <TOKEN>" http://localhost:8000/stats
   ```
   Das Ergebnis liefert die Gesamtzahl verarbeiteter Bilder und die
   aktuell am häufigsten auftretenden Tags. Die Daten werden dauerhaft in
   `scanned/statistics.json` gespeichert.

### Token abrufen

Einen API-Token erhältst du über den Endpunkt `/token`. Beispiel:

```bash
curl "http://localhost:8000/token?email=you@example.com"
```

Mit `renew=1` lässt sich ein neuer Token erzeugen:

```bash
curl "http://localhost:8000/token?email=you@example.com&renew=1"
```

Der Token muss anschließend bei jedem Aufruf im Header `Authorization`
übermittelt werden.
Die Tokens werden in der Datei `tokens.json` im Projektverzeichnis
gespeichert. Abgelaufene Tokens werden automatisch entfernt.

   Die hochgeladenen Bilder werden nur temporär im Arbeitsspeicher
   verarbeitet und nicht dauerhaft gespeichert. Das Starten von `main.py`
   ist optional, aktiviert aber ein automatisches Nachladen der Module,
   wenn sich Dateien ändern.

## Dynamische Module

Mit `main.py` steht ein einfacher Einstiegspunkt bereit, der Module aus der
Datei `modules.cfg` lädt. Ein Watcher überwacht sowohl diese Konfigurationsdatei
als auch das Verzeichnis `modules/`. Sobald sich dort etwas ändert, werden die
betroffenen Module automatisch neu geladen, ohne dass die Anwendung neu
gestartet werden muss.

`main.py` selbst enthält keine Logik zur Bildverarbeitung. Diese wird
ausschließlich in den einzelnen Modulen oder in anderen Komponenten wie
`scanner_api.py` umgesetzt.

Starten des Watchers und der Module:

```bash
python main.py
```

Der Watcher basiert auf der Bibliothek `watchdog` und läuft im Hintergrund,
während das Programm die geladenen Module ausführt. Wird das Programm mit
`Ctrl+C` beendet, stoppt `main.py` den Beobachter über `observer.stop()` und
wartet mit `observer.join()` auf das Ende des Threads.

### Gemeinsame Schnittstelle

Jedes Modul kann optional eine Funktion
`process_image(data: bytes) -> Any` bereitstellen. Diese Funktion
erhält die Bilddaten als Bytes und kann beliebige Ergebnisse
zurückliefern. Die Verarbeitung der Bilder erfolgt ausschließlich in
den Modulen selbst. `main.py` kümmert sich nur um das Laden und
Aktualisieren dieser Module. Andere Komponenten (z.B. `scanner_api.py`)
rufen die Funktionen auf und sammeln die Ergebnisse in einem Dictionary,
wobei der Schlüssel dem Modulnamen entspricht.

Ein sehr einfaches Beispiel befindet sich in `modules/module_a.py`:

```python
def process_image(data: bytes):
    size = len(data)
    print(f"module_a processed image with {size} bytes")
    return {"size": size}
```

## Mitwirken

Beiträge und Verbesserungsvorschläge sind willkommen. Bitte beachte die Lizenzbedingungen der [GNU GPLv3](LICENSE).

## Lizenz

Dieses Projekt steht unter der GNU General Public License Version 3.

