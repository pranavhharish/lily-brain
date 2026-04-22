# PartSelect Chat Agent — Lily

A conversational AI assistant for refrigerator and dishwasher parts selection, repair guidance, and order tracking. Built with a LangGraph agent pipeline, Supabase pgvector search, FastAPI streaming backend, and a Next.js chat UI.

---

## Features

- **Scoped assistant** — answers only refrigerator and dishwasher parts/repair questions; off-topic messages are rejected at both the frontend and backend
- **LangGraph ReAct agent** — reason → act → observe loop with parallel tool execution (up to 5 iterations)
- **Semantic search** — pgvector cosine similarity over parts, repair guides, and blog posts via Supabase
- **Streaming responses** — FastAPI SSE → Next.js route → browser renders tokens in real time
- **Part cards** — structured part data rendered as UI cards alongside the text response
- **Order tracking** — looks up order status by order ID from Supabase
- **Dual layout** — responsive mobile and desktop chat UI

---

## Architecture

```
Browser
  → POST /api/chat  (Next.js route handler)
      │  frontend scope guard (keyword + regex, no LLM)
      ↓
  FastAPI  /chat  (SSE stream)
      │
      └─ LangGraph agent
            scope_guard → reason → act → observe ⟳
                                   └─ respond
            token / part_card / done events
```

```
.
├── data/                 # CSV datasets (parts, repair guides, blog posts)
├── backend/              # FastAPI + LangGraph agent
│   ├── main.py           # /chat (SSE), /reset, /health
│   ├── agents/           # LangGraph graph, nodes, state
│   ├── db/               # Supabase client, OpenAI embeddings, query functions
│   ├── loader/           # One-time CSV → Supabase ingest
│   ├── models/           # Pydantic models
│   └── tools/            # LangChain tools (search, repair, blog, orders)
└── frontend/             # Next.js 14 App Router
    ├── app/              # page.tsx (chat UI), api/chat/route.ts (proxy)
    ├── components/       # Chat UI components
    └── lib/              # Types, intent helpers
```

---

## Prerequisites

- Python 3.11+
- Node.js 18+
- Supabase project with pgvector enabled and schema applied
- OpenAI API key

---

## Setup

### 1. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Create `backend/.env`:

```env
OPENAI_API_KEY=sk-...
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=<anon-or-service-role-key>
```

### 2. Frontend

```bash
cd frontend
npm install
```

Create `frontend/.env.local`:

```env
FASTAPI_URL=http://localhost:8000
```

### 3. Load data into Supabase

After applying the Supabase schema (see below), seed the database from the CSV files in `data/`:

```bash
cd backend
python -m loader.load_csv
```

This generates OpenAI embeddings (`text-embedding-3-small`, 1536 dims) and upserts all rows in batches of 100.

---

## Supabase Schema

Tables required:

| Table | Key columns |
|-------|-------------|
| `parts` | `ps_number` (PK), `name`, `brand`, `appliance_type`, `price`, `symptoms[]`, `replaces_parts[]`, `embedding vector(1536)` |
| `repair_guides` | `id`, `appliance_type`, `symptom`, `description`, `parts_needed[]`, `source_url`, `embedding vector(1536)` |
| `blog_posts` | `id`, `title`, `url`, `embedding vector(1536)` |
| `orders` | `order_id` (PK), `status`, `carrier`, `tracking_number`, `estimated_delivery`, `items jsonb` |

RPC functions required (pgvector cosine similarity):
- `match_parts(query_embedding, match_count, filter_appliance_type?)`
- `match_repair_guides(query_embedding, match_count, filter_appliance_type?)`
- `match_blog_posts(query_embedding, match_count)`

---

## Running

**Backend:**
```bash
cd backend
uvicorn main:app --reload
# → http://localhost:8000
```

**Frontend:**
```bash
cd frontend
npm run dev
# → http://localhost:3000
```

---

## Agent Design

The LangGraph agent runs a **scope_guard → reason → act → observe** loop:

| Node | Role |
|------|------|
| `scope_guard` | Regex + keyword pre-filter. Rejects off-topic on first message. No LLM call. |
| `reason` | `gpt-4o-mini` with tools bound. Produces tool calls or a final response. |
| `act` | Executes all tool calls in parallel via `asyncio.gather`. |
| `observe` | Routes: loops back to `reason` if tool results present, else exits to `respond`. |
| `respond` | Passthrough. Streaming is handled by `main.py` via `astream_events`. |

Maximum 5 reason/act iterations per request. Sessions are stored in-memory with a 1-hour TTL and a 500-session cap.

### Tools

| Tool | Description |
|------|-------------|
| `search_parts_tool` | Semantic search over parts by symptom/description |
| `get_part_details_tool` | Exact lookup by PS number |
| `troubleshoot_tool` | Semantic search over repair guides |
| `search_blog_tool` | Semantic search over blog/how-to articles |
| `get_order_status_tool` | Order lookup by order ID |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| LLM | OpenAI `gpt-4o-mini` (streaming) |
| Embeddings | OpenAI `text-embedding-3-small` (1536 dims) |
| Agent framework | LangGraph + LangChain |
| Backend | FastAPI + uvicorn |
| Database / vector search | Supabase (PostgreSQL + pgvector) |
| Frontend | Next.js 14 App Router, TypeScript, Tailwind CSS |
