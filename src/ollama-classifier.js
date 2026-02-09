/**
 * Ollama-based Complexity Classifier
 * Uses local LLM for accurate prompt classification
 */

const axios = require('axios');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'phi3:mini';

const CLASSIFICATION_PROMPT = `You are a prompt complexity classifier. Rate the complexity of the following task/prompt on a scale of 1-10.

1-3: Simple tasks (quick questions, definitions, simple formatting, typo fixes)
4-6: Medium tasks (write a function, create a component, fix a bug, add a feature)
7-10: Complex tasks (system architecture, security audits, complex debugging, multi-step planning, distributed systems)

Respond with ONLY a single number from 1-10. Nothing else.

Task to classify:
"""
{PROMPT}
"""

Complexity (1-10):`;

/**
 * Call Ollama for classification
 */
async function classifyWithOllama(prompt, timeout = 5000) {
  const classificationRequest = CLASSIFICATION_PROMPT.replace('{PROMPT}', prompt.substring(0, 1000));
  
  try {
    const response = await axios.post(
      `${OLLAMA_URL}/api/generate`,
      {
        model: OLLAMA_MODEL,
        prompt: classificationRequest,
        stream: false,
        options: {
          temperature: 0.1,
          num_predict: 5,
        },
      },
      { timeout }
    );
    
    const text = response.data.response.trim();
    const score = parseInt(text.match(/\d+/)?.[0] || '5', 10);
    
    // Normalize to 0-1
    return Math.max(0, Math.min(1, score / 10));
  } catch (error) {
    console.error('Ollama classification failed:', error.message);
    return null; // Fallback to heuristics
  }
}

/**
 * Check if Ollama is available
 */
async function isOllamaAvailable() {
  try {
    const response = await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 2000 });
    const models = response.data.models || [];
    return models.some(m => m.name.includes(OLLAMA_MODEL.split(':')[0]));
  } catch {
    return false;
  }
}

/**
 * Get model recommendation based on Ollama score
 */
function getModelForScore(score, config = {}) {
  const thresholds = {
    simple: config.simpleThreshold || 0.35,
    complex: config.complexThreshold || 0.65,
  };
  
  const models = {
    simple: config.simpleModel || 'claude-3-5-haiku-20241022',
    medium: config.mediumModel || 'claude-sonnet-4-20250514',
    complex: config.complexModel || 'claude-opus-4-20250514',
  };
  
  if (score < thresholds.simple) {
    return { model: models.simple, tier: 'simple', score };
  } else if (score < thresholds.complex) {
    return { model: models.medium, tier: 'medium', score };
  } else {
    return { model: models.complex, tier: 'complex', score };
  }
}

/**
 * Main classifier with Ollama
 */
async function classify(prompt, config = {}) {
  const score = await classifyWithOllama(prompt);
  
  if (score === null) {
    // Ollama failed, return null to trigger heuristics fallback
    return null;
  }
  
  const recommendation = getModelForScore(score, config);
  
  return {
    ...recommendation,
    source: 'ollama',
    prompt: typeof prompt === 'string' ? prompt.substring(0, 100) + '...' : '[object]',
  };
}

module.exports = {
  classify,
  classifyWithOllama,
  isOllamaAvailable,
  getModelForScore,
};
