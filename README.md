# 🌐 Slacklator

**Smart AI-powered translation bot for Slack teams**

Transform your Slack workspace into a multilingual collaboration hub! Slacklator automatically translates messages between team members speaking different languages, with **70-80% cost savings** through intelligent caching and optimization.

![Slacklator Demo](https://img.shields.io/badge/status-production%20ready-brightgreen) ![Node.js](https://img.shields.io/badge/node.js-%3E%3D18-brightgreen) ![DeepL](https://img.shields.io/badge/powered%20by-DeepL-blue)

## ✨ Features

### 🔄 **Two-Way Translation**
- **Incoming**: See messages in your preferred language automatically
- **Outgoing**: Use `/translate hello` to post in the channel's language
- **Smart**: Auto-detects channel language from recent messages

### 💰 **Cost Optimized**
- **Common Phrases Table**: 50+ pre-translated phrases (no API calls)
- **Smart Learning Cache**: Learns your team's vocabulary
- **Fast Pattern Detection**: Regex-based language detection
- **Reduced API Calls**: 70-80% savings for typical teams

### 🎯 **Advanced Features**
- **View Original**: Right-click translated messages to see original text
- **User Preferences**: Each person sets their language once
- **Usage Tracking**: Monitor API costs and optimization savings
- **Multi-Platform**: Deploy to Heroku, Render, Railway, or any Node.js host

### 🌍 **Supported Languages**
Bulgarian, Czech, Danish, German, Greek, English, Spanish, Estonian, Finnish, French, Hungarian, Indonesian, Italian, Japanese, Korean, Lithuanian, Latvian, Norwegian, Dutch, Polish, Portuguese, Romanian, Russian, Slovak, Slovenian, Swedish, Turkish, Ukrainian, Chinese

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- [Slack App](https://api.slack.com/apps) with Socket Mode
- [DeepL API Key](https://www.deepl.com/pro-api)
- Redis (optional, for user preferences persistence)

### 1. **Clone & Install**
```bash
git clone https://github.com/YOUR_USERNAME/slacklator.git
cd slacklator
npm install
```

### 2. **Configure Environment**
```bash
cp env.example .env
# Edit .env with your credentials (see Configuration section)
```

### 3. **Run Locally**
```bash
npm start
```

---

## ⚙️ Configuration

### Slack App Setup

1. **Create Slack App**: https://api.slack.com/apps
2. **Enable Socket Mode**: 
   - Go to "Socket Mode" → Enable
   - Generate App-Level Token with `connections:write` scope
3. **Bot Token Scopes**:
   ```
   channels:history    # Read channel messages
   chat:write         # Post translated messages  
   chat:write.public  # Post in any channel
   commands           # Handle slash commands
   users:read         # Get user information
   ```
4. **Install to Workspace**: Install your app to your Slack workspace

### Environment Variables

Copy `env.example` to `.env` and configure:

```bash
# REQUIRED: Slack App Credentials
SLACK_BOT_TOKEN=xoxb-your-bot-token-here
SLACK_APP_TOKEN=xapp-your-app-token-here  
SLACK_SIGNING_SECRET=your-signing-secret-here

# REQUIRED: DeepL API Key
DEEPL_API_KEY=your-deepl-api-key-here

# OPTIONAL: Redis for persistence
REDIS_URL=redis://username:password@host:port
```

### Slack Commands Setup

Add these slash commands in your Slack app:

| Command | Request URL | Description |
|---------|-------------|-------------|
| `/translate` | `https://your-app.com/slack/events` | Translate and post message |
| `/translate-setup` | `https://your-app.com/slack/events` | Set your language |
| `/translate-me` | `https://your-app.com/slack/events` | Check your settings |
| `/translate-usage` | `https://your-app.com/slack/events` | View API usage |
| `/translate-help` | `https://your-app.com/slack/events` | Show help |

### Message Shortcuts Setup

Add these message shortcuts in your Slack app:

| Shortcut | Callback ID | Description |
|----------|-------------|-------------|
| "Translate message" | `translate_message` | Translate any message to all languages |
| "View original" | `view_original` | View original text for translated messages |

---

## 🔧 Deployment

### Render (Recommended)

1. **Connect GitHub**: Link your repository to Render
2. **Environment Variables**: Add all variables from `.env`
3. **Auto-Deploy**: Push to trigger deployment

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

### Heroku

```bash
# Deploy using provided script
./deploy.sh
```

### Railway

1. **Connect Repository**: Link to Railway
2. **Add Variables**: Copy from `.env`
3. **Deploy**: Automatic on push

### Docker

```bash
docker build -t slacklator .
docker run -d --env-file .env -p 3000:3000 slacklator
```

---

## 📖 Usage

### **Setup (One-time per user)**
```
/translate-setup es     # Set your language to Spanish
/translate-me           # Check your current settings
```

### **Daily Usage**
```
/translate hola mundo   # Translates to channel language and posts
```

### **Automatic Translation**
- Messages appear translated in your preferred language
- No commands needed after initial setup

### **Advanced Features**
```
/translate-usage        # Check API costs and savings
/translate-help         # Show all commands
```

### **Message Actions**
- Right-click any message → "Translate message" (view in all languages)
- Right-click translated posts → "View original" (see original text)

---

## 💡 How It Works

### **Incoming Translation Flow**
1. Someone posts: "Hola mundo" 
2. Slacklator detects language: Spanish
3. Users preferring English see: "🌐 ES → EN: Hello world"
4. Message appears as ephemeral translation

### **Outgoing Translation Flow**  
1. You type: `/translate hello team`
2. Slacklator detects channel language from recent messages
3. Translates your message to channel language
4. Posts as: "**Your Name:** hola equipo"

### **Cost Optimization**
- Common phrases (hello, thanks, yes, no) → **No API calls**
- Repeated phrases → **Extended caching**
- Smart detection → **Pattern matching first**
- Team learning → **Adaptive optimization**

---

## 🛠️ Development

### **Local Development**
```bash
npm install
cp env.example .env
# Configure .env with your credentials
npm start
```

### **File Structure**
```
slacklator/
├── app.js              # Main application
├── package.json        # Dependencies
├── manifest.yaml       # Slack app manifest
├── Procfile           # Heroku deployment
├── env.example        # Environment template
└── README.md          # This file
```

### **Key Functions**
- `detectLanguage()` - Smart language detection with caching
- `translateText()` - Cost-optimized translation with common phrases
- `detectChannelLanguage()` - Analyze recent messages (3 max)
- `trackTranslationUsage()` - Learning system for popular phrases

---

## 📊 Monitoring & Analytics

### **Cost Tracking**
Use `/translate-usage` to see:
- Total API calls vs cache hits
- Common phrases usage (no cost)
- Estimated savings percentage
- DeepL character consumption

### **Performance Metrics**
- Cache hit rates for faster responses
- Smart learning adaptation
- API optimization effectiveness

---

## 🤝 Contributing

We welcome contributions! Here's how to help:

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature-name`
3. **Commit** changes: `git commit -m 'Add feature'`
4. **Push** to branch: `git push origin feature-name`
5. **Submit** a Pull Request

### **Ideas for Contributions**
- Additional language patterns for faster detection
- More common phrases for different industries
- Enhanced caching strategies
- UI improvements for Slack blocks
- Additional deployment platforms

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

## 🆘 Support

### **Common Issues**

**"dispatch_failed" errors**
- Only run one instance (local OR deployed, not both)
- Check Socket Mode is enabled in Slack app

**High DeepL costs**
- Use `/translate-usage` to monitor savings
- Common phrases and caching reduce costs automatically
- Consider Redis for better caching across restarts

**Redis connection issues**
- App works without Redis (preferences won't persist)
- Check Redis URL format: `redis://username:password@host:port`

### **Get Help**
- 📧 [Open an Issue](https://github.com/YOUR_USERNAME/slacklator/issues)
- 💬 [Discussions](https://github.com/YOUR_USERNAME/slacklator/discussions)
- 📖 [Documentation](https://github.com/YOUR_USERNAME/slacklator/wiki)

---

## 🏆 Credits

Built with ❤️ using:
- [Slack Bolt](https://slack.dev/bolt-js/) - Slack app framework
- [DeepL API](https://www.deepl.com/docs-api) - High-quality translation
- [Node.js](https://nodejs.org/) - Runtime environment
- [Redis](https://redis.io/) - Caching and persistence

---

**Made with 🌍 for global teams**

Transform your Slack workspace into a seamless multilingual environment where language is never a barrier to collaboration!

---

[![GitHub stars](https://img.shields.io/github/stars/YOUR_USERNAME/slacklator?style=social)](https://github.com/YOUR_USERNAME/slacklator/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/YOUR_USERNAME/slacklator?style=social)](https://github.com/YOUR_USERNAME/slacklator/network/members)
[![GitHub issues](https://img.shields.io/github/issues/YOUR_USERNAME/slacklator)](https://github.com/YOUR_USERNAME/slacklator/issues) 