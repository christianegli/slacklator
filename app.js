// Load environment variables
require('dotenv').config();

// app.js - Slacklator - Smart AI-powered translation bot for Slack teams (DeepL Primary)
const { App } = require('@slack/bolt');
const deepl = require('deepl-node');
const redis = require('redis');
const NodeCache = require('node-cache');

// Initialize Slack
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
  // No port needed for Socket Mode - it connects outbound to Slack
});

// Initialize DeepL (REQUIRED)
const translator = new deepl.Translator(process.env.DEEPL_API_KEY);

// Initialize Redis (OPTIONAL)
let redisClient = null;
let redisAvailable = false;

if (process.env.REDIS_URL) {
  try {
    // Validate Redis URL format
    if (!process.env.REDIS_URL.startsWith('redis://') && !process.env.REDIS_URL.startsWith('rediss://')) {
      throw new Error(`Invalid Redis URL format. Expected: redis://username:password@host:port or rediss://username:password@host:port, got: ${process.env.REDIS_URL.substring(0, 20)}...`);
    }
    
    console.log(`🔗 Attempting Redis connection to: ${process.env.REDIS_URL.replace(/:[^:@]*@/, ':****@')}`);
    
    redisClient = redis.createClient({
      url: process.env.REDIS_URL
    });
    
    redisClient.on('connect', () => {
      console.log('✅ Redis connected successfully');
      redisAvailable = true;
    });
    
    redisClient.on('error', (err) => {
      console.log('❌ Redis connection error:', err.message);
      redisAvailable = false;
    });
    
    // Attempt to connect
    redisClient.connect().catch(err => {
      console.log('❌ Redis connection failed:', err.message);
      redisAvailable = false;
    });
  } catch (error) {
    console.log('❌ Redis initialization failed:', error.message);
    console.log('💡 Expected Redis URL format: redis://username:password@host:port');
    console.log('💡 Example: redis://default:mypassword@redis-12345.example.com:12345');
    redisClient = null;
    redisAvailable = false;
  }
} else {
  console.log('⚠️  No REDIS_URL provided - running without Redis (preferences won\'t persist)');
}

// In-memory cache for translations
const translationCache = new NodeCache({ 
  stdTTL: 3600, // 1 hour default
  maxKeys: 10000 
});

// Smart learning cache for frequently used translations
const frequentTranslations = new Map();

// Cost tracking
let apiCallsToday = 0;
let cacheHitsToday = 0;
let commonPhrasesUsed = 0;

// Track translation usage and extend cache for popular phrases
function trackTranslationUsage(text, targetLang, translation) {
  const key = `${text.toLowerCase()}:${targetLang}`;
  const usage = frequentTranslations.get(key) || { count: 0, translation };
  usage.count++;
  usage.translation = translation;
  frequentTranslations.set(key, usage);
  
  // If used frequently, cache for longer (24 hours instead of 1)
  if (usage.count >= 3) {
    const cacheKey = `${text.substring(0, 100)}:${targetLang}:auto`;
    translationCache.set(cacheKey, translation, 86400); // 24 hours
    console.log(`📚 Extended cache for popular phrase: "${text.substring(0, 30)}..." (used ${usage.count} times)`);
  }
}

// User preferences cache
const userPreferences = new Map();

// Channel preferences cache  
const channelPreferences = new Map();

// Original message cache for /translate command
const originalMessageCache = new NodeCache({
  stdTTL: 604800, // 7 days
  maxKeys: 5000
});

// DeepL language mapping
const DEEPL_LANGUAGES = {
  'bg': 'BG', 'cs': 'CS', 'da': 'DA', 'de': 'DE', 'el': 'EL',
  'en': 'EN-US', 'es': 'ES', 'et': 'ET', 'fi': 'FI', 'fr': 'FR',
  'hu': 'HU', 'id': 'ID', 'it': 'IT', 'ja': 'JA', 'ko': 'KO',
  'lt': 'LT', 'lv': 'LV', 'nb': 'NB', 'nl': 'NL', 'pl': 'PL',
  'pt': 'PT-PT', 'ro': 'RO', 'ru': 'RU', 'sk': 'SK', 'sl': 'SL',
  'sv': 'SV', 'tr': 'TR', 'uk': 'UK', 'zh': 'ZH'
};

