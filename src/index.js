/**
 * Smart Router Proxy
 * Intercepts Anthropic API calls and routes to appropriate model based on complexity
 */

const express = require('express');
const axios = require('axios');
const { classify: classifyHeuristics } = require('./classifier');
const { classify: classifyOllama, isOllamaAvailable } = require('./ollama-classifier');

const app = express();

// Track Ollama availability
let ollamaAvailable = false;
app.use(express.json({ limit: '50mb' }));

// Configuration
const CONFIG = {
  port: process.env.PORT || 8080,
  anthropicUrl: 'https://api.anthropic.com',
  
  // Model routing
  simpleModel: process.env.SIMPLE_MODEL || 'claude-3-5-haiku-20241022',
  mediumModel: process.env.MEDIUM_MODEL || 'claude-sonnet-4-20250514',
  complexModel: process.env.COMPLEX_MODEL || 'claude-opus-4-20250514',
  
  // Thresholds (0-1)
  simpleThreshold: parseFloat(process.env.SIMPLE_THRESHOLD) || 0.35,
  complexThreshold: parseFloat(process.env.COMPLEX_THRESHOLD) || 0.65,
  
  // Logging
  verbose: process.env.VERBOSE === 'true',
  
  // Override - always use this model if set
  forceModel: process.env.FORCE_MODEL || null,
  
  // Disable routing (passthrough mode)
  disabled: process.env.DISABLED === 'true',
};

// Stats tracking
const stats = {
  total: 0,
  routed: { simple: 0, medium: 0, complex: 0 },
  saved: 0, // Estimated tokens saved by downgrading
};

/**
 * Extract user message from request body
 */
function extractPrompt(body) {
  if (!body.messages || !Array.isArray(body.messages)) {
    return '';
  }
  
  // Get the last user message
  const userMessages = body.messages.filter(m => m.role === 'user');
  if (userMessages.length === 0) return '';
  
  const lastMessage = userMessages[userMessages.length - 1];
  
  // Handle string or content array
  if (typeof lastMessage.content === 'string') {
    return lastMessage.content;
  }
  
  if (Array.isArray(lastMessage.content)) {
    return lastMessage.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('\n');
  }
  
  return '';
}

/**
 * Log routing decision
 */
function logDecision(originalModel, newModel, classification, prompt) {
  const changed = originalModel !== newModel;
  const arrow = changed ? '→' : '=';
  const color = changed ? '\x1b[33m' : '\x1b[32m'; // Yellow if changed, green if same
  const reset = '\x1b[0m';
  const source = classification.source === 'ollama' ? '🧠' : '📏';
  
  console.log(`${source} ${color}[${classification.tier.toUpperCase()}]${reset} Score: ${classification.score.toFixed(2)} | ${originalModel} ${arrow} ${newModel}`);
  
  if (CONFIG.verbose) {
    console.log(`  Prompt: "${prompt.substring(0, 80)}${prompt.length > 80 ? '...' : ''}"`);
  }
}

/**
 * Main proxy handler for /v1/messages
 */
