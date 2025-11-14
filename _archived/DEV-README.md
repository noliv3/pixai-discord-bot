# PIXAI DISCORD NSFW BOT – DEVELOPER GUIDE

This document explains how to install, configure, and extend the PixAI NSFW moderation bot.

────────────────────────────────────────────
🧱 PROJECT STRUCTURE

./index.js                → Entry point  
./commands/               → All bot commands (e.g. !start, !stop, !zip)  
./events/                 → Discord event listeners (messages, reactions)  
./lib/                    → Core logic: scan, filter, cache, stats, etc.  
./config/ftp.json         → FTP export settings (optional)  
./scanner-config.json     → Main scan config (local only)  
./scanner-filters.json    → Filter levels for tags (editable by Mods)  
./event_files/            → Stored uploads per event (ignored in Git)  
./logs/invalid_urls.log   → Broken links are logged here  
token.json                → Your Discord bot token (DO NOT COMMIT)

────────────────────────────────────────────
🛠️ INSTALLATION

1. Install Node.js v18+  
2. Clone the repository and run:

```bash
npm install
```

3. Create `scanner-config.json`  
   Copy from `scanner-config.example.json` and edit:

```json
{
  "scannerApiUrl": "http://localhost:8000/check",
  "authHeader": "YOUR_API_TOKEN",
  "flagThreshold": 0.5,
  "deleteThreshold": 0.9,
  "moderatorRoleId": "DISCORD_ROLE_ID",
  "moderatorChannelId": "MOD_CHANNEL_ID",
  "rulesChannelId": "RULES_CHANNEL_ID",
  "gifStep": 5,
  "videoStep": 20,
  "tagFilters": {
    "0": ["cp", "loli", "rape", "shota"],
    "1": ["sex", "pussy", "nipples"],
    "2": ["underwear", "cameltoe"],
    "3": ["smile", "flower"]
  }
}
```

4. Create `token.json`:

```json
{
  "token": "YOUR_DISCORD_BOT_TOKEN"
}
```

5. Optional: create `config/ftp.json` for ZIP export via FTP.

────────────────────────────────────────────
🚀 RUNNING THE BOT

Start the bot with:

```bash
node index.js
```

Make sure `client.activeEvents = new Map();` exists in `index.js`.

────────────────────────────────────────────
📽 VIDEO & GIF SCANNING

The bot can scan uploaded videos and GIFs frame-by-frame using `ffmpeg`.

It extracts key frames (first, last, and configurable intervals) and sends them to the scanner API like images.

### Frame sampling configuration:

```json
"gifStep": 5,        // scans every 5th frame in GIFs
"videoStep": 20      // scans every 20th frame in videos
```

These values can be adjusted live in `scanner-config.json`.

────────────────────────────────────────────
⚙️ FFMPEG DEPENDENCY

Frame extraction requires `ffmpeg` and `ffprobe`.

### Windows:

- Download FFmpeg and extract to `./ffmpeg/bin/`
- Expected files:
  - `./ffmpeg/bin/ffmpeg.exe`
  - `./ffmpeg/bin/ffprobe.exe`

### Linux / macOS:

Install system-wide:

```bash
sudo apt install ffmpeg     # Debian/Ubuntu
brew install ffmpeg         # macOS (Homebrew)
```

────────────────────────────────────────────
🧹 EXTENDING THE BOT

➤ Commands:

- Add a new `.js` file to `/commands/`
- Export `{ name, async execute(message, client, args) }`

Example:

```js
module.exports = {
  name: 'hello',
  async execute(message, client, args) {
    message.reply('Hello!');
  }
};
```

➤ Events:

- Add `.js` file to `/events/`
- Export `{ name, once?, async execute(..., client) }`

────────────────────────────────────────────
🧠 SCAN LOGIC (OVERVIEW)

- All images and videos are scanned in `lib/handleMessageCreate.js`
- Images → `scanImage()`  
- Video/GIFs → `handleVideoScan()` → `ffmpeg` extracts → `scanBuffer()`
- Tags are extracted → matched via `scannerFilter.js`
- Cache prevents duplicate scans

────────────────────────────────────────────
🧪 TROUBLESHOOTING

❌ No scan triggered after upload?  
→ Make sure `client.activeEvents` exists  
→ Ensure you ran `!start` to activate the channel

📛 Always getting “Scan failed” or 400?  
→ Check if your scanner API is reachable at `scannerApiUrl`  
→ Make sure `authHeader` and `multipartField` match your scanner’s config  
→ Try scanning with static `scanImage()` to verify

🔇 No frame scan logs shown?  
→ Ensure ffmpeg path is correct  
→ Logs are printed from `videoFrameExtractor.js` and `handleVideoScan.js`

────────────────────────────────────────────
🔒 SECURITY NOTES

Never commit these files:

- `token.json`
- `scanner-config.json`
- `ftp.json`

Your `.gitignore` should already exclude these.

────────────────────────────────────────────
📜 LICENSE

MIT – see LICENSE
