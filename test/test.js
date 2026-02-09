/**
 * Test the classifier
 */

const { classify, calculateComplexity } = require('../src/classifier');

const testCases = [
  // Simple prompts (should score < 0.35)
  { prompt: "What is TypeScript?", expected: 'simple' },
  { prompt: "what's 2+2", expected: 'simple' },
  { prompt: "Explain briefly what React does", expected: 'simple' },
  { prompt: "Fix typo in this word: helo", expected: 'simple' },
  { prompt: "List 5 programming languages", expected: 'simple' },
  { prompt: "yes or no: is JavaScript typed?", expected: 'simple' },
  
  // Medium prompts (should score 0.35-0.65)
  { prompt: "Write a function to reverse a string in JavaScript", expected: 'medium' },
  { prompt: "Create a React component for a login form", expected: 'medium' },
  { prompt: "Fix the bug in this code where users can't log in", expected: 'medium' },
  { prompt: "Add an endpoint to get user profile data", expected: 'medium' },
  { prompt: "Write unit tests for the payment service", expected: 'medium' },
  
  // Complex prompts (should score >= 0.65)
  { prompt: "Architect a distributed system for handling 1M requests per second with proper caching, load balancing, and database sharding. Consider edge cases and error handling.", expected: 'complex' },
  { prompt: "Debug this complex async race condition in our payment processing system that only happens under high load", expected: 'complex' },
  { prompt: "Design a scalable microservices architecture with proper error handling, circuit breakers, and backward compatibility for our e-commerce platform", expected: 'complex' },
  { prompt: "Implement a custom state machine for our order processing workflow with all edge cases, rollback mechanisms, and audit logging", expected: 'complex' },
  { prompt: "Perform a comprehensive security audit of our authentication system and identify all potential vulnerabilities with trade-offs for each fix", expected: 'complex' },
];

console.log('🧪 Testing Smart Router Classifier\n');
console.log('=' .repeat(70));

let passed = 0;
let failed = 0;

for (const { prompt, expected } of testCases) {
  const result = classify(prompt);
  const match = result.tier === expected;
  
  if (match) {
    passed++;
    console.log(`✅ ${expected.toUpperCase().padEnd(7)} | Score: ${result.score.toFixed(2)} | "${prompt.substring(0, 50)}..."`);
  } else {
    failed++;
    console.log(`❌ Expected ${expected}, got ${result.tier} | Score: ${result.score.toFixed(2)}`);
    console.log(`   Prompt: "${prompt.substring(0, 60)}..."`);
  }
}

console.log('=' .repeat(70));
console.log(`\n📊 Results: ${passed}/${testCases.length} passed (${failed} failed)\n`);

if (failed === 0) {
  console.log('🎉 All tests passed!');
} else {
  console.log('⚠️  Some tests failed - thresholds may need tuning');
}
