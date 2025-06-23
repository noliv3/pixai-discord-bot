# EVENT SYSTEM – INTERNAL STRUCTURE AND LIFECYCLE (`agents.md`)

This document explains how the PixAI Discord bot manages image-based events (e.g. competitions or challenges), including runtime storage, structure, voting logic, and how submissions are tracked internally.

────────────────────────────────────────────
📌 PURPOSE

The bot supports time-limited image events where users can upload content and receive reactions (votes). These events are managed entirely in memory and stored under:

```js
client.activeEvents = Map<string, EventData>
```

- Key = Discord channel ID  
- Value = full event metadata and file tracking  
- One event per channel at a time

────────────────────────────────────────────
📦 EVENT STRUCTURE (`EventData`)

Each active event is represented as an object with the following properties:

```js
{
  name: string,                     // Internal event name (e.g. "spring2025")
  start_time: number,              // Start timestamp (ms)
  end_time: number,                // End timestamp (ms)
  folder: string,                  // Local folder in /event_files/
  entries: Array<{
    messageId: string,
    userId: string,
    filename: string,
    reactionUsers: Set<string>     // IDs of users who have voted on this image
  }>,
  users: Set<string>,              // Unique user IDs with submissions
  reactions: Map<string, unknown>, // Reserved for future use (e.g. live stats)
  remainingTimeout: Timeout,       // Scheduled auto-end (via setTimeout)
  channel_id: string,              // Redundant channel reference
  max_entries: number              // Upload limit per user
}
```

────────────────────────────────────────────
⏱️ EVENT LIFECYCLE

✅ !start  
- Starts an event in the current or newly created channel  
- Allocates internal memory structure  
- Creates a local folder under `/event_files/<name>/`  
- Starts timeout for automatic event end

📥 Uploads  
- Detected in `messageCreate.js`  
- Bot stores image, assigns filename  
- Adds entry to `entries[]` and tracks submitting user

🗳 Reactions  
- Handled in `messageReactionAdd.js`  
- Each valid reaction increases the rating  
- The filename is updated to reflect current vote score (`rateX`)

🗑 Reaction Removed  
- Handled in `messageReactionRemove.js`  
- Updates the stored vote count and filename

⏹️ !stop or timeout  
- Timer is cleared  
- Event data is summarized via `createStatsJson()`  
- Event is removed from `client.activeEvents`

────────────────────────────────────────────
📝 FILENAME FORMAT

Example:  
`springevent_8247291902_1203982020192_rate3_1687369182098.jpg`

Meaning:  
- `springevent` = event name  
- `8247...` = user ID  
- `1203...` = message ID  
- `rate3` = number of reactions  
- `1687...` = timestamp

This structure makes filenames self-explanatory and sortable.

────────────────────────────────────────────
🛠 MODERATOR COMMANDS

!start <name> <duration> <max>   → Start a new image event  
!extend <name> ±h                → Extend or shorten the event  
!stop                            → End the event immediately  
!eventstats                      → Show currently active events  
!zip <event> [topX]              → Export best submissions into a ZIP

────────────────────────────────────────────
🔐 SECURITY AND DESIGN

- No database: events exist only in memory (RAM)  
- All uploads are stored as files in `/event_files/`  
- Filenames track votes and ownership  
- Only the bot modifies `client.activeEvents`  
- Moderators require proper permissions to run commands  
⚠️ Warning: Events are lost when the bot restarts. Consider persistent storage for production environments.

────────────────────────────────────────────
📤 POTENTIAL EXTENSIONS

- Store event history as JSON archive  
- Auto-publish winners to a channel  
- Allow voting in multiple categories (e.g. art, creativity)  
- Build admin web interface to manage events

────────────────────────────────────────────
✅ END
