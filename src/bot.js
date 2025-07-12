import TelegramBot from 'node-telegram-bot-api';
import ytdl from '@distube/ytdl-core';
import path from 'path';
import { createWriteStream } from 'fs';
import pino from 'pino';
import { parseConfig } from './config.js';
import { isValidYouTubeUrl, sanitizeFilename, ensureDirectoryExists } from './utils.js';

export class TelegramYouTubeBot {
  constructor() {
    this.config = parseConfig();
    this.lastUpdateId = 0; 
    
    this.logger = pino({
      level: this.config.logLevel || 'info',
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level: (label) => {
          return { level: label };
        }
      }
    });
    
    this.bot = new TelegramBot(this.config.token, { 
      polling: {
        interval: 1000,
        autoStart: false
      }
    });
    this.setupHandlers();
    this.setupGracefulShutdown();
  }

  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      this.logger.info({
        event: 'shutdown_initiated',
        signal
      }, 'Received shutdown signal');
      
      await this.stop();
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    
    process.on('uncaughtException', (error) => {
      this.logger.fatal({
        event: 'uncaught_exception',
        error: error.message,
        stack: error.stack
      }, 'Uncaught exception occurred');
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      this.logger.fatal({
        event: 'unhandled_rejection',
        reason: reason?.message || reason,
        stack: reason?.stack
      }, 'Unhandled promise rejection');
      process.exit(1);
    });
  }

  setupHandlers() {
    this.bot.onText(/\/start/, (msg) => this.handleStart(msg));
    this.bot.onText(/\/help/, (msg) => this.handleHelp(msg));
    this.bot.onText(/\/ytdl\s+(https?:\/\/[^\s]+)/, (msg, match) => this.handleDownload(msg, match));

    // Handle invalid /ytdl commands (without proper URL)
    this.bot.onText(/\/ytdl(?:\s+(.*))?$/, (msg, match) => {
      if (!match[1] || !match[1].match(/^https?:\/\/[^\s]+$/)) {
        this.handleInvalidYtdl(msg, match[1]);
      }
    });
    this.bot.on('message', (msg) => this.handleMessage(msg));
    this.bot.on('error', (error) => {
      this.logger.error({ error: error.message, stack: error.stack }, 'Bot polling error occurred');
    });
    this.bot.on('polling_error', (error) => {
      this.logger.error({ error: error.message, code: error.code }, 'Polling error occurred');
    });
  }

  async handleInvalidYtdl(msg, providedText) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    this.logger.warn({
      event: 'invalid_ytdl_command',
      userId,
      chatId,
      providedText: providedText?.substring(0, 100) || 'none'
    }, 'Invalid ytdl command received');
    
    const helpText = `
      ❌ Invalid command format.

      Please use: \`/ytdl <YouTube_URL>\`

      Example:
      \`/ytdl https://youtube.com/watch?v=abc123\`

      The URL must start with http:// or https://
    `;
    
    try {
      await this.safeSendMessage(chatId, helpText, { parse_mode: 'Markdown' });
    } catch (error) {
      await this.safeSendMessage(chatId, helpText.replace(/[`]/g, ''));
    }
  }

  // Safe message sending with length limits
  async safeSendMessage(chatId, text, options = {}) {
    const MAX_LENGTH = 4096; 
    
    try {
      if (text.length > MAX_LENGTH) {
        const chunks = [];
        let remaining = text;
        
        while (remaining.length > 0) {
          if (remaining.length <= MAX_LENGTH) {
            chunks.push(remaining);
            break;
          }
          
          let breakPoint = MAX_LENGTH;
          const lastNewline = remaining.lastIndexOf('\n', MAX_LENGTH);
          const lastSpace = remaining.lastIndexOf(' ', MAX_LENGTH);
          
          if (lastNewline > MAX_LENGTH * 0.8) {
            breakPoint = lastNewline;
          } else if (lastSpace > MAX_LENGTH * 0.8) {
            breakPoint = lastSpace;
          }
          
          chunks.push(remaining.substring(0, breakPoint));
          remaining = remaining.substring(breakPoint).trim();
        }
        
        for (let i = 0; i < chunks.length; i++) {
          await this.bot.sendMessage(chatId, chunks[i], options);
          if (i < chunks.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
      } else {
        await this.bot.sendMessage(chatId, text, options);
      }
    } catch (error) {
      this.logger.error({
        event: 'message_send_failed',
        chatId,
        error: error.message,
        textLength: text.length
      }, 'Failed to send message');
      throw error;
    }
  }

  async handleDownload(msg, match) {
    const chatId = msg.chat.id;
    const url = match[1].trim(); 
    const userId = msg.from.id;
    const username = msg.from.username || msg.from.first_name;

    this.logger.info({
      event: 'download_request',
      userId,
      username,
      chatId,
      url
    }, 'Download request received');

    try {
      if (this.config.allowedUsers && this.config.allowedUsers.length > 0) {
        if (!this.config.allowedUsers.includes(userId)) {
          this.logger.warn({
            event: 'unauthorized_access',
            userId,
            username,
            chatId
          }, 'Unauthorized user attempted to use bot');
          
          await this.safeSendMessage(chatId, '❌ Not authorized to use this bot');
          return;
        }
      }

      if (!isValidYouTubeUrl(url)) {
        this.logger.warn({
          event: 'invalid_url',
          userId,
          url,
          chatId
        }, 'Invalid YouTube URL provided');
        
        await this.safeSendMessage(chatId, '❌ Invalid YouTube URL. Please provide a valid YouTube link.');
        return;
      }

      await this.safeSendMessage(chatId, `🔄 Starting download: ${url}`);
      await this.bot.sendChatAction(chatId, 'upload_video');
      
      const startTime = Date.now();
      const outputFile = await this.downloadVideo(url, { userId, username, chatId });
      const downloadTime = Date.now() - startTime;
      const fileName = path.basename(outputFile);
      
      this.logger.info({
        event: 'download_completed',
        userId,
        username,
        chatId,
        url,
        fileName,
        outputFile,
        downloadTimeMs: downloadTime
      }, 'Video download completed successfully');
      
      await this.safeSendMessage(chatId, `✅ Downloaded: ${fileName} and saved under ${outputFile}`);
      
    } catch (error) {
      this.logger.error({
        event: 'download_failed',
        userId,
        username,
        chatId,
        url,
        error: error.message,
        stack: error.stack
      }, 'Video download failed');
      
      await this.safeSendMessage(chatId, `❌ Download failed: ${error.message}`);
    }
  }

  async handleMessage(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || msg.from.first_name;
    
    if (msg.text && msg.text.startsWith('/')) return;
    
    if (msg.text) {
      this.logger.debug({
        event: 'message_received',
        userId,
        username,
        chatId,
        messageText: msg.text.substring(0, 100), 
        messageLength: msg.text.length
      }, 'Regular message received');
      
      try {
        await this.bot.sendChatAction(chatId, 'typing');
        await this.safeSendMessage(chatId, `🤖 Echo: ${msg.text}`);
      } catch (error) {
        this.logger.error({
          event: 'echo_failed',
          userId,
          chatId,
          error: error.message
        }, 'Failed to send echo message');
      }
    }
  }

  async downloadVideo(url, context = {}) {
    let attempt = 0;
    const maxRetries = this.config.maxRetries || 3;
    const retryDelay = this.config.retryDelay || 1000;
    
    while (attempt < maxRetries) {
      try {
        this.logger.debug({
          event: 'download_attempt',
          attempt: attempt + 1,
          maxRetries,
          url,
          ...context
        }, 'Starting download attempt');
        
        const vidInfo = await ytdl.getBasicInfo(url);
        
        const title = sanitizeFilename(vidInfo.videoDetails.title);
        const author = sanitizeFilename(vidInfo.videoDetails.author.name);
        const duration = vidInfo.videoDetails.lengthSeconds;
        const viewCount = vidInfo.videoDetails.viewCount;
        
        const folder = path.join(this.config.outputPath, author);
        const outputFile = path.join(folder, `${title}.mp4`);
        
        await ensureDirectoryExists(folder);
        
        this.logger.info({
          event: 'video_info_retrieved',
          title,
          author,
          duration,
          viewCount,
          outputFile,
          url,
          ...context
        }, 'Video information retrieved');
        
        return new Promise((resolve, reject) => {
          const stream = ytdl(url, { quality: 'highest' });
          const writeStream = createWriteStream(outputFile);
          
          stream.pipe(writeStream);
          
          writeStream.on('finish', () => {
            this.logger.info({
              event: 'file_written',
              outputFile,
              title,
              author,
              url,
              ...context
            }, 'Video file written successfully');
            resolve(outputFile);
          });
          
          writeStream.on('error', (error) => {
            this.logger.error({
              event: 'write_stream_error',
              error: error.message,
              outputFile,
              url,
              ...context
            }, 'Write stream error');
            reject(error);
          });
          
          stream.on('error', (error) => {
            this.logger.error({
              event: 'download_stream_error',
              error: error.message,
              url,
              ...context
            }, 'Download stream error');
            reject(error);
          });
        });
        
      } catch (error) {
        attempt++;
        
        this.logger.warn({
          event: 'download_attempt_failed',
          attempt,
          maxRetries,
          error: error.message,
          url,
          retryDelay,
          willRetry: attempt < maxRetries,
          ...context
        }, 'Download attempt failed');
        
        if (attempt >= maxRetries) {
          const finalError = new Error(`Failed after ${maxRetries} attempts: ${error.message}`);
          
          this.logger.error({
            event: 'download_exhausted_retries',
            maxRetries,
            finalError: finalError.message,
            originalError: error.message,
            url,
            ...context
          }, 'Download failed after exhausting all retries');
          
          throw finalError;
        }
        
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  async start() {
    try {
      const updates = await this.bot.getUpdates({ limit: 1, timeout: 0 });
      if (updates.length > 0) {
        this.lastUpdateId = updates[0].update_id;
        this.logger.info({
          event: 'set_update_offset',
          lastUpdateId: this.lastUpdateId
        }, 'Set update offset to avoid reprocessing old messages');
      }

      await this.bot.startPolling({ restart: true });

      this.logger.info({
        event: 'bot_started',
        outputPath: this.config.outputPath,
        maxRetries: this.config.maxRetries || 3,
        allowedUsers: this.config.allowedUsers?.length || 'all',
        logLevel: this.config.logLevel || 'info'
      }, 'Bot started and waiting for messages');
      
    } catch (error) {
      this.logger.error({
        event: 'bot_start_failed',
        error: error.message,
        stack: error.stack
      }, 'Failed to start bot');
      throw error;
    }
  }

  async stop() {
    try {
      await this.bot.stopPolling();
      this.logger.info({ event: 'bot_stopped' }, 'Bot stopped gracefully');
    } catch (error) {
      this.logger.error({
        event: 'bot_stop_failed',
        error: error.message
      }, 'Error stopping bot');
    }
  }

  async handleHelp(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || msg.from.first_name;
    
    this.logger.debug({
      event: 'help_requested',
      userId,
      username,
      chatId
    }, 'Help command invoked');
    
    const helpText = `
      📋 *Available Commands:*

      /start - Start the bot
      /help - Show this help message
      /ytdl <url> - Download a YouTube video
    `;
    
    try {
      await this.safeSendMessage(chatId, helpText, { parse_mode: 'Markdown' });
    } catch (error) {
      this.logger.error({
        event: 'help_send_failed',
        userId,
        chatId,
        error: error.message
      }, 'Failed to send help message');
      await this.safeSendMessage(chatId, helpText.replace(/[*`]/g, ''));
    }
  }

  async handleStart(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || msg.from.first_name;
    
    this.logger.info({
      event: 'bot_started_by_user',
      userId,
      username,
      chatId
    }, 'Start command invoked by user');
    
    const welcomeText = `
      🎬 Hello! I am a YouTube downloader bot.

      Send me a YouTube URL with /ytdl <url> to download videos.
      Use /help for more information.
    `;
    
    try {
      await this.safeSendMessage(chatId, welcomeText);
    } catch (error) {
      this.logger.error({
        event: 'start_send_failed',
        userId,
        chatId,
        error: error.message
      }, 'Failed to send start message');
    }
  }
}