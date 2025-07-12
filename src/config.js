export function parseConfig() {
  const args = process.argv.slice(2);
 
  const config = {
    token: process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN,
    outputPath: process.env.OUTPUT_PATH || '/app/downloads/',
    maxRetries: parseInt(process.env.MAX_RETRIES) || 3,
    retryDelay: parseInt(process.env.RETRY_DELAY) || 1000,
    logLevel: process.env.LOG_LEVEL || 'info',
    allowedUsers: process.env.ALLOWED_USERS ? 
      process.env.ALLOWED_USERS.split(',').map(id => parseInt(id.trim())) : []
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--token':
      case '-t':
        config.token = args[++i];
        break;
      case '--output':
      case '-o':
        config.outputPath = args[++i];
        break;
      case '--retries':
      case '-r':
        config.maxRetries = parseInt(args[++i]);
        break;
      case '--delay':
      case '-d':
        config.retryDelay = parseInt(args[++i]);
        break;
      case '--log-level':
      case '-l':
        config.logLevel = args[++i];
        break;
      case '--users':
      case '-u':
        config.allowedUsers = args[++i].split(',').map(id => parseInt(id.trim()));
        break;
      case '--help':
      case '-h':
        showHelp();
        process.exit(0);
      default:
        if (args[i].startsWith('-')) {
          console.error(`Unknown flag: ${args[i]}`);
          showHelp();
          process.exit(1);
        }
    }
  }

  // Validate required fields
  if (!config.token) {
    console.error('❌ Bot token is required! Use --token or BOT_TOKEN env var');
    showHelp();
    process.exit(1);
  }

  // Ensure output path ends with slash
  if (!config.outputPath.endsWith('/')) {
    config.outputPath += '/';
  }

  return config;
}

function showHelp() {
  console.log(`
🎬 Telegram YouTube Bot

Usage: node src/server.js [options]

Options:
  -t, --token <token>     Telegram bot token (required)
  -o, --output <path>     Download output path (default: /app/downloads/)
  -r, --retries <num>     Max download retries (default: 3)
  -d, --delay <ms>        Retry delay in milliseconds (default: 1000)
  -l, --log-level <level> Log level: debug, info, warn, error (default: info)
  -u, --users <ids>       Comma-separated user IDs allowed to use bot
  -h, --help              Show this help

Environment Variables:
  BOT_TOKEN              Telegram bot token
  OUTPUT_PATH            Download output path  
  MAX_RETRIES            Max download retries
  RETRY_DELAY            Retry delay in milliseconds
  LOG_LEVEL              Log level (debug, info, warn, error)
  ALLOWED_USERS          Comma-separated user IDs

Examples:
  node src/server.js --token YOUR_BOT_TOKEN
  node src/server.js --token YOUR_BOT_TOKEN --output /downloads --retries 5
  node src/server.js --token YOUR_BOT_TOKEN --users 123456789,987654321
  node src/server.js --log-level debug

Docker:
  docker run -e BOT_TOKEN=YOUR_TOKEN -v /host/downloads:/app/downloads your-bot
  `);
}