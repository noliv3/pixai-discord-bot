# gif_batch.py
import asyncio, subprocess, tempfile, uuid, os, shutil, mimetypes
from pathlib import Path
from modules import nsfw_scanner, tagging, deepdanbooru_tags

GIF_STEP   = 5
VIDEO_STEP = 20
MAX_OUT_FRAMES = 60                     # hard cap für ffmpeg
FFMPEG = Path(
    os.getenv(
        "FFMPEG_BIN",
        Path(__file__).parent / "ffmpeg" / "bin" /
        ("ffmpeg.exe" if os.name == "nt" else "ffmpeg")
    )
)

# ───────── Frame-Extraktion ─────────
def _extract_frames(src: Path) -> tuple[list[Path], Path]:
    out_dir = Path(tempfile.mkdtemp())
    cmd = [
        str(FFMPEG), "-hide_banner", "-loglevel", "error",
        "-i", str(src),
        "-vframes", str(MAX_OUT_FRAMES),        # ⟵ hart limitieren
        f"{out_dir}/frame_%05d.png",
    ]
    subprocess.run(cmd, check=True)
    return sorted(out_dir.glob("frame_*.png")), out_dir

def _sample_indices(total: int, step: int) -> list[int]:
    idx = {0, total - 1} | set(range(0, total, step))
    return sorted(i for i in idx if i < total)

def _risk_from(nsfw_res, ddb_res) -> float:
    if not isinstance(nsfw_res, dict):
        return 0.0
    base = max(nsfw_res.get(k, 0.0) for k in ("hentai", "porn", "sexy"))
    if isinstance(ddb_res, list):
        if any(isinstance(t, dict) and t.get("label") == "rating:explicit"      for t in ddb_res):
            base = max(base, 1.0)
        if any(isinstance(t, dict) and t.get("label") == "rating:questionable" for t in ddb_res):
            base = max(base, 0.7)
    return round(base, 3)

# ───────── Haupt-Batch-Scan ─────────
async def scan_batch(buf: bytes, mime: str = "") -> dict:
    tmp = Path(tempfile.gettempdir()) / f"batch_{uuid.uuid4()}.bin"
    tmp.write_bytes(buf)

    frames, tmp_dir = _extract_frames(tmp)
    total = len(frames)
    if total == 0:
        shutil.rmtree(tmp_dir, ignore_errors=True); tmp.unlink(missing_ok=True)
        return {"risk": 0.0, "tags": [], "frameCount": 0}

    step   = VIDEO_STEP if ("video" in mime and "gif" not in mime) else GIF_STEP
    sample = [frames[i] for i in _sample_indices(total, step)]

    loop      = asyncio.get_running_loop()
    max_risk  = 0.0
    tag_union = set()

    async def _scan(p: Path):
        data = p.read_bytes()
        nsfw = await loop.run_in_executor(None, nsfw_scanner.process_image,      data)
        tag  = await loop.run_in_executor(None, tagging.process_image,           data)
        ddb  = await loop.run_in_executor(None, deepdanbooru_tags.process_image, data)
        return nsfw, tag, ddb

    for nsfw_res, tag_res, ddb_res in await asyncio.gather(*[_scan(f) for f in sample]):
        max_risk = max(max_risk, _risk_from(nsfw_res, ddb_res))

        for mod_res in (tag_res, ddb_res):
            if not isinstance(mod_res, dict):  # Fehlerfall
                continue
            for t in mod_res.get("tags", []):
                if isinstance(t, dict) and "label" in t:
                    tag_union.add(t["label"])

        if max_risk >= 1.0:          # Early-Exit wenn sicher NSFW
            break

    shutil.rmtree(tmp_dir, ignore_errors=True)
    tmp.unlink(missing_ok=True)

    return {
        "risk": max_risk,
        "tags": sorted(tag_union)[:200],
        "frameCount": total
    }