// Common phrases translation table (avoids API calls)
const COMMON_PHRASES = {
  // English
  'hello': { en: 'hello', es: 'hola', de: 'hallo', fr: 'bonjour', it: 'ciao', pt: 'olá' },
  'hi': { en: 'hi', es: 'hola', de: 'hallo', fr: 'salut', it: 'ciao', pt: 'oi' },
  'bye': { en: 'bye', es: 'adiós', de: 'tschüss', fr: 'au revoir', it: 'ciao', pt: 'tchau' },
  'thanks': { en: 'thanks', es: 'gracias', de: 'danke', fr: 'merci', it: 'grazie', pt: 'obrigado' },
  'thank you': { en: 'thank you', es: 'gracias', de: 'danke', fr: 'merci', it: 'grazie', pt: 'obrigado' },
  'yes': { en: 'yes', es: 'sí', de: 'ja', fr: 'oui', it: 'sì', pt: 'sim' },
  'no': { en: 'no', es: 'no', de: 'nein', fr: 'non', it: 'no', pt: 'não' },
  'ok': { en: 'ok', es: 'ok', de: 'ok', fr: 'ok', it: 'ok', pt: 'ok' },
  'okay': { en: 'okay', es: 'vale', de: 'okay', fr: 'd\'accord', it: 'va bene', pt: 'tudo bem' },
  'good morning': { en: 'good morning', es: 'buenos días', de: 'guten morgen', fr: 'bonjour', it: 'buongiorno', pt: 'bom dia' },
  'good night': { en: 'good night', es: 'buenas noches', de: 'gute nacht', fr: 'bonne nuit', it: 'buonanotte', pt: 'boa noite' },
  'please': { en: 'please', es: 'por favor', de: 'bitte', fr: 's\'il vous plaît', it: 'per favore', pt: 'por favor' },
  'sorry': { en: 'sorry', es: 'lo siento', de: 'entschuldigung', fr: 'désolé', it: 'scusa', pt: 'desculpe' },
  'excuse me': { en: 'excuse me', es: 'disculpe', de: 'entschuldigung', fr: 'excusez-moi', it: 'scusi', pt: 'com licença' },
  
  // Spanish
  'hola': { en: 'hello', es: 'hola', de: 'hallo', fr: 'bonjour', it: 'ciao', pt: 'olá' },
  'gracias': { en: 'thanks', es: 'gracias', de: 'danke', fr: 'merci', it: 'grazie', pt: 'obrigado' },
  'sí': { en: 'yes', es: 'sí', de: 'ja', fr: 'oui', it: 'sì', pt: 'sim' },
  'adiós': { en: 'bye', es: 'adiós', de: 'tschüss', fr: 'au revoir', it: 'ciao', pt: 'tchau' },
  
  // German
  'hallo': { en: 'hello', es: 'hola', de: 'hallo', fr: 'bonjour', it: 'ciao', pt: 'olá' },
  'danke': { en: 'thanks', es: 'gracias', de: 'danke', fr: 'merci', it: 'grazie', pt: 'obrigado' },
  'ja': { en: 'yes', es: 'sí', de: 'ja', fr: 'oui', it: 'sì', pt: 'sim' },
  'nein': { en: 'no', es: 'no', de: 'nein', fr: 'non', it: 'no', pt: 'não' },
  'tschüss': { en: 'bye', es: 'adiós', de: 'tschüss', fr: 'au revoir', it: 'ciao', pt: 'tchau' },
  
  // French
  'bonjour': { en: 'hello', es: 'hola', de: 'hallo', fr: 'bonjour', it: 'ciao', pt: 'olá' },
  'merci': { en: 'thanks', es: 'gracias', de: 'danke', fr: 'merci', it: 'grazie', pt: 'obrigado' },
  'oui': { en: 'yes', es: 'sí', de: 'ja', fr: 'oui', it: 'sì', pt: 'sim' },
  'non': { en: 'no', es: 'no', de: 'nein', fr: 'non', it: 'no', pt: 'não' },
  'au revoir': { en: 'bye', es: 'adiós', de: 'tschüss', fr: 'au revoir', it: 'ciao', pt: 'tchau' },
  
  // Italian
  'ciao': { en: 'hi', es: 'hola', de: 'hallo', fr: 'salut', it: 'ciao', pt: 'oi' },
  'grazie': { en: 'thanks', es: 'gracias', de: 'danke', fr: 'merci', it: 'grazie', pt: 'obrigado' },
  'sì': { en: 'yes', es: 'sí', de: 'ja', fr: 'oui', it: 'sì', pt: 'sim' },
  'buongiorno': { en: 'good morning', es: 'buenos días', de: 'guten morgen', fr: 'bonjour', it: 'buongiorno', pt: 'bom dia' }
};

