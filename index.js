import { Telegraf } from 'telegraf';
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const ALLOWED_USER_ID = process.env.ALLOWED_USER_ID;

if (!BOT_TOKEN || !ALLOWED_USER_ID) {
  console.error('❌ Error: BOT_TOKEN and ALLOWED_USER_ID must be set in .env file');
  console.error('👉 Copy .env.example to .env and fill in your values');
  process.exit(1);
}

const NOTES_FILE = path.join(__dirname, 'notes.md');
const ATTACHMENTS_DIR = path.join(__dirname, 'attachments');

// Create attachments directory if it doesn't exist
if (!fs.existsSync(ATTACHMENTS_DIR)) {
  fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });
  console.log('📁 Created attachments directory');
}

const bot = new Telegraf(BOT_TOKEN);

// Helper function to format timestamp
function getTimestamp() {
  const now = new Date();
  return now.toISOString().replace('T', ' ').substring(0, 19);
}

// Helper function to download file from Telegram
async function downloadFile(fileId, fileName) {
  try {
    const fileLink = await bot.telegram.getFileLink(fileId);
    const filePath = path.join(ATTACHMENTS_DIR, fileName);

    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(filePath);

      https.get(fileLink.href, (response) => {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log(`  💾 Saved: ${fileName}`);
          resolve(fileName);
        });
      }).on('error', (err) => {
        fs.unlink(filePath, () => {});
        reject(err);
      });
    });
  } catch (error) {
    console.error(`  ❌ Failed to download ${fileName}:`, error.message);
    return null;
  }
}

// Helper function to append to notes.md
function appendToNotes(content) {
  try {
    fs.appendFileSync(NOTES_FILE, content + '\n', 'utf8');
  } catch (error) {
    console.error('❌ Error writing to notes.md:', error.message);
  }
}

// Helper function to generate unique filename
function generateFileName(originalName, extension) {
  const timestamp = Date.now();
  const sanitized = originalName ? originalName.replace(/[^a-z0-9]/gi, '_') : 'file';
  return `${timestamp}_${sanitized}${extension}`;
}

// Main message handler
bot.on('message', async (ctx) => {
  const userId = ctx.from.id.toString();

  // Security: Only accept messages from allowed user
  if (userId !== ALLOWED_USER_ID) {
    console.log(`🚫 Rejected message from unauthorized user: ${userId}`);
    return;
  }

  console.log('\n📨 Processing message...');

  const message = ctx.message;
  const timestamp = getTimestamp();

  // Build markdown content
  let markdownContent = '\n---\n';
  markdownContent += `## ${timestamp}`;

  // Add forwarded info if available
  if (message.forward_from) {
    const forwardedFrom = message.forward_from.username
      ? `@${message.forward_from.username}`
      : message.forward_from.first_name;
    markdownContent += ` - Forwarded from ${forwardedFrom}`;
  } else if (message.forward_from_chat) {
    markdownContent += ` - Forwarded from ${message.forward_from_chat.title}`;
  } else if (message.forward_sender_name) {
    markdownContent += ` - Forwarded from ${message.forward_sender_name}`;
  }

  markdownContent += '\n\n';

  // Add text content
  if (message.text) {
    markdownContent += message.text + '\n';
    console.log(`  📝 Text: ${message.text.substring(0, 50)}${message.text.length > 50 ? '...' : ''}`);
  } else if (message.caption) {
    markdownContent += message.caption + '\n';
    console.log(`  📝 Caption: ${message.caption.substring(0, 50)}${message.caption.length > 50 ? '...' : ''}`);
  }

  // Handle attachments
  const attachments = [];

  // Photos
  if (message.photo && message.photo.length > 0) {
    const photo = message.photo[message.photo.length - 1]; // Get highest resolution
    const fileName = generateFileName('photo', '.jpg');
    const saved = await downloadFile(photo.file_id, fileName);
    if (saved) {
      attachments.push({ name: saved, type: 'Photo' });
    }
  }

  // Documents
  if (message.document) {
    const doc = message.document;
    const extension = doc.file_name ? path.extname(doc.file_name) : '';
    const baseName = doc.file_name ? path.basename(doc.file_name, extension) : 'document';
    const fileName = generateFileName(baseName, extension);
    const saved = await downloadFile(doc.file_id, fileName);
    if (saved) {
      attachments.push({ name: saved, type: 'Document', originalName: doc.file_name });
    }
  }

  // Videos
  if (message.video) {
    const video = message.video;
    const fileName = generateFileName('video', '.mp4');
    const saved = await downloadFile(video.file_id, fileName);
    if (saved) {
      attachments.push({ name: saved, type: 'Video' });
    }
  }

  // Audio
  if (message.audio) {
    const audio = message.audio;
    const extension = audio.file_name ? path.extname(audio.file_name) : '.mp3';
    const baseName = audio.file_name ? path.basename(audio.file_name, extension) : 'audio';
    const fileName = generateFileName(baseName, extension);
    const saved = await downloadFile(audio.file_id, fileName);
    if (saved) {
      attachments.push({ name: saved, type: 'Audio', originalName: audio.file_name });
    }
  }

  // Voice
  if (message.voice) {
    const fileName = generateFileName('voice', '.ogg');
    const saved = await downloadFile(message.voice.file_id, fileName);
    if (saved) {
      attachments.push({ name: saved, type: 'Voice' });
    }
  }

  // Video notes (round videos)
  if (message.video_note) {
    const fileName = generateFileName('video_note', '.mp4');
    const saved = await downloadFile(message.video_note.file_id, fileName);
    if (saved) {
      attachments.push({ name: saved, type: 'Video Note' });
    }
  }

  // Add attachments to markdown
  if (attachments.length > 0) {
    markdownContent += '\n**Attachments:**\n';
    for (const att of attachments) {
      const displayName = att.originalName || att.name;
      markdownContent += `- [${displayName}](./attachments/${att.name}) _(${att.type})_\n`;
    }
  }

  markdownContent += '\n---\n';

  // Append to notes file
  appendToNotes(markdownContent);

  console.log(`✅ Saved to notes.md`);

  // Send confirmation (optional - comment out if you don't want confirmation messages)
  await ctx.reply('✅ Saved to notes!');
});

// Error handling
bot.catch((err, ctx) => {
  console.error('❌ Bot error:', err);
});

// Start bot
bot.launch()
  .then(() => {
    console.log('\n🤖 Telegram Note Bot is running!');
    console.log(`📝 Notes will be saved to: ${NOTES_FILE}`);
    console.log(`📁 Attachments will be saved to: ${ATTACHMENTS_DIR}`);
    console.log(`👤 Only accepting messages from user ID: ${ALLOWED_USER_ID}`);
    console.log('\n💡 Press Ctrl+C to stop\n');
  })
  .catch((error) => {
    console.error('❌ Failed to start bot:', error);
    process.exit(1);
  });

// Enable graceful stop
process.once('SIGINT', () => {
  console.log('\n\n👋 Stopping bot...');
  bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
  console.log('\n\n👋 Stopping bot...');
  bot.stop('SIGTERM');
});
