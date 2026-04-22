# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PartSelect Chat Agent ("Lily") is a conversational AI for refrigerator and dishwasher parts selection and repair guidance. It uses a LangGraph agent pipeline with Supabase (pgvector) for semantic search and a Next.js frontend with a FastAPI streaming backend.

## Repository Layout

```
.
├── data/                          # Raw CSV datasets (not committed to git if large)
│   ├── all_parts.csv
│   ├── all_repairs.csv
│   └── partselect_blogs.csv
├── backend/
│   ├── main.py                    # FastAPI app — /chat (SSE), /reset, /health
│   ├── config.py                  # pydantic-settings: OPENAI_API_KEY, SUPABASE_URL/KEY
│   ├── requirements.txt
│   ├── .env                       # backend secrets (gitignored)
│   ├── agents/
│   │   ├── graph.py               # LangGraph StateGraph definition
│   │   ├── nodes.py               # scope_guard, reason, act, observe, respond nodes
│   │   └── state.py               # AgentState TypedDict + get_initial_state()
│   ├── db/
│   │   ├── client.py              # Supabase + OpenAI clients, embed_text/embed_batch
│   │   └── queries.py             # search_parts, search_repair_guides, search_blog, get_order_status
│   ├── loader/
│   │   └── load_csv.py            # One-time CSV → Supabase ingest with embeddings
│   ├── models/
│   │   └── part.py                # Pydantic models: Part, RepairGuide, BlogPost, OrderStatus, AgentState
│   └── tools/
│       ├── search.py              # search_parts_tool, get_part_details_tool
│       ├── repair.py              # troubleshoot_tool
│       ├── blog.py                # search_blog_tool
│       └── orders.py              # get_order_status_tool
└── frontend/
    ├── app/
    │   ├── page.tsx               # Chat UI — mobile + desktop layouts, SSE streaming
    │   ├── layout.tsx             # Root layout, fonts
    │   ├── globals.css
    │   └── api/chat/route.ts      # Next.js API route — proxies to FastAPI, parses SSE
    ├── components/                # Chat UI components (bubbles, cards, composer, etc.)
    ├── lib/chat/                  # Message types, intent helpers
    ├── .env.local                 # FASTAPI_URL (default: http://localhost:8000)
    └── next.config.mjs
```

## Setup

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

**`backend/.env`:**
```
OPENAI_API_KEY=sk-...
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_KEY=<anon-or-service-role-key>
```

### Frontend

```bash
cd frontend
npm install
```

**`frontend/.env.local`:**
```
FASTAPI_URL=http://localhost:8000
```

## Running the Application

**Backend (from `backend/`):**
```bash
uvicorn main:app --reload
```

**Frontend (from `frontend/`):**
```bash
npm run dev
```

Open `http://localhost:3000`.

## Loading Data into Supabase

Run once after setting up the Supabase schema:

```bash
cd backend
python -m loader.load_csv
```

`DATA_DIR` resolves to `../data/` (repo root `data/`). The loader upserts parts by `ps_number`, clears and reloads repair guides and blog posts, and generates OpenAI embeddings (`text-embedding-3-small`, 1536 dims) in batches of 100.

## Architecture

### Request Flow

```
Browser
  → POST /api/chat (Next.js route)
      → scope guard (keyword + regex check, short-circuits off-topic)
      → POST /chat (FastAPI, SSE)
          → LangGraph agent:
              scope_guard_node → reason_node → act_node ⟳ (≤5 iterations)
              → respond_node
          → token / part_card / done SSE events
      → parseSseToReplies() → Message[]
  → UI renders text + ProductCard components
```

### LangGraph Agent (`backend/agents/`)

```
START → scope_guard
  ├─ (out of scope) → respond → END
  └─ (in scope)     → reason → act → observe
                                        ├─ (tool results / more tools needed) → reason
                                        └─ (done) → respond → END
```

- **scope_guard_node** — regex hard-block + first-message keyword check; no LLM call
- **reason_node** — `ChatOpenAI(gpt-4o-mini)` with tools bound; produces tool calls or final text
- **act_node** — executes all tool calls in parallel via `asyncio.gather`
- **observe_node** — routing function; loops back to reason if ToolMessages present, else respond
- **respond_node** — passthrough; streaming happens in `main.py` via `astream_events`

### Session Management

In-memory dict in `main.py` keyed by `session_id`. TTL: 1 hour. Cap: 500 sessions. Only `HumanMessage` and plain `AIMessage` (no `tool_calls`) are persisted to avoid OpenAI 400 errors on the next turn.

### Supabase Schema (expected)

Tables: `parts`, `repair_guides`, `blog_posts`, `orders`
RPC functions: `match_parts`, `match_repair_guides`, `match_blog_posts` (pgvector cosine similarity)

### Frontend (`frontend/`)

- **`app/page.tsx`** — single page, mobile (`< lg`) + desktop (`≥ lg`) layouts, per-session state
- **`app/api/chat/route.ts`** — Next.js Route Handler: runs frontend scope guard, proxies to FastAPI, accumulates SSE and returns `{ replies: Message[] }`
- **`components/chat/`** — `AssistantBubble`, `UserBubble`, `ProductCard`, `OrderTimeline`, `DiagnosticCard`, `Chips`, `Composer`, `TypingDots`

### LLM Configuration

| Purpose | Model |
|---------|-------|
| Chat / tool calling | `gpt-4o-mini` (streaming) |
| Embeddings | `text-embedding-3-small` (1536 dims) |

All tool calls happen server-side in the LangGraph agent. The frontend scope guard is a fast regex/keyword pre-filter that avoids a backend round-trip for obvious off-topic messages.