// Smart language detection with cost optimization
const LANGUAGE_PATTERNS = {
  en: /\b(the|and|is|are|was|were|have|has|will|would|could|should|that|this|with|from|they|there|where|what|when|how)\b/i,
  es: /\b(el|la|los|las|es|son|y|que|de|en|un|una|para|por|con|se|te|me|le|lo|su|sus)\b/i,
  de: /\b(der|die|das|und|ist|sind|war|waren|haben|hat|wird|wurde|dass|mit|von|zu|im|am|ein|eine)\b/i,
  fr: /\b(le|la|les|et|est|sont|était|étaient|avoir|a|va|que|de|dans|un|une|pour|par|avec|se|te|me)\b/i,
  it: /\b(il|la|i|le|è|sono|era|erano|avere|ha|sarà|che|di|in|un|una|per|da|con|si|te|me)\b/i,
  pt: /\b(o|a|os|as|é|são|era|eram|ter|tem|vai|que|de|em|um|uma|para|por|com|se|te|me)\b/i
};

// Fast language detection using patterns (no API call)
function detectLanguageFast(text) {
  const textLower = text.toLowerCase();
  const scores = {};
  
  for (const [lang, pattern] of Object.entries(LANGUAGE_PATTERNS)) {
    const matches = textLower.match(pattern);
    scores[lang] = matches ? matches.length : 0;
  }
  
  const bestMatch = Object.entries(scores).reduce((a, b) => scores[a[0]] > scores[b[0]] ? a : b);
  return bestMatch[1] > 0 ? bestMatch[0] : null;
}

// Check common phrases first (no API call needed)
function getCommonPhraseTranslation(text, targetLang) {
  const textLower = text.toLowerCase().trim();
  
  if (COMMON_PHRASES[textLower]) {
    return COMMON_PHRASES[textLower][targetLang] || null;
  }
  
  return null;
}

// Detect language using translation with null target to get detected source
async function detectLanguage(text) {
  const cacheKey = `detect:${text.substring(0, 50)}`;
  const cached = translationCache.get(cacheKey);
  if (cached) {
    cacheHitsToday++;
    return cached;
  }
  
  // First try fast pattern-based detection (no API call)
  const fastResult = detectLanguageFast(text);
  if (fastResult) {
    console.log(`💡 Fast language detection: ${fastResult} (no API call)`);
    translationCache.set(cacheKey, fastResult);
    return fastResult;
  }
  
  try {
    // Only use API if pattern detection fails
    console.log(`🔍 Using DeepL API for language detection: "${text.substring(0, 30)}..."`);
    apiCallsToday++;
    const result = await translator.translateText(text, null, 'EN-US');
    const langCode = result.detectedSourceLang.toLowerCase();
    translationCache.set(cacheKey, langCode);
    return langCode;
  } catch (error) {
    console.error('Language detection error:', error);
    return 'en'; // Default fallback
  }
}

// Translate text using DeepL
async function translateText(text, targetLang, sourceLang = null) {
  // Check common phrases first (no API call)
  const commonTranslation = getCommonPhraseTranslation(text, targetLang);
  if (commonTranslation) {
    console.log(`💡 Common phrase translation: "${text}" → "${commonTranslation}" (no API call)`);
    commonPhrasesUsed++;
    return commonTranslation;
  }
  
  // Check cache second
  const cacheKey = `${text.substring(0, 100)}:${targetLang}:${sourceLang || 'auto'}`;
  const cached = translationCache.get(cacheKey);
  if (cached) {
    cacheHitsToday++;
    return cached;
  }
  
  try {
    console.log(`🌍 DeepL API translation: "${text.substring(0, 30)}..." (${sourceLang || 'auto'} → ${targetLang})`);
    apiCallsToday++;
    
    // Ensure we have the right language code format
    const targetCode = DEEPL_LANGUAGES[targetLang] || targetLang.toUpperCase();
    
    const result = await translator.translateText(
      text,
      sourceLang || null,
      targetCode,
      {
        preserveFormatting: true,
        formality: 'default',
        splitSentences: 'nonewlines'
      }
    );
    
    const translated = Array.isArray(result) ? result[0].text : result.text;
    
    // Cache the result
    translationCache.set(cacheKey, translated);
    
    // Track usage for smart caching
    trackTranslationUsage(text, targetLang, translated);
    
    return translated;
  } catch (error) {
    console.error('Translation error:', error);
    throw error;
  }
}

