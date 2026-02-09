# Smart Router 🧠

Intelligent proxy that automatically routes Anthropic API calls to the appropriate model based on prompt complexity. Save money by using cheaper models for simple tasks.

## How It Works

```
Your Prompt → Smart Router → Complexity Analysis → Route to Best Model
                                   ↓
                    "What is X?" → Haiku ($)
                    "Build Y"    → Sonnet ($$)  
                    "Architect Z"→ Opus ($$$)
```

## Quick Start

```bash
# 1. Start the proxy
npm start

# 2. Point Claude to the proxy
export ANTHROPIC_BASE_URL=http://localhost:8080

# 3. Use Claude normally - it auto-routes!
claude "what is typescript"  # → Haiku
claude "architect a system"  # → Opus
```

## Installation

```bash
git clone <repo>
cd smart-router
npm install
npm start
```

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 8080 | Proxy port |
| `SIMPLE_MODEL` | claude-3-5-haiku-20241022 | Model for simple tasks |
| `MEDIUM_MODEL` | claude-sonnet-4-20250514 | Model for medium tasks |
| `COMPLEX_MODEL` | claude-opus-4-20250514 | Model for complex tasks |
| `SIMPLE_THRESHOLD` | 0.35 | Score below this → simple |
| `COMPLEX_THRESHOLD` | 0.65 | Score above this → complex |
| `VERBOSE` | false | Log full prompts |
| `FORCE_MODEL` | null | Override all routing |
| `DISABLED` | false | Passthrough mode |

## Complexity Scoring

The classifier uses heuristics to score prompts 0-1:

**Simple (< 0.35):**
- "What is...", "Explain briefly..."
- Short questions
- Simple formatting tasks

**Medium (0.35-0.65):**
- "Write a function..."
- "Create a component..."
- Bug fixes, feature additions

**Complex (≥ 0.65):**
- "Architect...", "Design system..."
- Multi-step planning
- Security audits, optimizations
- Large codebases

## API Endpoints

- `POST /v1/messages` - Proxied to Anthropic with smart routing
- `GET /_stats` - View routing statistics
- `GET /_health` - Health check

## Stats Example

```json
{
  "total": 100,
  "routed": {
    "simple": 45,
    "medium": 35,
    "complex": 20
  },
  "saved": 45
}
```

## With Claude Code CLI

```bash
# Terminal 1: Start proxy
cd smart-router && npm start

# Terminal 2: Use Claude with proxy
export ANTHROPIC_BASE_URL=http://localhost:8080
claude
```

Now every prompt is automatically analyzed and routed to the best model!

## Future: Ollama Support

For more accurate classification, install Ollama and a small model:

```bash
ollama pull phi3:mini
export USE_OLLAMA=true
npm start
```

The proxy will use local LLM for classification (still free, more accurate).

## License

MIT
