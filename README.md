# PIXAI DISCORD NSFW BOT – MODERATOR GUIDE

An automated Discord bot for moderating image content. It detects NSFW content and critical tags using a local AI API. Moderators can evaluate flagged content via emoji reactions.

────────────────────────────────────────────
🔍 FEATURES

- Automatic scanning of all images and links
- Risk evaluation via API (Risk Score + Tags)
- Moderator alerts for suspicious content
- Moderation via emoji: 👍 👎 ❌ ⚠️
- Event system for image competitions
- ZIP export of top-rated images
- Logging of all invalid URLs

────────────────────────────────────────────
🚨 FILTER LEVELS (TAG FILTERING)

Level 0: Immediate deletion (e.g. `cp`, `loli`, `rape`, `sex`)  
Level 1–2: Flags for moderator review (e.g. `nipples`, `blood`, `underwear`)  
Level 3: Considered safe (e.g. `smile`, `flower`)

Filter levels are defined in `scanner-filters.json`.  
They can be edited live using: `!filter <level> +tag` or `-tag` (Mods only)

────────────────────────────────────────────
🗳️ MODERATION VIA EMOJI

👎  → Reject (no action)  
👍  → Accept (no action)  
     If you see 8 Accepts and 2 Rejects, think of it like a small vote.  
     You can add your opinion to the overall moderation picture.

❌  → Delete original message in the channel  

⚠️  → Send **automated DM warning** to the user  
     The first moderator to click ⚠️ will be mentioned in the message.

     DM example:
     > Hello USER, your image violates the Discord server guidelines.  
       > You were warned by moderator: XXX
       > [Link to the server rules]

Set the rules channel ID in `scanner-config.json` using `rulesChannelId`.

────────────────────────────────────────────
📦 EVENT SYSTEM

Start: `!start <name> <duration_h> <max_uploads>`  
Stop: `!stop`  
Extend: `!extend <name> ±h`  
Stats: `!eventstats`  
ZIP export: `!zip <eventname> [topX]`  

Image filenames reflect score and origin:  
`eventname_userid_msgid_rate3_TIMESTAMP.jpg`

────────────────────────────────────────────
📌 IMPORTANT COMMANDS

!start            → Start a new event  
!stop             → Stop event and finalize results  
!extend           → Adjust event duration  
!zip              → Export event images  
!eventstats       → List all running events  
!filter 0 +tag    → Add tag to filter level  
!filter 1 -tag    → Remove tag from filter  
!setscan X Y      → Set scan thresholds (Owner/Admin only)

────────────────────────────────────────────
ℹ️ NOTES

- All images are stored in `event_files/`
- Invalid image links are logged in `logs/invalid_urls.log`

────────────────────────────────────────────
🔒 LICENSE

MIT – see LICENSE