// Get user's preferred language
async function getUserLanguage(userId) {
  console.log(`🔍 getUserLanguage called for userId: ${userId}`);
  
  if (userPreferences.has(userId)) {
    console.log(`📋 Found user ${userId} in memory cache`);
    return userPreferences.get(userId);
  }
  
  console.log(`📋 User ${userId} not in memory, checking Redis...`);
  try {
    if (redisClient && redisAvailable) {
      console.log(`📋 Redis is open, querying for user:${userId}:lang`);
      const lang = await redisClient.get(`user:${userId}:lang`);
      console.log(`📋 Redis returned: ${lang}`);
      if (lang) {
        userPreferences.set(userId, lang);
        console.log(`📋 Cached user ${userId} language: ${lang}`);
        return lang;
      }
    }
    console.log(`📋 Redis not available or no language found for user ${userId}`);
  } catch (error) {
    console.log('Redis not available for user preferences');
    console.error('📋 Redis error details:', error);
  }
  
  console.log(`📋 Defaulting user ${userId} to English`);
  return 'en'; // Default
}

// Set user's preferred language
async function setUserLanguage(userId, lang) {
  userPreferences.set(userId, lang);
  console.log(`💾 Set user ${userId} language to ${lang}`);
  try {
    if (redisClient && redisAvailable) {
      await redisClient.set(`user:${userId}:lang`, lang);
      console.log(`💾 Also saved to Redis`);
    }
  } catch (error) {
    console.log('Redis not available for user preferences, using memory only');
  }
}

// Get channel's primary language
async function getChannelLanguage(channelId) {
  // Check in-memory first
  if (channelPreferences.has(channelId)) {
    const lang = channelPreferences.get(channelId);
    console.log(`📺 Channel ${channelId} language from memory: ${lang}`);
    return lang;
  }
  
  try {
    if (redisClient && redisAvailable) {
      const lang = await redisClient.get(`channel:${channelId}:lang`);
      if (lang) {
        channelPreferences.set(channelId, lang);
        console.log(`📺 Channel ${channelId} language from Redis: ${lang}`);
        return lang;
      }
    }
  } catch (error) {
    console.log('Redis not available for channel preferences');
  }
  
  console.log(`📺 Channel ${channelId} language defaulting to: en`);
  return 'en';
}

// Set channel's primary language
async function setChannelLanguage(channelId, lang) {
  channelPreferences.set(channelId, lang);
  console.log(`💾 Set channel ${channelId} language to ${lang}`);
  try {
    if (redisClient && redisAvailable) {
      await redisClient.set(`channel:${channelId}:lang`, lang);
      console.log(`💾 Also saved to Redis`);
    }
  } catch (error) {
    console.log('Redis not available for channel preferences, using memory only');
  }
}

// Store message language
async function storeMessageLanguage(channel, ts, language) {
  try {
    if (redisClient && redisAvailable) {
      await redisClient.setEx(
        `msg:${channel}:${ts}:lang`,
        604800, // 7 days
        language
      );
    }
  } catch (error) {
    console.log('Redis not available for message language storage');
  }
}

// Get thread language
async function getThreadLanguage(channel, threadTs) {
  if (!threadTs) return null;
  
  try {
    if (redisClient && redisAvailable) {
      return await redisClient.get(`msg:${channel}:${threadTs}:lang`);
    }
  } catch (error) {
    console.log('Redis not available for thread language');
  }
  
  return null;
}

// Detect channel language from recent messages
async function detectChannelLanguage(client, channelId) {
  try {
    console.log(`🔍 Detecting channel language from recent messages (cost-optimized)...`);
    
    const history = await client.conversations.history({
      channel: channelId,
      limit: 3 // Reduced from 10 to 3 for cost optimization
    });
    
    const langCounts = {};
    let analyzed = 0;
    
    for (const msg of history.messages) {
      if (msg.text && !msg.bot_id && msg.text.length > 10) {
        const lang = await detectLanguage(msg.text);
        langCounts[lang] = (langCounts[lang] || 0) + 1;
        analyzed++;
        console.log(`📝 Message "${msg.text.substring(0, 30)}..." detected as: ${lang}`);
      }
    }
    
    if (analyzed === 0) {
      console.log(`❌ No messages found, defaulting to English`);
      return 'en';
    }
    
    // Get most common language
    const primaryLang = Object.entries(langCounts)
      .sort(([,a], [,b]) => b - a)[0][0];
    
    console.log(`✅ Channel language detected: ${primaryLang} (from ${analyzed} messages, cost-optimized)`);
    return primaryLang;
    
  } catch (error) {
    console.error('❌ Error detecting channel language:', error);
    return 'en'; // Default fallback
  }
}

