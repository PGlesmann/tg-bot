#!/bin/bash

# Build and push Telegram YouTube Bot to Docker Hub

DOCKER_USERNAME="$1"
IMAGE_NAME="telegram-youtube-bot"
VERSION="latest"

if [ -z "$DOCKER_USERNAME" ]; then
    echo "Usage: ./build-and-push.sh <DOCKER_HUB_USERNAME>"
    echo "Example: ./build-and-push.sh yourusername"
    exit 1
fi

FULL_IMAGE_NAME="$DOCKER_USERNAME/$IMAGE_NAME:$VERSION"

echo "🔨 Building Docker image: $FULL_IMAGE_NAME"
sudo docker build -t $FULL_IMAGE_NAME .

if [ $? -eq 0 ]; then
    echo "✅ Build successful!"
    
    echo "🔐 Logging into Docker Hub..."
    sudo docker login
    
    if [ $? -eq 0 ]; then
        echo "📤 Pushing image to Docker Hub..."
        sudo docker push $FULL_IMAGE_NAME
        
        if [ $? -eq 0 ]; then
            echo "✅ Successfully pushed to Docker Hub!"
            echo ""
            echo "🎯 Your image is now available at:"
            echo "   https://hub.docker.com/r/$DOCKER_USERNAME/$IMAGE_NAME"
            echo ""
            echo "🚀 To use on any machine:"
            echo "   curl -O https://raw.githubusercontent.com/yourusername/your-repo/main/run-bot.sh"
            echo "   chmod +x run-bot.sh"
            echo "   ./run-bot.sh $DOCKER_USERNAME/$IMAGE_NAME YOUR_BOT_TOKEN"
            echo ""
            echo "📋 Or manually:"
            echo "   docker run -d --name youtube-bot \\"
            echo "     -e BOT_TOKEN='YOUR_TOKEN' \\"
            echo "     -e OUTPUT_PATH='/app/downloads' \\"
            echo "     -v /app/downloads:/app/downloads:rw \\"
            echo "     $FULL_IMAGE_NAME"
        else
            echo "❌ Failed to push to Docker Hub"
            exit 1
        fi
    else
        echo "❌ Failed to login to Docker Hub"
        exit 1
    fi
else
    echo "❌ Build failed"
    exit 1
fi