app.post('/v1/messages', async (req, res) => {
  stats.total++;
  
  const originalModel = req.body.model;
  const prompt = extractPrompt(req.body);
  
  // Classify and determine target model
  let targetModel = originalModel;
  let classification = { tier: 'passthrough', score: 0, source: 'none' };
  
  if (!CONFIG.disabled && !CONFIG.forceModel) {
    const classifyConfig = {
      simpleModel: CONFIG.simpleModel,
      mediumModel: CONFIG.mediumModel,
      complexModel: CONFIG.complexModel,
      simpleThreshold: CONFIG.simpleThreshold,
      complexThreshold: CONFIG.complexThreshold,
    };
    
    // Try Ollama first, fallback to heuristics
    if (ollamaAvailable) {
      classification = await classifyOllama(prompt, classifyConfig);
    }
    
    // Fallback to heuristics if Ollama failed or unavailable
    if (!classification || classification.source !== 'ollama') {
      classification = classifyHeuristics(prompt, classifyConfig);
      classification.source = 'heuristics';
    }
    
    targetModel = classification.model;
    stats.routed[classification.tier]++;
    
    // Track "savings" when downgrading from opus
    if (originalModel?.includes('opus') && !targetModel.includes('opus')) {
      stats.saved++;
    }
  } else if (CONFIG.forceModel) {
    targetModel = CONFIG.forceModel;
    classification = { tier: 'forced', score: 0, source: 'forced' };
  }
  
  logDecision(originalModel, targetModel, classification, prompt);
  
  // Modify request
  const modifiedBody = {
    ...req.body,
    model: targetModel,
  };
  
  // Forward to Anthropic
  try {
    const response = await axios({
      method: 'POST',
      url: `${CONFIG.anthropicUrl}/v1/messages`,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': req.headers['x-api-key'],
        'anthropic-version': req.headers['anthropic-version'] || '2023-06-01',
        'anthropic-beta': req.headers['anthropic-beta'],
      },
      data: modifiedBody,
      responseType: req.body.stream ? 'stream' : 'json',
    });
    
    // Handle streaming responses
    if (req.body.stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      response.data.pipe(res);
    } else {
      res.status(response.status).json(response.data);
    }
  } catch (error) {
    console.error('Proxy error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data || { message: error.message },
    });
  }
});

/**
 * Pass through other endpoints
 */
app.all(/.*/, async (req, res) => {
  try {
    const response = await axios({
      method: req.method,
      url: `${CONFIG.anthropicUrl}${req.path}`,
      headers: {
        ...req.headers,
        host: 'api.anthropic.com',
      },
      data: req.body,
    });
    res.status(response.status).json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.response?.data || { message: error.message },
    });
  }
});

/**
 * Stats endpoint
 */
app.get('/_stats', (req, res) => {
  res.json({
    ...stats,
    config: {
      simpleModel: CONFIG.simpleModel,
      mediumModel: CONFIG.mediumModel,
      complexModel: CONFIG.complexModel,
      thresholds: {
        simple: CONFIG.simpleThreshold,
        complex: CONFIG.complexThreshold,
      },
    },
  });
});

/**
 * Health check
 */
app.get('/_health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Start server
async function start() {
  // Check Ollama availability
  ollamaAvailable = await isOllamaAvailable();
  
  app.listen(CONFIG.port, () => {
    const classifierStatus = ollamaAvailable 
      ? '🧠 Ollama (accurate)' 
      : '📏 Heuristics (fast)';
    
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║              🧠 Smart Router Proxy v1.0                    ║
╠═══════════════════════════════════════════════════════════╣
║  Listening on: http://localhost:${CONFIG.port}                    ║
║  Classifier:   ${classifierStatus.padEnd(35)}║
║                                                           ║
║  Model Routing:                                           ║
║    Simple  (< ${CONFIG.simpleThreshold.toFixed(2)}) → ${CONFIG.simpleModel.padEnd(28)}║
║    Medium  (< ${CONFIG.complexThreshold.toFixed(2)}) → ${CONFIG.mediumModel.padEnd(28)}║
║    Complex (≥ ${CONFIG.complexThreshold.toFixed(2)}) → ${CONFIG.complexModel.padEnd(28)}║
║                                                           ║
║  Usage:                                                   ║
║    export ANTHROPIC_BASE_URL=http://localhost:${CONFIG.port}      ║
║    claude  # Now auto-routes based on complexity          ║
║                                                           ║
║  Stats: http://localhost:${CONFIG.port}/_stats                    ║
╚═══════════════════════════════════════════════════════════╝
    `);
    
    if (!ollamaAvailable) {
      console.log('  💡 For better accuracy, install Ollama:');
      console.log('     curl -fsSL https://ollama.com/install.sh | sh');
      console.log('     ollama pull phi3:mini');
      console.log('');
    }
  });
}

start();