// Store original message for /translate commands
async function storeOriginalMessage(channel, messageTs, originalText, detectedLang, translatedText, channelLang) {
  const originalData = {
    original: originalText,
    originalLang: detectedLang,
    translated: translatedText,
    translatedLang: channelLang,
    timestamp: Date.now()
  };
  
  const cacheKey = `original:${channel}:${messageTs}`;
  originalMessageCache.set(cacheKey, originalData);
  
  try {
    if (redisClient && redisAvailable) {
      await redisClient.setEx(cacheKey, 604800, JSON.stringify(originalData)); // 7 days
      console.log(`💾 Stored original message for ${messageTs}`);
    }
  } catch (error) {
    console.log('Redis not available for original message storage');
  }
}

// Get original message data
async function getOriginalMessage(channel, messageTs) {
  const cacheKey = `original:${channel}:${messageTs}`;
  
  // Check memory first
  const cached = originalMessageCache.get(cacheKey);
  if (cached) {
    console.log(`📖 Found original message in memory for ${messageTs}`);
    return cached;
  }
  
  // Check Redis
  try {
    if (redisClient && redisAvailable) {
      const stored = await redisClient.get(cacheKey);
      if (stored) {
        const originalData = JSON.parse(stored);
        originalMessageCache.set(cacheKey, originalData);
        console.log(`📖 Found original message in Redis for ${messageTs}`);
        return originalData;
      }
    }
  } catch (error) {
    console.log('Redis not available for original message retrieval');
  }
  
  return null;
}

// SIMPLE INCOMING TRANSLATION - Show any message in your preferred language
app.message(async ({ message, client }) => {
  try {
    // Skip bot messages, edits, and system messages
    if (message.bot_id || message.subtype || !message.text) {
      return;
    }
    
    // Skip translated messages to avoid loops
    if (message.text.includes('🌐') || message.text.includes('Translation:') || message.text.includes('Translated from')) {
      return;
    }
    
    console.log(`📥 Processing message: "${message.text}" from user ${message.user}`);
    
    // Detect message language
    const msgLang = await detectLanguage(message.text);
    console.log(`📝 Message language detected: ${msgLang}`);
    
    // Get channel members to show translations to
    try {
      const channelInfo = await client.conversations.members({
        channel: message.channel,
        limit: 1000
      });
      
      // For each member (except the sender), check if they need a translation
      for (const userId of channelInfo.members) {
        // Skip the sender and bots
        if (userId === message.user) continue;
        
        try {
          // Get user's preferred language
          const userLang = await getUserLanguage(userId);
          console.log(`👤 User ${userId} prefers: ${userLang}, message is: ${msgLang}`);
          
          // If message is already in user's language, skip
          if (msgLang === userLang) {
            console.log(`✅ Message already in user's language`);
            continue;
          }
          
          // Translate to user's language
          const translated = await translateText(message.text, userLang, msgLang);
          console.log(`🌐 Translated for ${userId}: ${translated.substring(0, 50)}...`);
          
          // Show ephemeral translation to this user
          await client.chat.postEphemeral({
            channel: message.channel,
            user: userId,
            text: translated,
            blocks: [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: `🌐 *${msgLang.toUpperCase()} → ${userLang.toUpperCase()}*\n${translated}`
                }
              }
            ]
          });
          
          console.log(`✅ Showed translation to ${userId}`);
          
        } catch (userError) {
          console.log(`❌ Error processing translation for user ${userId}:`, userError.message);
        }
      }
      
    } catch (channelError) {
      console.log(`❌ Error getting channel members:`, channelError.message);
    }
    
  } catch (error) {
    console.error('❌ Translation error:', error);
  }
});

