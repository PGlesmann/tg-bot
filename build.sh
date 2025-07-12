#!/bin/bash

# Simple build and run script for the Telegram YouTube Bot

BOT_NAME="youtube-bot"
OUTPUT_PATH="/app/downloads"
BOT_TOKEN="$1"

if [ -z "$BOT_TOKEN" ]; then
    echo "Usage: ./build.sh <BOT_TOKEN>"
    exit 1
fi

echo "🔨 Building Docker image..."
sudo docker build -t $BOT_NAME .

if [ $? -eq 0 ]; then
    echo "✅ Build successful!"
    
    # Stop existing container if running
    echo "🛑 Stopping existing container..."
    sudo docker stop $BOT_NAME 2>/dev/null
    sudo docker rm $BOT_NAME 2>/dev/null
    
    # Create downloads directory if it doesn't exist
    echo "📁 Creating downloads directory..."
    mkdir -p "$(pwd)/downloads"
    chmod 755 "$(pwd)/downloads"
    
    echo "🚀 Starting bot container..."
    sudo docker run -d \
        --name $BOT_NAME \
        --restart unless-stopped \
        -e BOT_TOKEN="$BOT_TOKEN" \
        -e OUTPUT_PATH="$OUTPUT_PATH" \
        -e LOG_LEVEL="info" \
        -v "$OUTPUT_PATH:$OUTPUT_PATH:rw" \
        $BOT_NAME
    
    if [ $? -eq 0 ]; then
        echo "✅ Bot started successfully!"
        echo "📁 Downloads will be saved to: $(pwd)/downloads"
        echo "🔍 Test the mount:"
        echo "   sudo docker exec $BOT_NAME ls -la /app/downloads"
        echo "   sudo docker exec $BOT_NAME touch /app/downloads/test.txt"
        echo "   ls -la ./downloads/"
        echo ""
        echo "📋 Useful commands:"
        echo "   View logs: sudo docker logs -f $BOT_NAME"
        echo "   Stop bot:  sudo docker stop $BOT_NAME"
        echo "   Restart:   sudo docker restart $BOT_NAME"
        echo "   Status:    sudo docker ps | grep $BOT_NAME"
        echo "   Shell:     sudo docker exec -it $BOT_NAME sh"
    else
        echo "❌ Failed to start container"
        exit 1
    fi
else
    echo "❌ Build failed"
    exit 1
fi