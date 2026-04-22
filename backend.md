# Backend Architecture

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Technology Stack & Rationale](#2-technology-stack--rationale)
3. [Directory Structure](#3-directory-structure)
4. [End-to-End Request Flow](#4-end-to-end-request-flow)
5. [Layer-by-Layer Breakdown](#5-layer-by-layer-breakdown)
6. [Session Memory Architecture](#6-session-memory-architecture)
7. [The Reasoning Loop](#7-the-reasoning-loop)
8. [Vector Search Architecture](#8-vector-search-architecture)
9. [Streaming Architecture](#9-streaming-architecture)
10. [Design Decisions & Tradeoffs](#10-design-decisions--tradeoffs)
11. [Data Flow by Query Type](#11-data-flow-by-query-type)
12. [Failure Modes & Resilience](#12-failure-modes--resilience)
13. [Security Boundaries](#13-security-boundaries)

---

## 1. System Overview

The backend is a domain-scoped conversational AI that helps users find appliance parts, troubleshoot problems, and track orders — limited strictly to refrigerators and dishwashers.

Three core design principles:

1. **Every answer is grounded.** The agent cannot hallucinate parts or prices because it always retrieves real data before responding. There is no path to answer a parts question without calling a tool first.

2. **The LLM reasons, not routes.** Instead of a hardcoded decision tree, the LLM is given a set of tools and decides at runtime which ones to call, in what order, and when to stop.

3. **The response streams.** Every token is sent to the client as it is generated. Users see text appear immediately rather than waiting for a complete response.

```
User Message
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│                  FastAPI (main.py)                       │
│  POST /chat → StreamingResponse (text/event-stream)      │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│              LangGraph Agent (agents/)                   │
│                                                         │
│  scope_guard → reason → act → [observe] → respond       │
└───────────────────────┬─────────────────────────────────┘
                        │
           ┌────────────┼────────────┐
           ▼            ▼            ▼
     search_parts  troubleshoot  get_order_status
     get_part      search_blog
           │            │
           └────────────┴──────────────────────┐
                                               ▼
┌─────────────────────────────────────────────────────────┐
│           Supabase (PostgreSQL + pgvector)               │
│                                                         │
│  parts  repair_guides  blog_posts  orders               │
│  match_parts()  match_repair_guides()  match_blog()     │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Technology Stack & Rationale

### FastAPI

Chosen over Flask, Django, or Quart for three reasons:

- **Native async.** Every database call is I/O-bound (network to Supabase, network to OpenAI). FastAPI runs on an ASGI event loop natively, so hundreds of concurrent requests can be in-flight without spawning threads.
- **StreamingResponse.** `StreamingResponse` with `text/event-stream` maps directly onto Server-Sent Events — no extra library needed.
- **Automatic validation.** `ChatRequest` bodies are validated by Pydantic automatically. Malformed requests return a 422 before the agent ever runs.

### LangGraph

Chosen over a raw `while True` tool-calling loop or a plain LangChain chain because it makes the agentic loop **explicit and inspectable**.

A raw loop works, but it gives no observability, no clear termination semantics, and no way to stream events by node. LangGraph compiles the graph into a runtime that:

- Emits named events (`on_chat_model_stream`, `on_chain_end`) per node, which `astream_events` exposes
- Enforces a maximum iteration count through state
- Makes the routing logic (`observe_node`) a first-class, testable function

### Supabase + pgvector

Chosen over Pinecone, Weaviate, or FAISS + MySQL because:

- The application has both relational data (parts with prices, orders) and vector data (embeddings). Splitting these into two stores means two connection pools, two query paths, and two sync points. Supabase keeps everything in one PostgreSQL database.
- pgvector's `<=>` cosine distance integrates directly into SQL, so filtering by `appliance_type` and ordering by vector similarity happens in a **single query** with no application-level join.
- Supabase RPC functions (`match_parts`, etc.) let the Python client call typed SQL functions. The heavy SQL stays in the database where it can be tuned with indexes.

### `gpt-4o-mini` for Reasoning

- This is a retrieval-augmented agent. The hard knowledge work is done by vector search. The LLM's job is to decide which tool to call and synthesize the results — tasks that do not require `gpt-4o`.
- `gpt-4o-mini` supports function calling with the same API, at roughly 10× lower cost and ~2× lower latency.

### `text-embedding-3-small` for Embeddings

1536-dimensional vectors. Chosen over `ada-002` (lower quality) and `text-embedding-3-large` (unnecessarily expensive) as the right balance of cost and retrieval quality for appliance part descriptions.

---

## 3. Directory Structure

```
backend/
├── config.py                   # Pydantic-settings: OPENAI_API_KEY, SUPABASE_URL/KEY
│
├── db/
│   ├── client.py               # Supabase singleton, OpenAI singleton, embed_text/embed_batch
│   └── queries.py              # Async query functions: search_parts, search_repair_guides,
│                               # search_blog, get_part_by_ps_number, get_order_status
│
├── models/
│   └── part.py                 # Pydantic: Part, RepairGuide, BlogPost, OrderStatus,
│                               # ChatRequest; TypedDict: AgentState
│
├── tools/
│   ├── search.py               # search_parts_tool, get_part_details_tool
│   ├── repair.py               # troubleshoot_tool
│   ├── blog.py                 # search_blog_tool
│   └── orders.py               # get_order_status_tool
│
├── agents/
│   ├── state.py                # AgentState re-export + get_initial_state()
│   ├── nodes.py                # scope_guard_node, reason_node, act_node,
│   │                           # observe_node, respond_node
│   └── graph.py                # StateGraph definition, compiled agent singleton
│
├── loader/
│   └── load_csv.py             # One-time CSV → Supabase ingest with embeddings
│
├── main.py                     # FastAPI app, CORS, session store, /chat /reset /health
└── requirements.txt
```

**Dependency direction is strictly downward:** `main.py` → `agents/` → `tools/` → `db/` → `config.py`. Nothing imports upward. Any layer can be replaced without touching the layers above it.

---

## 4. End-to-End Request Flow

```
POST /chat  {"message": "my dishwasher is leaking", "session_id": "abc"}
    │
    │  Pydantic validates ChatRequest
    │  StreamingResponse returned immediately — client starts receiving
    │
    ▼
Load session history from _sessions["abc"]
Append HumanMessage("my dishwasher is leaking")
    │
    ▼
agent.astream_events(state, version="v2")
    │
    ├─── scope_guard_node
    │       "leaking", "dishwasher" match SCOPE_KEYWORDS
    │       scope_passed = True
    │
    ├─── reason_node  [LLM call #1]
    │       gpt-4o-mini sees system prompt + conversation history
    │       Returns AIMessage with tool_calls=[troubleshoot_tool("dishwasher leaking")]
    │
    ├─── act_node
    │       Executes troubleshoot_tool("dishwasher leaking")
    │           embed_text()        → OpenAI embeddings API
    │           match_repair_guides() → Supabase RPC → 3 RepairGuide objects
    │       Appends ToolMessage to state["messages"]
    │       structured_parts += [guide1, guide2, guide3]
    │       iteration_count = 1
    │
    ├─── observe_node  → last is ToolMessage → "reason"
    │
    ├─── reason_node  [LLM call #2]
    │       Sees: system + history + AIMessage(tool_calls) + ToolMessage(results)
    │       Streams: "If your dishwasher is leaking..."
    │       [on_chat_model_stream events → token SSE events to client]
    │
    ├─── act_node      → no tool_calls → passthrough
    ├─── observe_node  → AIMessage, no tool_calls → "respond"
    ├─── respond_node  → passthrough → END
    │
    └── on_chain_end → emit part_card for each unique structured_parts entry
        yield {"type": "done"}

Save clean history to _sessions["abc"]
```

Total OpenAI calls: 1 embedding + 2 chat completions.
Total Supabase calls: 1 (`match_repair_guides` RPC).

---

## 5. Layer-by-Layer Breakdown

### 5.1 Configuration — `config.py`

```python
class Settings(BaseSettings):
    OPENAI_API_KEY: str
    SUPABASE_URL: str
    SUPABASE_KEY: str
    model_config = {"env_file": str(Path(__file__).parent / ".env")}
```

`pydantic_settings.BaseSettings` reads from `backend/.env` at startup and validates that all three variables are present. Missing variables fail at import time with a clear error rather than at request time. The `settings` singleton is imported directly by `db/client.py` and `agents/nodes.py` — no scattered `os.getenv()` calls.

### 5.2 Database Client — `db/client.py`

**Supabase client** — `@lru_cache(maxsize=1)` on `get_supabase()` ensures one client instance per process. The Supabase Python client maintains an internal HTTP connection pool; creating a new client per request would add ~50ms of pool setup overhead.

**OpenAI client** — module-level `_openai_client` with a lazy initializer `_get_openai()`. Equivalent to `@lru_cache` but allows the variable to be patched in tests.

`embed_text(text)` is **synchronous by design** — it is always called via `asyncio.to_thread()` in `db/queries.py`, offloading the blocking HTTP call to a thread pool. Keeping it synchronous also allows direct use in the data loader (`loader/load_csv.py`), which runs in a plain synchronous context.

`embed_batch(texts)` sends multiple texts in a single API call and preserves order by sorting on `item.index`. Used by the loader for efficient bulk ingestion (100 texts per API call).

### 5.3 Data Models — `models/part.py`

| Model | Supabase table | Key fields |
|---|---|---|
| `Part` | `parts` | `ps_number` (PK), `symptoms: list[str]`, `replaces_parts: list[str]` |
| `RepairGuide` | `repair_guides` | `id` (UUID), `occurrence_pct: int`, `parts_needed: list[str]` |
| `BlogPost` | `blog_posts` | `id` (UUID), `title`, `url` |
| `OrderStatus` | `orders` | `order_id`, `items: list[dict]` |
| `ChatRequest` | — | `message`, `session_id` |

PostgreSQL `text[]` arrays coerce to `list[str]` and `jsonb` to `list[dict]` automatically through Pydantic.

`AgentState` is a `TypedDict` (not `BaseModel`) because LangGraph requires `TypedDict` for state schemas — it uses the type annotations to merge state updates from node return values.

### 5.4 Query Layer — `db/queries.py`

All five async functions follow the same pattern:

```
1. Embed the query   → asyncio.to_thread(embed_text, query)
2. Query Supabase    → asyncio.to_thread(supabase_rpc_or_table_call)
3. Parse into models → [Model(**row) for row in rows]
4. Return typed list → list[Part] | list[RepairGuide] | ...
```

**Why `asyncio.to_thread`?** The Supabase Python client is synchronous. Called directly from async code, it would block the event loop for 50–200ms per network round-trip. `asyncio.to_thread` runs the blocking call in a thread pool worker while the event loop continues handling other requests.

`get_part_by_ps_number` and `get_order_status` use the PostgREST table API (`.table().select().eq()`) — exact-match primary key lookups, no vector search needed.

`get_order_status` converts `estimated_delivery` from `datetime.date` to `str` before constructing `OrderStatus` to match the `str | None` annotation and ensure clean JSON serialization.

### 5.5 Tools Layer — `tools/`

Each tool is a thin adapter between the LangChain tool protocol and the query layer:

```
@tool docstring  →  OpenAI function-calling schema (auto-generated)
tool arguments   →  query function parameters
query result     →  JSON string (LangChain requires str return)
```

Tools return JSON strings because that is what the OpenAI tool protocol requires — the result goes back to the LLM as a `ToolMessage` with string content. `act_node` then parses the JSON to extract structured data for `structured_parts`.

**Tool docstrings are load-bearing.** The docstring is the exact text sent to the LLM as the tool description. The LLM reads this to decide when to use the tool. Each docstring describes both the use case and the trigger condition ("when user describes a symptom", "ice maker not working, dishwasher leaking").

| Tool | Source | Backend query |
|---|---|---|
| `search_parts_tool(query, appliance_type?)` | `tools/search.py` | `search_parts()` → `match_parts` RPC |
| `get_part_details_tool(ps_number)` | `tools/search.py` | `get_part_by_ps_number()` → table `.eq()` |
| `troubleshoot_tool(query, appliance_type?)` | `tools/repair.py` | `search_repair_guides()` → `match_repair_guides` RPC |
| `search_blog_tool(query)` | `tools/blog.py` | `search_blog()` → `match_blog_posts` RPC |
| `get_order_status_tool(order_id)` | `tools/orders.py` | `get_order_status()` → table `.eq()` |

### 5.6 Agent State — `agents/state.py`

```python
class AgentState(TypedDict):
    messages: list           # Full conversation history (for LLM context)
    session_id: str          # Client-provided identifier
    scope_passed: bool       # Whether scope_guard approved the query
    structured_parts: list[dict]  # Accumulated tool results for part_card SSE events
    iteration_count: int     # Guard against infinite loops
```

`get_initial_state(session_id)` constructs a fresh state per request, seeded with the session history loaded from `main.py`'s in-memory store. `structured_parts` accumulates across all tool calls in a single request and is consumed by `main.py` at stream end to emit `part_card` events.

### 5.7 Agent Nodes — `agents/nodes.py`

#### `scope_guard_node` (sync)

Keyword match against 16 domain terms + regex hard-block for off-topic patterns. If the first message contains no scope keywords, `scope_passed = False` and a rejection `AIMessage` is appended. The graph routes directly to `respond_node` — no LLM call.

**Why keyword matching instead of LLM classification?** LLM classification adds ~500ms and ~$0.001 per out-of-scope request. Keywords are instant and free. The keyword list covers the vast majority of appliance queries for this domain.

#### `reason_node` (async)

Single LLM call point. `_LLM_WITH_TOOLS` is initialized once at module load as a module-level constant — `bind_tools` returns a new Runnable but does not create a new HTTP client. The LLM returns either `AIMessage` with `content` (final answer) or `AIMessage` with `tool_calls` (wants a tool).

#### `act_node` (async)

Executes all tool calls from the last `AIMessage` **in parallel** via `asyncio.gather`:

```python
results = await asyncio.gather(
    *[_TOOLS_MAP[tc["name"]].ainvoke(tc["args"]) for tc in valid_calls],
    return_exceptions=True,
)
```

Each result is appended as a `ToolMessage` with the matching `tool_call_id`. OpenAI requires this ID to correlate tool calls to results in conversation history. Unknown tool names are skipped with a warning.

#### `observe_node` (sync, routing function)

Not a graph node with incoming edges — used only as the conditional edge function from `act`. Never processes state; only reads it to return a routing string:

```
last is ToolMessage          → "reason"  (LLM must see tool results)
last has tool_calls          → "reason"  (LLM wants more tools)
iteration_count >= 5         → "respond" (hard stop)
otherwise                    → "respond" (LLM is done)
```

The critical branch is `isinstance(last, ToolMessage) → "reason"`. Without it, the graph would route to respond immediately after act, and the LLM would never synthesize the tool results.

#### `respond_node` (async, passthrough)

Returns state unchanged. Its purpose is to be the named terminal node before `END`. Any future post-processing logic (logging, mutation) goes here without changing edge definitions.

### 5.8 Agent Graph — `agents/graph.py`

```
START
  │
  ▼
scope_guard ─── scope_passed=False ──► respond ──► END
  │
  scope_passed=True
  │
  ▼
reason ──► act ──── observe() ──► reason    (tool results pending)
                │
                └── observe() ──► respond ──► END   (done or max iterations)
```

The graph is compiled once at module load (`agent = create_graph()`). LangGraph's `compile()` validates all edges and nodes, and optimizes the execution plan. The compiled `agent` is imported in `main.py` and reused across all requests.

### 5.9 API Layer — `main.py`

**`GET /health`** — returns `{"status": "ok"}` for load balancers and uptime monitors.

**`POST /reset`** — clears `_sessions[session_id]`. Called by the frontend when the user starts a new conversation.

**`POST /chat`** — accepts `ChatRequest`, returns `StreamingResponse(media_type="text/event-stream")`.

The `generate()` async generator is passed to `StreamingResponse`. FastAPI calls it lazily — it only runs when the client reads the response body, so the response object is returned to the framework immediately.

**Event types emitted:**

```
on_chat_model_stream  → {"type": "token",     "content": "..."}
on_chain_end          → {"type": "part_card", "data": {...}}    (deduplicated by ps_number)
post-loop fallback    → {"type": "token",     "content": "..."}  (scope rejection only)
always                → {"type": "done"}
error                 → {"type": "error",     "message": "..."}
```

**Deduplication:** `emitted_part_ids` (a `set`) tracks already-yielded part IDs. LangGraph emits `on_chain_end` for each node, so `structured_parts` appears multiple times as the graph progresses. Without deduplication, the same repair guide would be emitted once per loop iteration.

**Scope rejection fallback:** If `tokens_emitted` is still `False` after the event loop, the scope guard's rejection `AIMessage` was never streamed by `on_chat_model_stream`. The fallback walks `final_output["messages"]` in reverse, finds the first `AIMessage` with string content, and emits it as a token event.

**`X-Accel-Buffering: no`** disables response buffering in Nginx reverse proxies. Without it, Nginx accumulates chunks before forwarding them, defeating streaming.

---

## 6. Session Memory Architecture

### Short-Term Memory (Implemented)

A module-level dict in `main.py` maps `session_id` to message history:

```python
_sessions: dict[str, tuple[float, list]] = {}
```

Each entry is `(last_accessed_timestamp, messages)` for TTL eviction.

On every `POST /chat`:

```
1. Load history    → _sessions.get(session_id)
2. Build state     → history + [HumanMessage(new_message)]
3. Run agent       → agent.astream_events(state, ...)
4. Filter messages → keep only HumanMessage + plain AIMessage
5. Save history    → _sessions[session_id] = (timestamp, clean_history)
```

**Why ToolMessages are stripped from history:**

A single agent turn generates multiple `ToolMessage` objects containing raw JSON (~500 chars each). Persisting them would:
- Bloat the context window on every subsequent turn with data already summarized in the `AIMessage`
- Inflate token costs linearly with conversation length
- Cause OpenAI 400 errors: tool call `AIMessages` must be immediately followed by their `ToolMessages` in history — orphaned ones break the API

**Context window on Turn 2** (after Turn 1 about a leaking dishwasher):

```
[SystemMessage]      ← always prepended by reason_node
[HumanMessage]       ← Turn 1: "my dishwasher is leaking from the door"
[AIMessage]          ← Turn 1: "For a leaking dishwasher door, check the gasket..."
[HumanMessage]       ← Turn 2: "what's the price of that door gasket?"
```

### Session Limits

TTL: 1 hour (`_SESSION_TTL_SECONDS = 3600`). Cap: 500 sessions. When the cap is reached, the oldest sessions are evicted first. Both limits are enforced before every write in `_evict_stale_sessions()`.

### Limitation: In-Process Only

`_sessions` is a plain dict in one process. With `uvicorn --workers N`, each worker has its own store. A request routed to a different worker finds empty history. For multi-worker production, replace with a Redis-backed store — only the `_get_session` / `_save_session` calls in `main.py` need to change.

### Long-Term Memory (Not Implemented)

Long-term memory (persisting facts about a user across separate sessions) is not warranted here. Users come to look up a specific part for a specific problem — each visit is task-scoped, not relationship-scoped. The engineering overhead (user identity, persistence store, retrieval step, staleness handling) is not justified by the use case.

---

## 7. The Reasoning Loop

### Why two LLM calls per tool-using response

```
Call 1 (reason): decide what to do
  Input:  system + conversation history
  Output: AIMessage(tool_calls=[...])

Call 2 (reason): synthesize results
  Input:  system + history + AIMessage(tool_calls) + ToolMessage(results)
  Output: AIMessage(content="...")    ← tokens stream to client
```

The OpenAI function-calling API returns either a function call **or** content — not both simultaneously. The two-call structure is not overhead; it is how the protocol works.

### Working memory between calls

The full message list passed to Call 2 is:

```
[SystemMessage, HumanMessage, AIMessage(tool_calls), ToolMessage(tool_results_json)]
```

The LLM in Call 2 reads the raw JSON from `ToolMessage` and transforms it into a natural language response. The LLM does not have this knowledge in its weights — it is provided in context on every request.

### The iteration cap

`iteration_count >= 5 → "respond"` is a hard stop. Without it, a buggy tool or an unusually complex query could loop indefinitely. Five iterations allows up to five rounds of tool-calling before forcing a response. In practice, the vast majority of queries complete in one or two iterations.

---

## 8. Vector Search Architecture

### Embedding pipeline

```
User query string
    │
    ▼  asyncio.to_thread(embed_text)
OpenAI text-embedding-3-small  (1536 dimensions)
    │
    ▼  asyncio.to_thread(supabase.rpc)
match_parts(query_embedding, match_count, filter_appliance_type?)
    │
    ▼  PostgreSQL
ORDER BY embedding <=> query_embedding   (cosine distance)
WHERE appliance_type ILIKE '%' || filter || '%'
LIMIT match_count
    │
    ▼
list[Part]
```

### Why cosine distance (`<=>`)

`text-embedding-3-small` produces unit-normalized vectors. For unit-normalized vectors, cosine similarity and inner product are mathematically equivalent. `<=>` is used by convention and aligns with Supabase documentation examples.

### Appliance type filter

The filter is applied **before** vector ordering, restricting the search space to the correct appliance category. Without it, a query for "dishwasher pump" might surface refrigerator compressors as a near-match. `ILIKE '%...%'` handles case variance (`"dishwasher"` vs `"Dishwasher"`).

### Return limits

| RPC function | Limit | Reason |
|---|---|---|
| `match_parts` | 5 | Enough candidates for synthesis; more increases token consumption |
| `match_repair_guides` | 3 | Repair guides are verbose; 3 fills the context adequately |
| `match_blog_posts` | 2 | Supplementary content; 2 is sufficient |

---

## 9. Streaming Architecture

### Server-Sent Events over WebSockets

WebSockets are bidirectional. SSE is unidirectional (server → client). For a chat interface where the client sends one message and the server streams back a response, WebSockets add connection upgrade overhead and reconnection complexity for no benefit. SSE is a plain HTTP/1.1 chunked transfer response that works through proxies and CDNs without special configuration.

### Event protocol

```
{"type": "token",     "content": "If your dishwasher..."}  → append to chat bubble
{"type": "part_card", "data": {...}}                        → render a UI card
{"type": "done"}                                            → close the stream
{"type": "error",     "message": "..."}                     → show error state
```

Each event is a complete, self-describing JSON object. The frontend does not need to parse partial JSON or guess what a chunk contains.

### Token-level streaming

LangGraph's `astream_events(version="v2")` fires `on_chat_model_stream` once per token as the LLM generates it, even before `reason_node` returns. The FastAPI `StreamingResponse` flushes each `yield` immediately via HTTP chunked transfer encoding. Users see text appearing word-by-word.

---

## 10. Design Decisions & Tradeoffs

### Synchronous Supabase client with `asyncio.to_thread`

**Decision:** Use `supabase-py` (sync) with thread offloading rather than `asyncpg` directly.

**Tradeoff:** Thread pool overhead per query (~0.1ms). The alternative (asyncpg + raw SQL) would eliminate thread overhead but requires writing raw SQL for every query, losing the PostgREST table API and Supabase RPC call syntax.

**Why acceptable:** Bottleneck is Supabase network latency (~20–50ms), not thread scheduling (~0.1ms).

### `gpt-4o-mini` over `gpt-4o`

**Decision:** Use the smaller model for reasoning.

**Tradeoff:** Lower synthesis quality on complex multi-part queries.

**Why acceptable:** Retrieval-augmented design means the LLM's job is synthesis, not knowledge recall. For straightforward parts questions, `gpt-4o-mini` performs equivalently at 10× lower cost and ~2× lower latency.

### In-memory session store

**Decision:** `_sessions` dict in `main.py`, not Redis or a database.

**Tradeoff:** No cross-worker session sharing. Single-worker or sticky-session deployments only.

**Why acceptable:** For a demo or single-instance deployment, in-memory is operationally zero-cost. The get/set calls are isolated in `_get_session` / `_save_session` — swapping to Redis requires changing only those two functions.

---

## 11. Data Flow by Query Type

### Parts search
`"What parts do I need for a noisy refrigerator?"`

```
scope_guard       → passes ("refrigerator", "noisy" ~ "repair")
reason [call 1]   → search_parts_tool(query="noisy refrigerator", appliance_type="refrigerator")
act               → embed → match_parts RPC → list[Part]; structured_parts += parts
observe           → ToolMessage → "reason"
reason [call 2]   → synthesizes: "For a noisy refrigerator, check..."
stream            → tokens + part_cards
```

### Direct PS number lookup
`"Tell me about part PS12349375"`

```
scope_guard       → passes ("part", "PS")
reason [call 1]   → get_part_details_tool(ps_number="PS12349375")
act               → table("parts").eq("ps_number", ...) → Part
observe           → "reason"
reason [call 2]   → synthesizes part details
stream            → tokens + 1 part_card
```

### Troubleshooting
`"My dishwasher is leaking from the bottom"`

```
scope_guard       → passes ("dishwasher", "leaking")
reason [call 1]   → troubleshoot_tool(query="dishwasher leaking bottom", appliance_type="dishwasher")
act               → embed → match_repair_guides RPC → list[RepairGuide]
observe           → "reason"
reason [call 2]   → synthesizes repair steps with part recommendations
stream            → tokens + repair guide cards
```

### Order tracking
`"Where is my order ORD-12345?"`

```
scope_guard       → passes ("order")
reason [call 1]   → get_order_status_tool(order_id="ORD-12345")
act               → table("orders").eq("order_id", ...) → OrderStatus
observe           → "reason"
reason [call 2]   → "Your order ORD-12345 is in transit via UPS..."
stream            → tokens only
```

### Out-of-scope
`"What is the weather today?"`

```
scope_guard       → _HARD_BLOCK regex matches "weather"
                    appends AIMessage(rejection text)
                    scope_passed = False
graph             → routes directly to respond (no LLM call)
post-loop         → tokens_emitted=False, fallback emits rejection as token
stream            → 1 token event + done
```

---

## 12. Failure Modes & Resilience

| Failure | Behavior |
|---|---|
| OpenAI API timeout / rate limit | `reason_node` raises; caught in `generate()` try/except; yields `{"type": "error", ...}` |
| Supabase RPC not found | `db/queries.py` raises; tool returns `json.dumps([])` (empty list); LLM responds with "no results found" |
| LLM requests unknown tool | Logged at WARNING; tool call skipped; iteration counter increments toward hard stop |
| Infinite reasoning loop | `observe_node` forces `"respond"` at `iteration_count >= 5`; max 5 LLM calls per request |
| Empty query string | Pydantic `ChatRequest` validation; 422 response before agent runs |

---

## 13. Security Boundaries

### Read-only database access

The Supabase key used should have RLS policies restricting it to `SELECT` on `parts`, `repair_guides`, `blog_posts`, and `orders`. The agent performs no writes.

### No SQL injection surface

All parameterized queries use the PostgREST table API (`.eq()`, `.select()`) or typed RPC parameters. pgvector rejects malformed vectors before any SQL execution. No user-provided strings are concatenated into SQL.

### CORS restriction

The API accepts cross-origin requests only from `http://localhost:3000` and `http://localhost:3001`. In production, replace with the deployed frontend origin — never `*`.

### API key handling

`OPENAI_API_KEY` is read from `.env` at startup into the `Settings` singleton. It is passed explicitly to clients (`ChatOpenAI(api_key=...)`, `OpenAI(api_key=...)`). It is never logged, never included in error messages, and never returned in any API response.