// SIMPLE OUTGOING TRANSLATION - /translate command
app.command('/translate', async ({ command, ack, respond, client }) => {
  await ack();
  
  const messageText = command.text.trim();
  if (!messageText) {
    await respond({
      text: "Please provide a message to translate.\nExample: `/translate guten tag alle zusammen`"
    });
    return;
  }
  
  try {
    console.log(`🔍 Processing /translate command: "${messageText}"`);
    
    // Detect channel language from recent messages
    const channelLang = await detectChannelLanguage(client, command.channel_id);
    console.log(`📺 Channel ${command.channel_id} speaking: ${channelLang}`);
    
    // If user's message is already in channel language, just post as-is
    console.log(`🔍 Detecting language of message: "${messageText}"`);
    const detectedLang = await detectLanguage(messageText);
    console.log(`📝 Message language detected as: ${detectedLang}`);
    if (detectedLang === channelLang) {
      console.log(`✅ Message already in channel language, posting as-is`);
      
      // Get user info to show who wrote the message
      console.log(`👤 Getting user info for: ${command.user_id}`);
      const userInfo = await client.users.info({ user: command.user_id });
      const userName = userInfo.user.real_name || userInfo.user.display_name || userInfo.user.name;
      console.log(`👤 User name resolved: ${userName}`);
      
      console.log(`📤 Posting message as-is to channel: ${command.channel_id}`);
      await client.chat.postMessage({
        channel: command.channel_id,
        text: `*${userName}:* ${messageText}`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*${userName}:* ${messageText}`
            }
          }
        ]
      });
      console.log(`✅ Message posted successfully`);
      
      await respond({
        text: `✅ Message posted (no translation needed - already in ${channelLang.toUpperCase()})`,
        response_type: "ephemeral"
      });
      return;
    }
    
    // Translate message to channel language
    console.log(`🌐 Translating "${messageText}" from ${detectedLang} to ${channelLang}`);
    const translated = await translateText(messageText, channelLang, detectedLang);
    console.log(`🌐 Translated "${messageText}" to: ${translated}`);
    
    // Get user info to show who wrote the message
    console.log(`👤 Getting user info for translated message: ${command.user_id}`);
    const userInfo = await client.users.info({ user: command.user_id });
    const userName = userInfo.user.real_name || userInfo.user.display_name || userInfo.user.name;
    console.log(`👤 User name: ${userName}`);
    
    // Post translated message to channel
    console.log(`📤 Posting translated message to channel: ${command.channel_id}`);
    const postResult = await client.chat.postMessage({
      channel: command.channel_id,
      text: translated,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${userName}:* ${translated}`
          }
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `_Translated from ${detectedLang.toUpperCase()} to ${channelLang.toUpperCase()} via DeepL_`
            }
          ]
        }
      ]
    });
    console.log(`✅ Translated message posted successfully`);
    
    // Store original message for /translate commands
    await storeOriginalMessage(command.channel_id, postResult.ts, messageText, detectedLang, translated, channelLang);
    
    await respond({
      text: `✅ Message translated and posted!`,
      response_type: "ephemeral"
    });
    console.log(`✅ Command completed successfully`);
    
  } catch (error) {
    console.error('❌ Translation error:', error);
    console.error('❌ Error stack:', error.stack);
    await respond({
      text: `❌ Translation failed: ${error.message}`
    });
  }
});

// SLASH COMMANDS

// Set user language preference
app.command('/translate-setup', async ({ command, ack, respond }) => {
  await ack();
  
  const lang = command.text.trim().toLowerCase();
  
  if (!lang) {
    // Show current preference and available languages
    const currentLang = await getUserLanguage(command.user_id);
    const supportedLangs = Object.keys(DEEPL_LANGUAGES).sort();
    
    await respond({
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `🌐 *Your current language: ${currentLang.toUpperCase()}*`
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*To change your language:*\n\`/translate-setup [language]\`\n\nExample: \`/translate-setup es\``
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Supported languages:*\n${supportedLangs.join(', ')}`
          }
        }
      ]
    });
    return;
  }
  
  if (!DEEPL_LANGUAGES[lang]) {
    await respond({
      text: `❌ Language '${lang}' is not supported by DeepL.\nSupported languages: ${Object.keys(DEEPL_LANGUAGES).sort().join(', ')}`
    });
    return;
  }
  
  // Store preference
  await setUserLanguage(command.user_id, lang);
  
  await respond({
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `🎉 *Success! Your language is now set to: ${lang.toUpperCase()}*`
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `✅ *What happens now:*\n• All messages in other languages will be automatically translated to ${lang.toUpperCase()} for you\n• Your messages will be auto-translated to match each channel's language\n• Use \`/translate [message]\` to manually translate and post`
        }
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "💡 _Use `/translate-me` to check your settings anytime_"
          }
        ]
      }
    ]
  });
});

