import { TelegramYouTubeBot } from './bot.js';

// Simple startup - like main() in Go
async function main() {
  try {
    const bot = new TelegramYouTubeBot();
    bot.start();
  } catch (error) {
    console.error('❌ Failed to start bot:', error.message);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  process.exit(0);
});

main().catch(error => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});