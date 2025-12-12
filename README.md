# Telegram Note Bot

A local Telegram bot that captures forwarded messages and saves them to a markdown file with attachment support. Perfect for collecting ideas, tasks, and content from Telegram to feed into LLMs like Claude Code.

## Features

- ✅ Accepts only messages from your Telegram user ID (security)
- ✅ Saves all messages to a single `notes.md` file
- ✅ Handles attachments (photos, documents, videos, audio, voice messages)
- ✅ Preserves forwarded message metadata
- ✅ Timestamps each entry
- ✅ Clean markdown format for LLM processing

## Setup

### 1. Create a Telegram Bot

1. Open Telegram and search for [@BotFather](https://t.me/BotFather)
2. Send `/newbot` command
3. Follow the instructions to create your bot
4. Copy the **Bot Token** you receive (looks like `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

### 2. Get Your Telegram User ID

1. Search for [@userinfobot](https://t.me/userinfobot) in Telegram
2. Send any message to the bot
3. Copy your **User ID** (a number like `123456789`)

### 3. Configure the Bot

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your values:
   ```
   BOT_TOKEN=your_bot_token_from_botfather
   ALLOWED_USER_ID=your_user_id_from_userinfobot
   ```

### 4. Install Dependencies

```bash
pnpm install
```

### 5. Start the Bot

```bash
pnpm start
```

Or for development with auto-reload:
```bash
pnpm dev
```

## Usage

1. Start the bot with `pnpm start`
2. Open Telegram and find your bot (by the username you created)
3. Send a message or forward any message to your bot
4. The bot will save it to `notes.md` in the project directory

### Message Format

Messages are saved in markdown format:

```markdown
---
## 2025-12-13 15:30:45 - Forwarded from @username

This is the message text.

**Attachments:**
- [photo.jpg](./attachments/1702479045_photo.jpg) _(Photo)_
- [document.pdf](./attachments/1702479046_document.pdf) _(Document)_

---
```

## Project Structure

```
telegram-note-bot/
├── index.js           # Main bot server
├── package.json       # Dependencies
├── .env              # Your configuration (not committed)
├── .env.example      # Configuration template
├── notes.md          # Output file (created automatically)
└── attachments/      # Downloaded files (created automatically)
```

## Security

- The bot only accepts messages from your Telegram user ID
- All other messages are silently rejected
- Your bot token and user ID are stored in `.env` (not committed to git)

## Notes

- The bot must be running to receive messages
- `notes.md` is appended to, never overwritten
- Attachments are saved with timestamps to avoid conflicts
- The bot sends a confirmation message when saving (you can disable this in code)

## Troubleshooting

**Bot doesn't respond:**
- Check that your bot token is correct
- Make sure the bot is running (`npm start`)
- Verify you sent a message to the correct bot

**Messages aren't saved:**
- Check console output for errors
- Verify your user ID is correct in `.env`
- Ensure you have write permissions in the directory

**File size errors:**
- Telegram bots have a 20MB file download limit
- Large files will fail to download

## Feeding to Claude Code

Once you've collected messages in `notes.md`, you can feed them to Claude Code for task generation:

```bash
# In Claude Code
cat notes.md
# Then ask Claude to create tasks based on the content
```

## License

MIT
