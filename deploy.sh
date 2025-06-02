#!/bin/bash

# Slacklator Deployment Script
# Supports Heroku, Railway, and other platforms

echo "🌐 Slacklator Deployment Script"
echo "================================"

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "❌ Error: .env file not found"
    echo "💡 Copy env.example to .env and configure your credentials first"
    exit 1
fi

# Check for required environment variables
if [ -z "$SLACK_BOT_TOKEN" ] || [ -z "$DEEPL_API_KEY" ] || [ -z "$SLACK_SIGNING_SECRET" ] || [ -z "$SLACK_APP_TOKEN" ]; then
    echo "❌ Error: Missing required environment variables"
    echo "💡 Make sure .env contains all required variables from env.example"
    exit 1
fi

echo "✅ Environment variables configured"

# Platform selection
echo ""
echo "Select deployment platform:"
echo "1) Heroku"
echo "2) Railway"
echo "3) Manual (show env vars for copy/paste)"
echo ""
read -p "Enter choice (1-3): " platform

case $platform in
    1)
        echo "🚀 Deploying to Heroku..."
        
        # Check if Heroku CLI is installed
        if ! command -v heroku &> /dev/null; then
            echo "❌ Heroku CLI not found. Install from: https://devcenter.heroku.com/articles/heroku-cli"
            exit 1
        fi
        
        # Create Heroku app if needed
        read -p "Enter Heroku app name (or press Enter for auto-generated): " app_name
        
        if [ -z "$app_name" ]; then
            heroku create
        else
            heroku create $app_name
        fi
        
        # Set environment variables
        echo "⚙️  Setting environment variables..."
        heroku config:set SLACK_BOT_TOKEN="$SLACK_BOT_TOKEN"
        heroku config:set SLACK_APP_TOKEN="$SLACK_APP_TOKEN"
        heroku config:set SLACK_SIGNING_SECRET="$SLACK_SIGNING_SECRET"
        heroku config:set DEEPL_API_KEY="$DEEPL_API_KEY"
        
        if [ ! -z "$REDIS_URL" ]; then
            heroku config:set REDIS_URL="$REDIS_URL"
        fi
        
        # Deploy
        echo "📦 Deploying..."
        git push heroku main
        
        echo "✅ Deployment complete!"
        heroku open
        ;;
        
    2)
        echo "🚀 Railway deployment instructions:"
        echo ""
        echo "1. Go to https://railway.app"
        echo "2. Connect your GitHub repository"
        echo "3. Add these environment variables:"
        echo ""
        echo "SLACK_BOT_TOKEN=$SLACK_BOT_TOKEN"
        echo "SLACK_APP_TOKEN=$SLACK_APP_TOKEN"
        echo "SLACK_SIGNING_SECRET=$SLACK_SIGNING_SECRET"
        echo "DEEPL_API_KEY=$DEEPL_API_KEY"
        
        if [ ! -z "$REDIS_URL" ]; then
            echo "REDIS_URL=$REDIS_URL"
        fi
        
        echo ""
        echo "4. Deploy automatically on push"
        ;;
        
    3)
        echo "📋 Environment variables for manual deployment:"
        echo ""
        echo "SLACK_BOT_TOKEN=$SLACK_BOT_TOKEN"
        echo "SLACK_APP_TOKEN=$SLACK_APP_TOKEN"
        echo "SLACK_SIGNING_SECRET=$SLACK_SIGNING_SECRET"
        echo "DEEPL_API_KEY=$DEEPL_API_KEY"
        
        if [ ! -z "$REDIS_URL" ]; then
            echo "REDIS_URL=$REDIS_URL"
        fi
        
        echo ""
        echo "Copy these to your deployment platform's environment variables section"
        ;;
        
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "🎉 Deployment setup complete!"
echo "💡 Remember to update your Slack app's request URLs to point to your deployed app" 