// Check my translation settings
app.command('/translate-me', async ({ command, ack, respond }) => {
  await ack();
  
  try {
    const userLang = await getUserLanguage(command.user_id);
    
    await respond({
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "🌐 Your Translation Settings"
          }
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*Your Language:*\n${userLang.toUpperCase()}`
            },
            {
              type: "mrkdwn",
              text: `*Auto-Translation:*\nEnabled ✅`
            }
          ]
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*How it works for you:*\n• Messages in other languages → translated to ${userLang.toUpperCase()}\n• Your messages → auto-translated to match channel language\n• Use \`/translate [text]\` for manual translation`
          }
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: "_Use `/translate-setup [lang]` to change your language_"
            }
          ]
        }
      ]
    });
  } catch (error) {
    await respond({
      text: `❌ Error getting your settings: ${error.message}`
    });
  }
});

// Set channel primary language
app.command('/translate-channel', async ({ command, ack, respond, client }) => {
  await ack();
  
  await respond({
    text: `ℹ️ *Channel language is now auto-detected!*\n\nNo need to set it manually - when you use \`/translate\`, it automatically detects what language people are speaking in this channel from recent messages.\n\nJust use:\n• \`/translate [your message]\` - Auto-detects channel language and translates\n• \`/translate-setup [lang]\` - Set your personal language`
  });
});

// Check DeepL usage
app.command('/translate-usage', async ({ command, ack, respond }) => {
  await ack();
  
  try {
    const usage = await translator.getUsage();
    const percentage = Math.round((usage.character.count / usage.character.limit) * 100);
    const totalRequests = apiCallsToday + cacheHitsToday + commonPhrasesUsed;
    const apiSavings = totalRequests > 0 ? Math.round(((cacheHitsToday + commonPhrasesUsed) / totalRequests) * 100) : 0;
    
    await respond({
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "📊 DeepL API Usage & Cost Optimization"
          }
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*Characters Used:*\n${usage.character.count.toLocaleString()}`
            },
            {
              type: "mrkdwn",
              text: `*Character Limit:*\n${usage.character.limit.toLocaleString()}`
            },
            {
              type: "mrkdwn",
              text: `*Usage:*\n${percentage}%`
            },
            {
              type: "mrkdwn",
              text: `*Remaining:*\n${(usage.character.limit - usage.character.count).toLocaleString()}`
            }
          ]
        },
        {
          type: "divider"
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*💰 Cost Optimization (Today)*"
          }
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*API Calls:*\n${apiCallsToday}`
            },
            {
              type: "mrkdwn",
              text: `*Cache Hits:*\n${cacheHitsToday}`
            },
            {
              type: "mrkdwn",
              text: `*Common Phrases:*\n${commonPhrasesUsed}`
            },
            {
              type: "mrkdwn",
              text: `*API Savings:*\n${apiSavings}%`
            }
          ]
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `_Smart caching active • ${frequentTranslations.size} learned phrases • Channel detection: 3 messages max_`
            }
          ]
        }
      ]
    });
  } catch (error) {
    await respond({
      text: `❌ Error fetching usage: ${error.message}`
    });
  }
});

