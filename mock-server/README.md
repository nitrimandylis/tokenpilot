# Mock API Server

Mock server for testing TokenPilot with simulated Anthropic and OpenAI API responses. Useful when you don't have access to Admin APIs.

## Quick Start

```bash
# 1. Start the mock server
bun run mock-server/server.ts

# 2. In another terminal, start Next.js with mock URL
MOCK_API_URL=http://localhost:3456 npm run dev
```

## Environment Variables

Set `MOCK_API_URL` in `.env.local` to redirect API calls to the mock server:

```bash
MOCK_API_URL=http://localhost:3456
```

## Endpoints

### Anthropic

- `GET /api/anthropic/v1/organizations/me` - Organization info
- `GET /api/anthropic/v1/organizations/workspaces` - List workspaces
- `GET /api/anthropic/v1/organizations/usage_report/messages` - Usage data

Query params:

- `start_date` / `end_date` - Date range (ISO format)
- `group_by` - Group by model, api_key_id, workspace_id
- `limit` - Results per page (default 1000)
- `page` - Page number (default 0)

### OpenAI

- `GET /api/openai/v1/organization/projects` - List projects
- `GET /api/openai/v1/organization/usage/completions` - Completions usage
- `GET /api/openai/v1/organization/usage/embeddings` - Embeddings usage
- `GET /api/openai/v1/organization/usage/audio_speeches` - TTS usage
- `GET /api/openai/v1/organization/usage/audio_transcriptions` - Whisper usage
- `GET /api/openai/v1/organization/usage/images` - DALL-E usage
- `GET /api/openai/v1/organization/usage/moderations` - Moderations usage
- `GET /api/openai/v1/organization/costs` - Cost breakdown

Query params:

- `start_time` / `end_time` - Unix timestamps
- `group_by` - Group by project_id, model
- `limit` - Results per page
- `page` - Page number

## Data Generation

The mock server generates randomized usage data designed to trigger all 6 recommendation rules:

1. **Model Downgrade** - Low output tokens (50-150 avg)
2. **RAG Context Bloat** - High input:output ratio (>12:1)
3. **Prompt Caching Miss** - Low cache rate with high volume
4. **Model Upgrade (Opus/O1)** - Legacy models with moderate output
5. **Batch API Candidate** - Burst traffic patterns
6. **Legacy Model** - Old generation models

Each request generates different random scenarios, so running multiple analyses will eventually trigger all rules.
