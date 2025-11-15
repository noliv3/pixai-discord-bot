# scanner_api.py
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import cgi, json, logging, asyncio, mimetypes, socket
from urllib.parse import parse_qs, urlparse
from io import BytesIO

from main import ModuleManager
from modules import (
    image_storage,
    nsfw_scanner,
    statistics,
    tagging,
    deepdanbooru_tags,
)
import token_manager
from gif_batch import scan_batch

logging.basicConfig(
    filename="scanner.log",
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s: %(message)s",
)
logger = logging.getLogger(__name__)
manager = ModuleManager()

MAX_IMAGE_SIZE = 10 * 1024 * 1024
MAX_BATCH_SIZE = 25 * 1024 * 1024


def _is_valid_image(data: bytes) -> bool:
    try:
        from PIL import Image
        with Image.open(BytesIO(data)) as img:
            img.verify()
        return True
    except Exception:
        return False


def process_image(image_bytes: bytes) -> dict:
    try:
        results = {}
        try:
            nsfw_result = nsfw_scanner.process_image(image_bytes)
        except Exception as e:
            nsfw_result = {"error": str(e)}
        results["modules.nsfw_scanner"] = nsfw_result

        try:
            tag_result = tagging.process_image(image_bytes)
        except Exception as e:
            tag_result = {"error": str(e)}
        results["modules.tagging"] = tag_result
        tags = [t.get("label") for t in tag_result.get("tags", []) if isinstance(t, dict)]

        try:
            ddb_result = deepdanbooru_tags.process_image(image_bytes)
        except Exception as e:
            ddb_result = {"error": str(e)}
        results["modules.deepdanbooru_tags"] = ddb_result
        ddb_tags = [t.get("label") for t in ddb_result.get("tags", []) if isinstance(t, dict)]

        all_labels = tags + ddb_tags
        try:
            statistics.record_tags(all_labels)
            results["modules.statistics"] = {"recorded": len(all_labels)}
        except Exception as e:
            results["modules.statistics"] = {"error": str(e)}

        try:
            storage_result = image_storage.process_image(
                image_bytes,
                tags=tag_result.get("tags"),
                nsfw_meta=nsfw_result,
                danbooru_tags=ddb_result.get("tags"),
            )
        except Exception as e:
            storage_result = {"error": str(e)}
        results["modules.image_storage"] = storage_result

        skip = {
            "modules.nsfw_scanner",
            "modules.tagging",
            "modules.deepdanbooru_tags",
            "modules.image_storage",
            "modules.statistics",
        }
        for name, mod in manager.get_modules().items():
            if name in skip or not hasattr(mod, "process_image"):
                continue
            try:
                results[name] = mod.process_image(image_bytes)
            except Exception as e:
                results[name] = {"error": str(e)}
                logger.exception("Module %s failed", name)

        return results
    except Exception as e:
        logger.exception("process_image failed")
        return {"error": str(e)}


class ScannerHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    # ---------- helpers ----------
    def _send_bytes(self, code: int, body: bytes, ctype: str):
        try:
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Connection", "close")
            self.end_headers()
            if body:
                self.wfile.write(body)
            self.wfile.flush()
        except Exception:
            pass
        finally:
            # Stelle sicher, dass HTTP/1.1 nicht auf keep-alive bleibt
            self.close_connection = True

    def _send_json(self, code: int, payload: dict):
        self._send_bytes(code, json.dumps(payload).encode(), "application/json")

    def _send_text(self, code: int, text: str):
        self._send_bytes(code, text.encode(), "text/plain; charset=utf-8")

    def _log_raw_request(self, note: str):
        peer = self.client_address
        try:
            peek = self.request.recv(4096, socket.MSG_PEEK)
            with open("raw_connections.log", "a", encoding="utf-8", errors="replace") as f:
                f.write(f"\n[Fehlversuch] {peer} → {note}\n")
                try:
                    f.write(peek.decode(errors='replace') + "\n")
                except Exception:
                    f.write("<nicht decodierbar>\n")
        except Exception:
            pass

    def _validate_token(self) -> bool:
        tok = self.headers.get("Authorization")
        if not tok or not token_manager.is_valid_token(tok):
            self._log_raw_request("Token ungültig oder fehlt")
            self._send_json(403, {"error": "forbidden"})
            return False
        return True

    # ---------- HTTP methods ----------
    def do_GET(self):
        try:
            if self.path.startswith("/token"):
                parsed = urlparse(self.path)
                email = parse_qs(parsed.query).get("email", [None])[0]
                renew = "renew" in parsed.query
                if not email:
                    self._send_json(400, {"error": "missing email"})
                    return
                token = token_manager.get_token(email, renew=renew)
                # wichtig: Länge setzen + flush
                self._send_text(200, token)
                return

            if self.path == "/stats":
                if not self._validate_token():
                    return
                stats = statistics.get_statistics()
                self._send_json(200, stats)
                return

            self._send_json(404, {"error": "not found"})
        except Exception as e:
            logger.exception("GET failed")
            self._send_json(500, {"error": str(e)})

    def do_POST(self):
        try:
            content_type = self.headers.get("Content-Type", "")
            if "multipart/form-data" not in content_type:
                self._log_raw_request("Ungültiger Content-Type")
                self._send_json(403, {"error": "invalid content-type"})
                return

            if self.path == "/check":
                self._handle_check()
                return
            if self.path == "/batch":
                asyncio.run(self._handle_batch())
                return

            self._log_raw_request(f"Ungültiger POST-Pfad: {self.path}")
            self._send_json(403, {"error": "invalid path"})
        except Exception as e:
            logger.exception("POST failed")
            self._send_json(500, {"error": str(e)})

    # ---------- endpoints ----------
    def _handle_check(self):
        if not self._validate_token():
            return
        form = self._parse_multipart()
        file_item = form["image"] if form and "image" in form else None
        if file_item is None or getattr(file_item, "file", None) is None:
            self._log_raw_request("Image fehlt oder multipart defekt")
            self._send_json(400, {"error": "image missing"})
            return

        buf = file_item.file.read()
        if len(buf) > MAX_IMAGE_SIZE:
            self._send_json(413, {"error": "payload too large"})
            return
        if not _is_valid_image(buf):
            self._send_json(400, {"error": "invalid image"})
            return

        result = process_image(buf)
        self._send_json(200, result)

    async def _handle_batch(self):
        if not self._validate_token():
            return
        if "multipart/form-data" not in self.headers.get("Content-Type", ""):
            self._send_json(400, {"error": "invalid content-type"})
            return

        form = self._parse_multipart()
        item = form["file"] if form and "file" in form else None
        if item is None or getattr(item, "file", None) is None:
            self._log_raw_request("Batch-Datei fehlt oder multipart kaputt")
            self._send_json(400, {"error": "file missing"})
            return

        raw = item.file.read()
        if len(raw) > MAX_BATCH_SIZE:
            self._send_json(413, {"error": "payload too large"})
            return

        mime = item.type or mimetypes.guess_type(item.filename or "")[0] or ""
        try:
            result = await scan_batch(raw, mime)
            self._send_json(200, result)
        except Exception as e:
            logger.exception("batch failed")
            self._send_json(500, {"error": str(e)})

    # ---------- utils ----------
    def _parse_multipart(self):
        try:
            return cgi.FieldStorage(
                fp=self.rfile,
                headers=self.headers,
                environ={
                    "REQUEST_METHOD": "POST",
                    "CONTENT_TYPE": self.headers.get("Content-Type"),
                },
            )
        except Exception:
            logger.exception("multipart parse failed")
            self._log_raw_request("Multipart parse exception")
            return None

    def log_message(self, *a):
        return


def run(port: int = 8000):
    class SafeServer(ThreadingHTTPServer):
        def handle_error(self, request, client_address):
            with open("raw_connections.log", "a", encoding="utf-8") as f:
                f.write(f"[Verbindungsfehler] {client_address}\n")

    SafeServer.allow_reuse_address = True
    SafeServer(("", port), ScannerHandler).serve_forever()


if __name__ == "__main__":
    run()