// View message in all languages
app.shortcut('translate_message', async ({ shortcut, ack, client }) => {
  await ack();
  
  try {
    const messageTs = shortcut.message.ts;
    const channel = shortcut.channel.id;
    
    // Get original message
    const result = await client.conversations.history({
      channel: channel,
      latest: messageTs,
      limit: 1,
      inclusive: true
    });
    
    const message = result.messages[0];
    if (!message || !message.text) {
      throw new Error('Message not found');
    }
    
    const msgLang = await detectLanguage(message.text);
    
    // Translate to common languages
    const targetLangs = ['en', 'es', 'de', 'fr', 'it', 'pt'].filter(l => l !== msgLang);
    const translations = {};
    
    await Promise.all(
      targetLangs.map(async (lang) => {
        try {
          translations[lang] = await translateText(message.text, lang, msgLang);
        } catch (error) {
          translations[lang] = `Error: ${error.message}`;
        }
      })
    );
    
    // Build modal blocks
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `Original (${msgLang.toUpperCase()})`
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: message.text.substring(0, 3000) // Slack limit
        }
      },
      {
        type: 'divider'
      }
    ];
    
    Object.entries(translations).forEach(([lang, text]) => {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${lang.toUpperCase()}:* ${text.substring(0, 3000)}`
        }
      });
    });
    
    // Show modal
    await client.views.open({
      trigger_id: shortcut.trigger_id,
      view: {
        type: 'modal',
        title: {
          type: 'plain_text',
          text: 'Translations'
        },
        close: {
          type: 'plain_text',
          text: 'Close'
        },
        blocks: blocks
      }
    });
    
  } catch (error) {
    console.error('Translation modal error:', error);
  }
});

// View original message for /translate posts
app.shortcut('view_original', async ({ shortcut, ack, client }) => {
  await ack();
  
  try {
    const messageTs = shortcut.message.ts;
    const channel = shortcut.channel.id;
    
    console.log(`📖 Looking for original message: ${channel}:${messageTs}`);
    
    // Get original message data
    const originalData = await getOriginalMessage(channel, messageTs);
    
    if (!originalData) {
      await client.views.open({
        trigger_id: shortcut.trigger_id,
        view: {
          type: 'modal',
          title: {
            type: 'plain_text',
            text: 'Original Message'
          },
          close: {
            type: 'plain_text',
            text: 'Close'
          },
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '❌ *No original message found*\n\nThis message was not posted using the `/translate` command, or the original has expired (older than 7 days).'
              }
            }
          ]
        }
      });
      return;
    }
    
    // Show modal with original and translated versions
    await client.views.open({
      trigger_id: shortcut.trigger_id,
      view: {
        type: 'modal',
        title: {
          type: 'plain_text',
          text: 'Original Message'
        },
        close: {
          type: 'plain_text',
          text: 'Close'
        },
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: `Original (${originalData.originalLang.toUpperCase()})`
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `> ${originalData.original}`
            }
          },
          {
            type: 'divider'
          },
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: `Translated (${originalData.translatedLang.toUpperCase()})`
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `> ${originalData.translated}`
            }
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `_Translated via DeepL • ${new Date(originalData.timestamp).toLocaleString()}_`
              }
            ]
          }
        ]
      }
    });
    
  } catch (error) {
    console.error('View original error:', error);
  }
});

// Help command
app.command('/translate-help', async ({ command, ack, respond }) => {
  await ack();
  
  await respond({
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "🌐 Slacklator Help"
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Available Commands:*"
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "• `/translate-setup [language]` - Set your preferred language\n• `/translate-me` - Check your current translation settings\n• `/translate [message]` - Translate and post your message\n• `/translate-usage` - Check DeepL API usage\n• `/translate-help` - Show this help"
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*How it works:*\n1. *Incoming*: Messages in other languages automatically appear translated for you\n2. *Outgoing*: Use `/translate hello` to automatically detect what language the channel is speaking and translate your message\n3. *Smart*: No setup needed - channel language auto-detected from recent messages"
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Message Actions:*\n• Right-click any message → 'Translate message' to view in all languages\n• Right-click translated messages → 'View original' to see the original text before translation"
        }
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Supported languages: ${Object.keys(DEEPL_LANGUAGES).sort().join(', ')}`
          }
        ]
      }
    ]
  });
});

// Add simple HTTP server for Render port binding requirement
const http = require('http');
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'healthy', 
      app: 'Slacklator',
      mode: 'Socket Mode',
      timestamp: new Date().toISOString()
    }));
  } else {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('🌐 Slacklator is running via Socket Mode!');
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`📡 Health server listening on port ${PORT} (for Render)`);
});

// Keep-alive mechanism for Render free tier (prevents spin-down)
if (process.env.RENDER) {
  const RENDER_URL = process.env.RENDER_EXTERNAL_URL || `https://your-app.onrender.com`;
  
  setInterval(async () => {
    try {
      const https = require('https');
      const http = require('http');
      const url = require('url');
      
      const parsedUrl = url.parse(`${RENDER_URL}/health`);
      const client = parsedUrl.protocol === 'https:' ? https : http;
      
      const req = client.request(parsedUrl, (res) => {
        console.log(`🔄 Keep-alive ping: ${res.statusCode}`);
      });
      
      req.on('error', (err) => {
        console.log(`⚠️  Keep-alive ping failed: ${err.message}`);
      });
      
      req.end();
    } catch (error) {
      console.log(`⚠️  Keep-alive error: ${error.message}`);
    }
  }, 5 * 60 * 1000); // Every 5 minutes
  
  console.log('🔄 Keep-alive mechanism activated for Render deployment');
}

// Start the app
(async () => {
  // Redis connection is already handled above, no need to connect again here
  if (!redisClient) {
    console.log('⚠️  Running without Redis - preferences won\'t persist');
  }
  
  await app.start();
  console.log('⚡️ Slacklator is running with DeepL!');
  
  // Test DeepL connection
  try {
    const usage = await translator.getUsage();
    console.log(`✅ DeepL connected - ${usage.character.count.toLocaleString()} / ${usage.character.limit.toLocaleString()} characters used`);
  } catch (error) {
    console.error('❌ DeepL connection error:', error);
  }
})();

// Error handling
process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
}); 