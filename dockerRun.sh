BOT_NAME="tg-bot"
OUTPUT_PATH="/app/downloads"

sudo docker run -d \
        --name $BOT_NAME \
        --restart unless-stopped \
        -e BOT_TOKEN="$BOT_TOKEN" \
        -e OUTPUT_PATH="$OUTPUT_PATH" \
        -e LOG_LEVEL="info" \
        -v "$OUTPUT_PATH:$OUTPUT_PATH:rw" \
        leetcodepaul/telegram-youtube-bot