import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from 'dotenv';
import { Context, Telegraf } from 'telegraf';
import type { Update } from 'telegraf/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const ALLOWED_USER_ID = process.env.ALLOWED_USER_ID;

if (!BOT_TOKEN || !ALLOWED_USER_ID) {
  console.error('❌ Error: BOT_TOKEN and ALLOWED_USER_ID must be set in .env file');
  console.error('👉 Copy .env.example to .env and fill in your values');
  process.exit(1);
}

const NOTES_DIR = path.join(PROJECT_ROOT, 'notes');
const ATTACHMENTS_DIR = path.join(PROJECT_ROOT, 'attachments');

if (!fs.existsSync(NOTES_DIR)) {
  fs.mkdirSync(NOTES_DIR, { recursive: true });
  console.log('📁 Created notes directory');
}

if (!fs.existsSync(ATTACHMENTS_DIR)) {
  fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });
  console.log('📁 Created attachments directory');
}

type AttachmentEntry = {
  name: string;
  type: string;
  originalName?: string;
};

type ForwardMeta = {
  forward_from?: { username?: string; first_name?: string };
  forward_from_chat?: { title?: string };
  forward_sender_name?: string;
};

type MediaMeta = {
  text?: string;
  caption?: string;
  photo?: { file_id: string }[];
  document?: { file_id: string; file_name?: string };
  video?: { file_id: string };
  audio?: { file_id: string; file_name?: string };
  voice?: { file_id: string };
  video_note?: { file_id: string };
};

type IncomingMessage = ForwardMeta & MediaMeta;

const bot = new Telegraf(BOT_TOKEN);

// Message queue for sequential processing
type MessageContext = Context<Update.MessageUpdate>;
const messageQueue: MessageContext[] = [];
let isProcessing = false;

const processQueue = async () => {
  if (isProcessing || messageQueue.length === 0) return;
  isProcessing = true;

  while (messageQueue.length > 0) {
    const ctx = messageQueue.shift()!;
    await processMessage(ctx);
  }

  isProcessing = false;
};

const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const getTimestamp = (unixTimestamp?: number): string => {
  const date = unixTimestamp ? new Date(unixTimestamp * 1000) : new Date();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
};

const getDayNotesFile = (): string => {
  const now = new Date();
  const day = now.getDate();
  const month = MONTH_NAMES[now.getMonth()];
  const baseName = `${day}-${month}`;

  // Check if base file exists, if so append to it
  const baseFile = path.join(NOTES_DIR, `${baseName}.md`);
  return baseFile;
};

const appendToNotes = (content: string): void => {
  const notesFile = getDayNotesFile();
  try {
    fs.appendFileSync(notesFile, `${content}\n`, 'utf8');
  } catch (error) {
    console.error('❌ Error writing to notes:', (error as Error).message);
  }
};

const generateFileName = (baseName: string, extension: string): string => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const sanitized = baseName ? baseName.replace(/[^a-z0-9]/gi, '_') : 'file';
  return `${timestamp}_${random}_${sanitized}${extension}`;
};

const downloadFile = async (fileId: string, fileName: string): Promise<string | null> => {
  try {
    const fileLink = await bot.telegram.getFileLink(fileId);
    const filePath = path.join(ATTACHMENTS_DIR, fileName);

    return await new Promise((resolve, reject) => {
      const file = fs.createWriteStream(filePath);

      https
        .get(fileLink.href, (response) => {
          response.pipe(file);
          file.on('finish', () => {
            file.close();
            console.log(`  💾 Saved: ${fileName}`);
            resolve(fileName);
          });
        })
        .on('error', (err) => {
          fs.unlink(filePath, () => {});
          reject(err);
        });
    });
  } catch (error) {
    console.error(`  ❌ Failed to download ${fileName}:`, (error as Error).message);
    return null;
  }
};

const formatForwardInfo = (message: ForwardMeta): string => {
  if (message.forward_from) {
    const forwardedFrom = message.forward_from.username
      ? `@${message.forward_from.username}`
      : message.forward_from.first_name;
    return ` - Forwarded from ${forwardedFrom}`;
  }

  if (message.forward_from_chat) {
    return ` - Forwarded from ${message.forward_from_chat.title}`;
  }

  if (message.forward_sender_name) {
    return ` - Forwarded from ${message.forward_sender_name}`;
  }

  return '';
};

