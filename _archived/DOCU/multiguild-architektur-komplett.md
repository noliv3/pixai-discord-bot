# Modularer Discord-Bot für Mehrfach-Gilden-Unterstützung

## Konfigurationsdatei mit Gilden-spezifischen Einstellungen (`bot-config.json`)

Ein zentraler Bestandteil der Bot-Architektur ist eine Konfigurationsdatei, in der globale und gildenbezogene Einstellungen getrennt verwaltet werden. In der JSON-Struktur von `bot-config.json` gibt es typischerweise einen Abschnitt für globale Bot-Infos (z. B. Token, globale Owner-IDs) sowie einen Abschnitt `guilds` für jede angebundene Discord-Gilde (Server). Jeder Eintrag unter `guilds` ist durch die Guild-ID indiziert und enthält die spezifischen Einstellungen dieses Servers, z. B. Moderationskanäle, Rollen und Scan-Parameter:

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
      "scanEnabled": true,
      "scanFlagThreshold": 0.5,
      "scanDeleteThreshold": 0.8
    },
    "987654321098765432": {
      "moderatorChannelIds": ["5555", "6666"],
      "rulesChannelId": "7777",
      "moderatorRoleIds": ["8888"],
      "scanEnabled": true,
      "scanFlagThreshold": 0.6,
      "scanDeleteThreshold": 0.9
    }
  },
  "scanner": {
    "url": "http://scanner.example/api",
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

In dieser Konfiguration stehen unter `guilds` pro Server die gildenbezogenen Einstellungen. Dazu gehören beispielsweise:

- Moderations-Kanäle (`moderatorChannelIds`), in denen der Bot Meldungen oder Log-Einträge postet.
- Regel- oder Info-Kanal (`rulesChannelId`), für automatische Hinweise bei Regelverstößen.
- Moderator-Rollen (`moderatorRoleIds`), die angeben, welche Rollen in der jeweiligen Gilde als Moderatoren gelten.
- Scan-Einstellungen wie ein An/Aus-Schalter (`scanEnabled`) und Schwellenwerte (`scanFlagThreshold`, `scanDeleteThreshold`) für automatisches Markieren bzw. Löschen von Inhalten. Diese Schwellenwerte bestimmen, ab welchem Risikolevel (etwa durch einen Content-Scanner ermittelt) Inhalte als verdächtig markiert oder automatisch entfernt werden.

Die globalen Einstellungen außerhalb des `guilds`-Blocks – wie z. B. Bot-Token, globale Besitzer (`ownerIds`), Scanner-Service-URL oder Pfade – können nicht von Gilden-Moderatoren verändert werden. Durch diese klare Trennung wird sichergestellt, dass jede Gilde eigene Parameter hat, ohne globale Konfigurationswerte zu überschreiben.

## Getrennte Ereignisverwaltung pro Gilde

Damit der Bot in beliebig vielen Servern gleichzeitig laufen kann, wird die Verarbeitung von Events (Ereignissen) nach Guild kontextualisiert. Konkret bedeutet dies, dass für jeden Server separate Event-Daten geführt werden und keine Vermischung stattfindet. Der Bot hält dafür eine Datenstruktur `client.activeEvents` bereit, die alle aktuell laufenden Events verwaltet. Diese kann z. B. als Map realisiert werden, in der jedes aktive Event unter einem eindeutigen Schlüssel registriert ist. Als Key eignet sich insbesondere die Channel-ID des Event-Kanals, da jeder Event in einem bestimmten Kanal pro Guild stattfindet und Channel-IDs global eindeutig sind. Auf diese Weise sind sogar gleichnamige Events in verschiedenen Servern unterscheidbar, da sie unterschiedliche Channel-IDs besitzen.

Wie die Event-Verwaltung funktioniert: Sobald in einer Gilde ein neues Event via Command gestartet wird (z. B. mit `!start`), erzeugt der Bot einen neuen Eintrag in `client.activeEvents` für diesen Guild-spezifischen Event. Alle weiteren Vorgänge wie Uploads und Reaktionen werden kontextabhängig behandelt. Der Message-Event-Handler überprüft beispielsweise bei jedem neuen Beitrag mit Attachments, ob im entsprechenden Channel ein aktives Event läuft – nur dann wird der Upload dem Event hinzugefügt. Dieses Vorgehen stellt sicher, dass nur der Event der aktuellen Gilde die Uploads erhält und andere Gilden davon unberührt bleiben. Genauso verfahren die Reaction-Handler: Bei jeder Reaktion prüft der Bot zunächst, ob der zugehörige Kanal ein Event-Kanal ist, und wendet dann die Aktion (Bewertung, Löschen, Flaggen etc.) nur auf das Event dieser Gilde an.

Die Event-Management-Library (hier z. B. `eventStore_v1`) kapselt die Logik zum Starten, Stoppen und Verwalten von Events und nimmt immer den Guild-Kontext mit entgegen. Methoden wie `startEvent`, `registerUpload` oder `applyReaction` können intern den Guild-spezifischen Speicher (`client.activeEvents`) nutzen, um nur die betreffenden Events zu verändern. Durch diese Architektur laufen Events in verschiedenen Servern vollkommen unabhängig voneinander ab.

## Rechte- und Rollenprüfung pro Server

Um sicherzustellen, dass Moderatoren nur ihre eigenen Events und Einstellungen anpassen können, implementiert der Bot eine gildenabhängige Rechteprüfung. Jeder Command definiert zunächst grundlegende erforderliche Berechtigungen, z. B. Discord-eigene Berechtigungs-Flags wie `MANAGE_GUILD`. Zusätzlich gibt es ein zentrales Berechtigungsmodul (z. B. `permissions_v1.js`), das pro Aufruf fein granular prüft, ob der Nutzer berechtigt ist, den Befehl in der aktuellen Gilde zu nutzen. Die Funktion `permissions.canUseCommand(message, commandName)` validiert typischerweise:

- Bot-Owner: Ob die Nutzer-ID in der globalen Owner-Liste (`ownerIds` in der Config) ist – solche Benutzer dürfen in der Regel alle Befehle ausführen (auch globale Einstellungen ändern).
- Admin/Moderationsrechte der Gilde: Ob der Nutzer z. B. Administrator der Gilde ist oder die vom Command geforderten Discord-Rechte (wie `MANAGE_GUILD`) besitzt.
- Moderator-Rolle der Gilde: Ob der Nutzer eine der in der Gilden-Config hinterlegten Moderator-Rollen innehat. Diese Rollen werden aus `bot-config.json` geladen und sind spezifisch pro Server konfiguriert.

Nur wenn diese Prüfungen erfolgreich sind, wird der Command tatsächlich ausgeführt (die Commands rufen z. B. `permissions.canUseCommand(...)` auf, bevor sie ihre Hauptlogik ausführen). Dadurch kann ein Moderator einer Gilde nicht die Einstellungen einer anderen Gilde manipulieren, da ihm dort die berechtigte Rolle fehlt. Ebenso sind globale Befehle oder Konfigurationsänderungen (z. B. Änderung der Scanner-URL oder globaler Schwellenwerte) auf Bot-Owner beschränkt. Diese Trennung stellt sicher, dass lokale Moderator-Teams zwar autonomen Zugriff auf „ihren“ Bot haben, aber keine globalen Parameter verändern können.

## Datenmodelle und Gilden-getrennte Speicherung

Die Bot-Architektur trennt auch intern die Datenhaltung strikt pro Server. Alle relevanten Datenstrukturen enthalten eine Guild-Referenz, um Kollisionen zu vermeiden:

- **Gilden-Konfigurationen:** Nach dem Laden der JSON-Konfiguration werden die Einstellungen jeder Gilde entweder in einer Map oder direkt in der `client.config.guilds` Struktur gehalten. Über Hilfsfunktionen wie `botConfig_v1.getGuildConfig(config, guildId)` kann der Bot sicher die Konfiguration für eine gegebene Guild-ID abrufen. Dieses Objekt beinhaltet nur die Werte der jeweiligen Gilde. Änderungen daran (z. B. durch Commands wie `!setscan` oder `!filter`) werden nur auf dieser Guild-Konfigurationsinstanz vorgenommen und anschließend mit `saveConfig` zurück in die Datei geschrieben, ohne andere Guild-Einträge zu berühren.
- **Aktive Events:** Wie oben beschrieben, werden laufende Events im Objekt `client.activeEvents` gespeichert als `Map<string, EventData>`. Der Key ist z. B. die Channel-ID des Eventkanals, wodurch die Zugehörigkeit zu einer Guild implizit gegeben ist (aus der Channel-ID kann die Guild ermittelt werden). Alternativ könnte man die Struktur auch hierarchisch gestalten, z. B. `client.activeEvents[guildId][eventName]`, um zunächst nach Guild zu gruppieren – jedoch reicht der Channel als eindeutiger Schlüssel aus. Das `EventData` enthält alle notwendigen Informationen zum Event (Name, Kanal, Teilnehmer, Beiträge usw.) und bleibt isoliert für diese Guild.
- **Moderationsfälle (Flags):** Ähnlich werden gemeldete oder moderierte Inhalte getrennt gehalten. Ein Beispielmodell `client.flaggedReviews` könnte z. B. eine Map von Message-ID zu Details des Falls sein. Darin wird pro Eintrag die `guildId` festgehalten, sodass klar ist, zu welcher Gilde der Vorfall gehört. So können Entscheidungsfälle oder Logs pro Server gefiltert und behandelt werden, ohne sich gegenseitig zu beeinflussen.
- **Persistente Daten:** Sollten Events oder Moderationsfälle auf dem Dateisystem oder in einer Datenbank gespeichert werden, empfiehlt es sich, auch hier eine logische Trennung nach Guild vorzunehmen. Beispielsweise könnten hochgeladene Dateien in Unterordnern pro Event oder pro Gilde abgelegt werden (der `eventStore_v1` führt für jedes Event einen eigenen Ordner in den `eventFiles` auf). Ebenso könnten Statistik- oder Log-Dateien pro Server separat gespeichert werden. Diese Trennung erleichtert Wartung und Datenschutz, da bei Bedarf die Daten einer einzelnen Gilde isoliert betrachtet oder entfernt werden können, ohne globalen Einfluss.

Durch diese Datenmodellierung bleibt die Datenhaltung pro Server sauber getrennt, und der Bot kann bedenkenlos in vielen Gilden parallel aktiv sein. Kein Objekt (Event, Config, Flag) trägt globale Zustände, sondern immer einen Bezug zu seinem Server-Kontext.

## Erweiterbare, modulare Bot-Architektur

Für die Wartbarkeit und Erweiterbarkeit des Bots ist eine modulare Architektur vorgesehen. Der Code ist in Schichten bzw. Verantwortlichkeitsbereiche aufgeteilt, was die Einführung neuer Features oder das Ändern bestehender Logik erleichtert:

- **Config-Layer:** Laden, Validieren und Speichern der Konfiguration geschieht zentral (z. B. in `botConfig_v1.js`). Die Config-Schicht bietet zudem Hilfsfunktionen (etwa `getGuildConfig`), um anderen Modulen den Zugriff auf Einstellungen zu erleichtern. Dadurch ist die Konfigurationsstruktur an einer Stelle konzentriert; Änderungen an der Art und Weise, wie Config-Daten gehalten werden, müssen nur dort vorgenommen werden.
- **Command-Layer:** Jeder Bot-Befehl wird als eigenes Modul implementiert (im Verzeichnis `commands/` als einzelne Datei). Diese Module exportieren ein einheitliches Schema mit Name, Beschreibung, erforderlichen Rechten und einer Ausführungsfunktion. Der Bot lädt alle Command-Module beim Start und registriert sie, sodass neue Befehle einfach durch Hinzufügen einer weiteren Datei ergänzt werden können. Die Trennung nach Dateien stellt sicher, dass die Logik pro Command isoliert ist.
- **Event-Layer:** Analog zu den Commands sind die Discord-Event-Listener (für Events wie `ready`, `messageCreate`, `messageReactionAdd`, etc.) als separate Module im `events/` Verzeichnis abgelegt. Jeder Event-Handler kümmert sich nur um die Verarbeitung seines Discord-Ereignistyps (z. B. Nachrichten erstellen, Reaktionen hinzufügen) und ruft dabei bei Bedarf die entsprechenden Logik-Module (Scanner-Client, Event-Store, etc.) auf. Durch diese Aufteilung kann man bei Änderungen an der Event-Behandlung (z. B. zusätzlichen Events oder geändertes Verhalten) gezielt die jeweilige Datei anpassen, ohne unbeabsichtigt anderes zu beeinflussen.
- **Lib-/Service-Layer:** Wiederverwendbare Logik und Services liegen in `lib/` gekapselt. Dazu zählen z. B. der `scannerClient_v1.js` (für externe API-Aufrufe), `eventStore_v1.js` (Event-Management), `flaggedStore_v1.js` (Moderationsfall-Verwaltung), `logger_v1.js` (Logging) und `permissions_v1.js` (zentrale Rechteprüfung). Diese Module sind stateless im Sinne von Guild-Kontext – sie operieren immer auf übergebenen Daten oder dem globalen `client`-Objekt, das die Guild-spezifischen Strukturen enthält. Durch die Versionierung im Dateinamen (`_v1`, `_v2` etc.) können größere Änderungen an der Logik durch neue Module umgesetzt werden, ohne den alten Code komplett zu entfernen. Welche Version aktiv genutzt wird, bestimmt der `versions`-Block in der Config – so ist ein schrittweiser Upgrade oder Feature-Toggle möglich, was zur Erweiterbarkeit beiträgt.

Diese Architektur begünstigt Erweiterbarkeit, da neue Features meist nur das Hinzufügen neuer Module oder Befehle bedeuten, anstatt monolithischen Code zu verändern. Ebenso erleichtert sie die Guild-Isolierung, da überall dort, wo Guild-spezifische Daten benötigt werden, diese sauber aus den entsprechenden Strukturen geholt werden (z. B. via `client.config.guilds` oder `client.activeEvents` mit Guild-bezogenem Schlüssel). Der Code ist frei von hartkodierten Guild-abhängigen Pfaden; alle Guild-spezifischen Werte kommen aus der Config oder aus Laufzeit-Maps, was das Hinzufügen weiterer Server unkompliziert macht.

## Beispielablauf: Gleichzeitige Events in zwei Gilden

Zum besseren Verständnis, wie der Bot parallel in mehreren Gilden agiert, folgt ein Beispiel-Szenario mit zwei Servern (Gilde A und Gilde B), in denen jeweils ein Event gestartet und verwaltet wird:

**Event-Start in Gilde A:** Ein Moderator in Gilde A gibt den Befehl `!start 7 3 SommerEvent` in seinem Moderationskanal ein. Der Bot erkennt durch das Prefix `!`, dass es ein Command ist, und parsed den Befehl (`start`) sowie die Argumente. Über `client.commands.get('start')` wird das passende Command-Modul aufgerufen. Die Ausführungsfunktion des `event_start` Commands prüft zunächst die Berechtigungen (ist der Nutzer in Gilde A berechtigt?) und ruft dann `eventStore_v1.startEvent(client, options)` auf, wobei die Parameter aus den Arguments und dem aktuellen Channel/Guild-Kontext gebildet werden. Das Event-Store-Modul erstellt eine neue Event-Struktur vom Typ `EventData_v1` und speichert sie in `client.activeEvents` unter dem Schlüssel der Event-Channel-ID. Falls nötig, wird auch ein eigener Event-Textkanal in der Gilde angelegt (sofern der Bot dafür konfiguriert ist), in dem das Event stattfindet. Der Bot quittiert den Start z. B. mit einer Bestätigung im Channel („Event SommerEvent gestartet...“).

**Event-Start in Gilde B:** Unabhängig davon löst ein Moderator in Gilde B den gleichen Befehl aus: `!start 7 3 SommerEvent`. Auch hier verarbeitet der Bot den Command analog, allerdings mit dem Kontext von Gilde B. Die `startEvent`-Funktion legt ein zweites Event an – diesmal aber unter der Channel-ID von Gilde B’s Event-Channel. Obwohl beide Events zufällig den gleichen Namen „SommerEvent“ haben, bleiben sie strikt getrennt, da sie in unterschiedlichen Guilds laufen und in der `activeEvents`-Map durch verschiedene Schlüssel repräsentiert sind. Gilde B erhält also ein eigenes Event-Objekt mit eigener Laufzeit, eigenem Upload-Limit etc., ohne dass Gilde A davon beeinflusst wird.

**Uploads während der Events:** Nutzer in beiden Gilden laden nun z. B. Bilder in den jeweiligen Event-Kanal hoch. Jedes Mal, wenn der `messageCreate`-Event-Handler ausgelöst wird, prüft dieser: „Läuft in diesem Channel ein Event?“. Ist das der Fall, ruft der Bot den Scanner-Client auf, um die Datei zu prüfen (`scanImage`), und verarbeitet das Ergebnis (Risiko-Level, Tags usw.). Anschließend registriert er den Upload beim passenden Event mittels `eventStore_v1.registerUpload(...)`. In Gilde A wird so der Upload in das Event A eingetragen, in Gilde B in das Event B. Die Daten (z. B. die Liste der Teilnehmer oder die Anzahl Uploads pro Nutzer) werden jeweils im `EventData` der richtigen Gilde hochgezählt. Keiner der beiden Events bekommt Kenntnis vom Upload des anderen – der Bot behandelt die Vorgänge vollständig isoliert.

**Reaktionen der Moderatoren:** Moderatoren in beiden Gilden prüfen die Uploads und nutzen Reactions (👍, 👎, ⚠, ❌ etc.), um Inhalte zu bewerten oder zu moderieren. Der `messageReactionAdd`-Handler filtert zunächst den Channel: nur wenn es sich um einen relevanten (z. B. Moderations- oder Event-)Channel handelt, wird die Reaktion weiter beachtet. Dann wird je nach Emoji eine entsprechende Aktion ausgeführt – etwa fließt 👍/👎 als Bewertung in die Event-Statistik ein, ❌ löscht den Beitrag und verschiebt die zugehörige Datei ins `deleted/`-Verzeichnis, ⚠ triggert eine automatische Verwarnung per Direktnachricht. Wichtig ist: Durch den Channel-Check und die Übergabe des Guild-Kontexts an `eventStore_v1.applyReaction()` werden die Reaktionen nur auf das Event der jeweiligen Guild angewendet. Beispielsweise erhöht ein 👍 in Gilde A den Score eines Uploads im Event A, aber hat keinerlei Effekt auf Event B in Gilde B. Genauso würde ein Lösch-Emoji in Gilde B ausschließlich dort den Beitrag entfernen. Jeder Moderationsschritt bleibt lokal auf den betreffenden Server begrenzt.

**Event-Abschluss:** Nach Ablauf der konfigurierten Dauer (7 Tage in unserem Beispiel) oder auf manuellen Stopp hin (`!stop SommerEvent`), werden die Events jeweils beendet. Der Bot erkennt anhand des Guild-Kontexts, welches Event gestoppt werden soll – entweder wird der Befehl `!stop` in Gilde A oder Gilde B ausgeführt, was intern `eventStore_v1.stopEvent(client, eventName)` mit dem entsprechenden Guild Event aufruft. Das Event-Objekt wird aus `client.activeEvents` entfernt, eventuell erstellte Timer werden gelöscht, und zum Abschluss kann der Bot noch eine Zusammenfassung (Statistik) im Channel posten. Jeder Server erhält nur die Auswertung seines eigenen Events. Schließlich sind beide Gilden wieder im Ruhezustand – bereit für das nächste Event, ohne dass irgendwo persistente globale Zustände zurückbleiben, die eine Vermischung verursachen könnten.

Dieses Szenario verdeutlicht, dass der Bot durch konsequente Guild-Isolierung gleichzeitig in vielen Communities mit jeweils eigenen Veranstaltungen oder Einstellungen agieren kann. Die Verwendung von Guild-spezifischen Schlüsseln (Guild-ID, Channel-ID) und Config-Einträgen stellt sicher, dass selbst identische Befehle zur selben Zeit keine Überschneidungen zwischen den Servern erzeugen.

## Dateiorganisation und Schichtentrennung im Bot-Code

Für eine übersichtliche Organisation des Codes und die erwähnte Modularität wird das Projekt in entsprechende Ordner und Dateien gegliedert. Ein möglicher Strukturvorschlag für den Bot könnte wie folgt aussehen:

- **`index.js`** – Haupt-Einstiegspunkt des Bots. Hier wird beim Start die Konfiguration geladen, der Discord-Client initialisiert und mit globalen Properties versehen (z. B. `client.config`, `client.commands`, `client.activeEvents` etc.). Anschließend lädt `index.js` alle Command-Module aus dem `commands/` Verzeichnis und alle Event-Module aus `events/` und registriert sie, bevor der Bot via `client.login()` gestartet wird. `index.js` enthält keine Fachlogik, sondern nur das Bootstrapping/Verkabeln der Komponenten.
- **`commands/`** – Verzeichnis für Befehls-Module. Jede Datei hier definiert einen Command (siehe Command-Layer oben), z. B. `event_start_v1.js`, `event_stop_v1.js`, `event_stats_v1.js`, `event_zip_v1.js` für Event-bezogene Befehle sowie Konfigurationsbefehle wie `setscan_v1.js` (zum Ändern der Scan-Schwellenwerte) oder `filter_v1.js` (zum Verwalten von Filter-Taglisten). Durch die Namenskonvention mit Suffix `_v1` ist erkennbar, dass es sich um die erste Implementierungsversion handelt – zukünftige Versionen könnten als `_v2` parallel abgelegt werden. Alle Command-Module werden beim Start in eine Collection `client.commands` geladen, sodass der Bot im Betrieb dynamisch auf `client.commands.get(<name>)` zugreift, wenn ein Befehl erkannt wird.
- **`events/`** – Verzeichnis für Event-Handler-Module. Hier liegen z. B. `ready_v1.js` (wird einmal beim erfolgreichen Verbindungsaufbau ausgeführt), `messageCreate_v1.js` (für neue Nachrichten), `messageReactionAdd_v1.js` und `messageReactionRemove_v1.js` (für Hinzufügen/Entfernen von Reactions). Jeder dieser Handler ist verantwortlich für einen Discord-Eventtyp und nutzt bei Bedarf die Lib-Module, um die eigentliche Fachlogik auszuführen (z. B. Aufruf von `eventStore_v1.registerUpload` in `messageCreate`, oder `permissions_v1.canUseCommand` im Command-Parser). Die Trennung in einzelne Dateien pro Eventtyp verbessert die Übersichtlichkeit und macht deutlich, welche Logik bei welchem Discord-Ereignis abläuft. Zudem kann man so eventspezifische Änderungen unabhängig von anderen Events vornehmen.
- **`lib/`** – Verzeichnis für wiederverwendbare Kernmodule. Darin befinden sich u. a.: `botConfig_v1.js` (lädt und speichert die JSON-Config und stellt Hilfsfunktionen wie `getGuildConfig` bereit), `scannerClient_v1.js` (kapselt die Kommunikation mit dem externen Scanner-Dienst: Token holen, Bild scannen etc.), `eventStore_v1.js` (enthält die Logik zur Eventverwaltung – Start/Stop von Events, Registrierung von Uploads, Verarbeitung von Reaktionen – und hält die Event-Datenstruktur bereit), `flaggedStore_v1.js` (verwaltet persistente Daten zu geflaggten Inhalten, z. B. Laden/Speichern einer Liste von Moderationsfällen), `permissions_v1.js` (implementiert die zentralen Berechtigungsprüfungen: Owner/Admin/Mod-Role Checks) und `logger_v1.js` (vereinheitlicht Logging-Funktionen). Diese Lib-Module sind weitgehend unabhängig von Discord-spezifischen Details und könnten theoretisch auch außerhalb eines Discord-Bots wiederverwendet werden. Sie arbeiten mit den Datenstrukturen (`Config`, `activeEvents` etc.), die vom Bot bereitgestellt werden.
- **`config/`** – Enthält Konfigurationsdateien, vor allem die `bot-config.json`. In einer produktiven Umgebung könnte man hier auch unterschiedliche Configs für verschiedene Deployments ablegen.
- **`logs/`** – Enthält Logfiles (z. B. `bot.log` für Laufzeit-Logs) sowie ggf. weitere Protokoll-Dateien, etwa separate Event-Statistiken oder Fehleraufzeichnungen.

Diese vorgeschlagene Dateiorganisation unterstützt die Gildenisolierung, indem sie klare Schnittstellen zwischen den Teilen schafft. Der Config-Layer liefert pro Guild die Einstellungen, der Command/Event-Layer greift für jede Guild auf diese Einstellungen und Datenstrukturen zu, und im Lib-Layer wird die eigentliche Verarbeitung durchgeführt, ohne feste Annahmen über Guild-spezifische Inhalte. Neue Gilden hinzuzufügen erfordert keine Code-Änderung – es genügt, die `bot-config.json` um den entsprechenden Eintrag zu erweitern und den Bot neu zu starten. Ebenso können neue Commands oder Events hinzugefügt werden, ohne das Grundgerüst zu verändern, was den Bot langfristig modular erweiterbar macht.

## Fazit

Durch eine durchdachte modulare Architektur mit sauber getrennten Gilden-Konfigurationen, eigenständiger Event-Verwaltung je Server und rollenbasierter Rechteprüfung gelingt es, einen Discord-Bot zu implementieren, der beliebig viele Server parallel bedienen kann. Jeder Server kann eigene Einstellungen und Abläufe definieren, ohne dass globale Bot-Einstellungen oder andere Server davon beeinträchtigt werden. Diese Isolation, kombiniert mit klaren Strukturen im Code, ermöglicht eine wartbare und skalierbare Bot-Entwicklung – ein entscheidender Vorteil, wenn der Bot in einer wachsenden Zahl von Communities zum Einsatz kommt.
