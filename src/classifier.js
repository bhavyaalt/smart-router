/**
 * Local Complexity Classifier
 * Scores prompts 0-1 based on complexity
 * No API calls - pure heuristics + optional Ollama
 */

// Complexity indicators (high complexity)
const COMPLEX_PATTERNS = [
  /architect/i,
  /design.*system/i,
  /implement.*from scratch/i,
  /debug.*complex/i,
  /debug.*race.?condition/i,
  /race.?condition/i,
  /payment.*processing/i,
  /only.*happens/i,
  /optimize.*performance/i,
  /refactor.*entire/i,
  /security.*audit/i,
  /audit/i,
  /multi.?step/i,
  /step.?by.?step.*plan/i,
  /comprehensive/i,
  /in.?depth.*analysis/i,
  /compare.*contrast.*multiple/i,
  /trade.?offs/i,
  /edge.?cases/i,
  /error.?handling/i,
  /scalab/i,
  /distributed/i,
  /concurren/i,
  /async.*complex/i,
  /state.?machine/i,
  /algorithm/i,
  /data.?structure/i,
  /migration.*strategy/i,
  /breaking.*change/i,
  /backward.*compat/i,
  /vulnerabilit/i,
  /rollback/i,
  /high.?load/i,
  /circuit.?breaker/i,
  /microservice/i,
];

// Simple task indicators (low complexity)
const SIMPLE_PATTERNS = [
  /^what is/i,
  /^what's/i,
  /^how do i/i,
  /^explain.*briefly/i,
  /^define/i,
  /^list/i,
  /^summarize/i,
  /^translate/i,
  /fix.*typo/i,
  /simple.*question/i,
  /quick.*question/i,
  /^yes or no/i,
  /^true or false/i,
  /format.*this/i,
  /convert.*to/i,
  /^rename/i,
  /add.*comment/i,
  /remove.*unused/i,
  /^what does.*mean/i,
  /^can you.*explain/i,
];

// Medium complexity patterns
const MEDIUM_PATTERNS = [
  /write.*function/i,
  /create.*component/i,
  /implement.*feature/i,
  /add.*endpoint/i,
  /fix.*bug/i,
  /update.*to/i,
  /modify/i,
  /change.*behavior/i,
  /test.*for/i,
  /write.*test/i,
];

/**
 * Count code blocks and their size
 */
function analyzeCodeContent(text) {
  const codeBlocks = text.match(/```[\s\S]*?```/g) || [];
  const totalCodeLines = codeBlocks.reduce((acc, block) => {
    return acc + block.split('\n').length;
  }, 0);
  return { codeBlocks: codeBlocks.length, codeLines: totalCodeLines };
}

/**
 * Calculate complexity score (0-1)
 */
function calculateComplexity(prompt) {
  let score = 0.5; // Start neutral
  
  const text = typeof prompt === 'string' ? prompt : JSON.stringify(prompt);
  const wordCount = text.split(/\s+/).length;
  const { codeBlocks, codeLines } = analyzeCodeContent(text);
  
  // Length-based scoring
  if (wordCount < 20) score -= 0.15;
  else if (wordCount < 50) score -= 0.05;
  else if (wordCount > 200) score += 0.1;
  else if (wordCount > 500) score += 0.2;
  
  // Code content scoring
  if (codeLines > 100) score += 0.15;
  else if (codeLines > 50) score += 0.1;
  else if (codeBlocks > 0 && codeLines < 20) score -= 0.05;
  
  // Pattern matching
  let complexMatches = 0;
  let simpleMatches = 0;
  let mediumMatches = 0;
  
  for (const pattern of COMPLEX_PATTERNS) {
    if (pattern.test(text)) complexMatches++;
  }
  
  for (const pattern of SIMPLE_PATTERNS) {
    if (pattern.test(text)) simpleMatches++;
  }
  
  for (const pattern of MEDIUM_PATTERNS) {
    if (pattern.test(text)) mediumMatches++;
  }
  
  // Apply pattern scores
  score += complexMatches * 0.08;
  score -= simpleMatches * 0.1;
  score += mediumMatches * 0.03;
  
  // Question marks suggest simpler queries
  const questionMarks = (text.match(/\?/g) || []).length;
  if (questionMarks > 0 && wordCount < 30) score -= 0.1;
  
  // Multiple questions or requirements suggest complexity
  if (questionMarks > 3) score += 0.1;
  
  // Numbered lists suggest multi-step tasks
  const numberedItems = (text.match(/^\d+\./gm) || []).length;
  if (numberedItems > 3) score += 0.15;
  
  // Clamp to 0-1
  return Math.max(0, Math.min(1, score));
}

/**
 * Get model recommendation based on complexity
 */
function getModelForComplexity(score, config = {}) {
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
 * Main classifier function
 */
function classify(prompt, config = {}) {
  const score = calculateComplexity(prompt);
  const recommendation = getModelForComplexity(score, config);
  
  return {
    ...recommendation,
    prompt: typeof prompt === 'string' ? prompt.substring(0, 100) + '...' : '[object]',
  };
}

module.exports = {
  classify,
  calculateComplexity,
  getModelForComplexity,
};