const processMessage = async (ctx: MessageContext) => {
  console.log('\n📨 Processing message...');

  const message = ctx.message as IncomingMessage;
  const messageDate = 'date' in ctx.message ? (ctx.message as { date: number }).date : undefined;
  const timestamp = getTimestamp(messageDate);

  let markdownContent = '\n---\n';
  markdownContent += `**${timestamp}**`;
  markdownContent += formatForwardInfo(message);
  markdownContent += '\n\n';

  if ('text' in message && message.text) {
    markdownContent += `${message.text}\n`;
    console.log(`  📝 Text: ${message.text.substring(0, 50)}${message.text.length > 50 ? '...' : ''}`);
  } else if ('caption' in message && message.caption) {
    markdownContent += `${message.caption}\n`;
    console.log(
      `  📝 Caption: ${message.caption.substring(0, 50)}${message.caption.length > 50 ? '...' : ''}`,
    );
  }

  const attachments: AttachmentEntry[] = [];

  if ('photo' in message && message.photo?.length) {
    const photo = message.photo[message.photo.length - 1];
    const fileName = generateFileName('photo', '.jpg');
    const saved = await downloadFile(photo.file_id, fileName);
    if (saved) attachments.push({ name: saved, type: 'Photo' });
  }

  if ('document' in message && message.document) {
    const { document } = message;
    const extension = document.file_name ? path.extname(document.file_name) : '';
    const baseName = document.file_name ? path.basename(document.file_name, extension) : 'document';
    const fileName = generateFileName(baseName, extension || '.bin');
    const saved = await downloadFile(document.file_id, fileName);
    if (saved) attachments.push({ name: saved, type: 'Document', originalName: document.file_name || baseName });
  }

  if ('video' in message && message.video) {
    const fileName = generateFileName('video', '.mp4');
    const saved = await downloadFile(message.video.file_id, fileName);
    if (saved) attachments.push({ name: saved, type: 'Video' });
  }

  if ('audio' in message && message.audio) {
    const { audio } = message;
    const extension = audio.file_name ? path.extname(audio.file_name) : '.mp3';
    const baseName = audio.file_name ? path.basename(audio.file_name, extension) : 'audio';
    const fileName = generateFileName(baseName, extension);
    const saved = await downloadFile(audio.file_id, fileName);
    if (saved) attachments.push({ name: saved, type: 'Audio', originalName: audio.file_name || baseName });
  }

  if ('voice' in message && message.voice) {
    const fileName = generateFileName('voice', '.ogg');
    const saved = await downloadFile(message.voice.file_id, fileName);
    if (saved) attachments.push({ name: saved, type: 'Voice' });
  }

  if ('video_note' in message && message.video_note) {
    const fileName = generateFileName('video_note', '.mp4');
    const saved = await downloadFile(message.video_note.file_id, fileName);
    if (saved) attachments.push({ name: saved, type: 'Video Note' });
  }

  if (attachments.length > 0) {
    markdownContent += '\n**Attachments:**\n';
    for (const att of attachments) {
      const displayName = att.originalName || att.name;
      const isImage = ['Photo', 'Video', 'Video Note'].includes(att.type);
      if (isImage) {
        markdownContent += `![${displayName}](../attachments/${att.name})\n`;
      } else {
        markdownContent += `- [${displayName}](../attachments/${att.name}) _(${att.type})_\n`;
      }
    }
  }

  markdownContent += '\n---\n';
  appendToNotes(markdownContent);

  const notesFile = getDayNotesFile();
  console.log(`✅ Saved to ${path.basename(notesFile)}`);
  await ctx.reply('✅ Saved to notes!');
};

bot.on('message', (ctx) => {
  const userId = ctx.from?.id?.toString();
  if (!userId) {
    console.log('🚫 Rejected message without sender information');
    return;
  }

  if (userId !== ALLOWED_USER_ID) {
    console.log(`🚫 Rejected message from unauthorized user: ${userId}`);
    return;
  }

  if (!ctx.message) {
    console.log('ℹ️ No message payload to process');
    return;
  }

  // Queue the message and process in order
  messageQueue.push(ctx);
  processQueue();
});

bot.catch((err, ctx) => {
  console.error('❌ Bot error:', err, 'for update', ctx.update.update_id);
});

bot
  .launch()
  .then(() => {
    console.log('\n🤖 Telegram Note Bot is running!');
    console.log(`📝 Notes will be saved to: ${NOTES_DIR}/`);
    console.log(`📁 Attachments will be saved to: ${ATTACHMENTS_DIR}/`);
    console.log(`👤 Only accepting messages from user ID: ${ALLOWED_USER_ID}`);
    console.log('\n💡 Press Ctrl+C to stop\n');
  })
  .catch((error) => {
    console.error('❌ Failed to start bot:', error);
    process.exit(1);
  });

process.once('SIGINT', () => {
  console.log('\n\n👋 Stopping bot...');
  bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
  console.log('\n\n👋 Stopping bot...');
  bot.stop('SIGTERM');
});
