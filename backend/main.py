import json
import logging
import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from langchain_core.messages import AIMessage, HumanMessage

from models.part import ChatRequest

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="PartSelect Chat API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "https://lily-brain.onrender.com",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# In-memory session store
#
# Stores message history keyed by session_id. Each entry is a tuple of
# (last_accessed_timestamp, messages_list) so stale sessions can be evicted.
#
# Limitation: sessions are not shared across multiple worker processes.
# For multi-worker deployments, replace with a Redis-backed store.
# ---------------------------------------------------------------------------

_SESSION_TTL_SECONDS = 60 * 60  # 1 hour
_MAX_SESSIONS = 500

_sessions: dict[str, tuple[float, list]] = {}


def _get_session(session_id: str) -> list:
    entry = _sessions.get(session_id)
    return entry[1] if entry else []


def _save_session(session_id: str, messages: list) -> None:
    _evict_stale_sessions()
    _sessions[session_id] = (time.monotonic(), messages)


def _evict_stale_sessions() -> None:
    now = time.monotonic()
    stale = [sid for sid, (ts, _) in _sessions.items() if now - ts > _SESSION_TTL_SECONDS]
    for sid in stale:
        del _sessions[sid]

    # If still over the cap, evict the oldest entries.
    if len(_sessions) >= _MAX_SESSIONS:
        sorted_ids = sorted(_sessions, key=lambda sid: _sessions[sid][0])
        for sid in sorted_ids[: len(_sessions) - _MAX_SESSIONS + 1]:
            del _sessions[sid]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.post("/reset")
async def reset(request: ChatRequest) -> dict:
    _sessions.pop(request.session_id, None)
    logger.info("Session cleared: %s", request.session_id)
    return {"status": "ok", "session_id": request.session_id}


@app.post("/chat")
async def chat(request: ChatRequest) -> StreamingResponse:
    async def generate():
        try:
            from agents.graph import agent
            from agents.state import get_initial_state

            history = _get_session(request.session_id)

            state = get_initial_state(request.session_id)
            state["messages"] = history + [HumanMessage(content=request.message)]

            tokens_emitted = False
            emitted_part_ids: set = set()
            final_output: dict = {}

            async for event in agent.astream_events(state, version="v2"):
                kind = event["event"]

                if kind == "on_chat_model_stream":
                    chunk = event["data"]["chunk"]
                    if chunk.content:
                        tokens_emitted = True
                        yield f"data: {json.dumps({'type': 'token', 'content': chunk.content})}\n\n"

                elif kind == "on_chain_end":
                    output = event["data"].get("output", {})
                    if isinstance(output, dict):
                        final_output = output
                        for part in output.get("structured_parts", []):
                            part_id = part.get("ps_number")
                            if part_id and part.get("name") and part_id not in emitted_part_ids:
                                emitted_part_ids.add(part_id)
                                yield f"data: {json.dumps({'type': 'part_card', 'data': part})}\n\n"

            # scope_guard rejection path — the rejection message was never streamed
            # token-by-token, so emit it now as a single token event.
            if not tokens_emitted:
                messages = final_output.get("messages", [])
                for msg in reversed(messages):
                    if hasattr(msg, "content") and isinstance(msg.content, str) and msg.content:
                        yield f"data: {json.dumps({'type': 'token', 'content': msg.content})}\n\n"
                        break

            # Persist session BEFORE yielding done. The client disconnects on
            # receiving done, which cancels the async generator — any save after
            # this point would be silently dropped.
            #
            # Strip ToolMessages and AIMessages that carry tool_calls: the OpenAI
            # API requires every tool_call AIMessage to be immediately followed by
            # its ToolMessage. Orphaned tool_call AIMessages cause a 400 on the
            # next turn.
            all_messages = final_output.get("messages", [])
            clean_history = [
                m for m in all_messages
                if isinstance(m, HumanMessage)
                or (isinstance(m, AIMessage) and not getattr(m, "tool_calls", None))
            ]
            _save_session(request.session_id, clean_history)
            logger.info("Session %s: %d messages saved", request.session_id, len(clean_history))

            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        except Exception as exc:
            logger.error("Chat error: %s", exc, exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
