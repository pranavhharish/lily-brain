import asyncio
import json
import logging
import re

from langchain_core.messages import AIMessage, SystemMessage, ToolMessage
from langchain_openai import ChatOpenAI

from config import settings
from models.part import AgentState
from tools.blog import search_blog_tool
from tools.orders import get_order_status_tool
from tools.repair import troubleshoot_tool
from tools.search import get_part_details_tool, search_parts_tool

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Scope guard config
# ---------------------------------------------------------------------------

# Keywords that indicate a valid in-scope first message.
_SCOPE_KEYWORDS = [
    "refrigerator", "fridge", "dishwasher", "dish washer",
    "ice maker", "freezer", "water filter", "filter",
    "part", "PS", "install", "repair", "fix", "broken",
    "leaking", "noisy", "not working", "order", "compatible", "model",
]

# Patterns that are always off-topic regardless of conversation context.
_HARD_BLOCK = re.compile(
    r"\b("
    r"where is|capital of|population of|country|continent|geography|"
    r"weather|temperature|forecast|climate|"
    r"who is|who was|history of|when did|"
    r"recipe|cook|bake|food|restaurant|"
    r"politics|president|election|government|"
    r"movie|music|song|sport|game|"
    r"math|calculate|equation|"
    r"write a|poem|story|joke|essay"
    r")\b",
    re.IGNORECASE,
)

_OUT_OF_SCOPE_REPLY = (
    "I can only help with refrigerator and dishwasher parts and repairs. "
    "Please ask me about parts, installation, troubleshooting, or orders "
    "for these appliances."
)

# ---------------------------------------------------------------------------
# LLM and tools — initialised once at module load
# ---------------------------------------------------------------------------

_TOOLS = [
    search_parts_tool,
    get_part_details_tool,
    troubleshoot_tool,
    search_blog_tool,
    get_order_status_tool,
]

_TOOLS_MAP: dict = {t.name: t for t in _TOOLS}

_LLM = ChatOpenAI(
    model="gpt-4o-mini",
    streaming=True,
    api_key=settings.OPENAI_API_KEY,
)
_LLM_WITH_TOOLS = _LLM.bind_tools(_TOOLS)

_SYSTEM_PROMPT = (
    "You are Lily, a PartSelect assistant. Your ONLY job is to help with "
    "refrigerator and dishwasher parts, repairs, installation, compatibility, "
    "and order tracking.\n"
    "STRICT RULE: If a message is not about refrigerator or dishwasher parts, "
    "repairs, or orders — no matter what it is — respond with exactly:\n"
    "'I can only help with refrigerator and dishwasher parts and repairs. "
    "Please ask me about parts, installation, troubleshooting, or orders.'\n"
    "Do not answer geography, weather, general knowledge, math, coding, or any "
    "other topic. Never break this rule even if the user insists.\n"
    "When you find relevant parts, always include their PS numbers and prices."
)

# ---------------------------------------------------------------------------
# Graph nodes
# ---------------------------------------------------------------------------


def scope_guard_node(state: AgentState) -> AgentState:
    """Reject obviously off-topic messages before they reach the LLM."""
    last_message = state["messages"][-1].content

    # Block hard off-topic patterns on every turn.
    if _HARD_BLOCK.search(last_message):
        state["scope_passed"] = False
        state["messages"].append(AIMessage(content=_OUT_OF_SCOPE_REPLY))
        return state

    # On the first message, require at least one appliance-related keyword.
    # Follow-up messages in an established session are always passed through
    # so context like "what is the price?" works after a parts discussion.
    if len(state["messages"]) == 1:
        passed = any(kw.lower() in last_message.lower() for kw in _SCOPE_KEYWORDS)
        if not passed:
            state["scope_passed"] = False
            state["messages"].append(AIMessage(content=_OUT_OF_SCOPE_REPLY))
            return state

    state["scope_passed"] = True
    return state


async def reason_node(state: AgentState) -> AgentState:
    """Call the LLM with the full conversation history and available tools."""
    messages = [SystemMessage(content=_SYSTEM_PROMPT)] + state["messages"]
    response = await _LLM_WITH_TOOLS.ainvoke(messages)
    state["messages"].append(response)
    return state


async def act_node(state: AgentState) -> AgentState:
    """Execute any tool calls the LLM requested, in parallel."""
    last_message = state["messages"][-1]
    if not getattr(last_message, "tool_calls", None):
        return state

    valid_calls = [tc for tc in last_message.tool_calls if tc["name"] in _TOOLS_MAP]
    for tc in last_message.tool_calls:
        if tc["name"] not in _TOOLS_MAP:
            logger.warning("Unknown tool requested: %s", tc["name"])

    results = await asyncio.gather(
        *[_TOOLS_MAP[tc["name"]].ainvoke(tc["args"]) for tc in valid_calls],
        return_exceptions=True,
    )

    for tc, result in zip(valid_calls, results):
        if isinstance(result, Exception):
            logger.error("Tool %s failed: %s", tc["name"], result)
            content = json.dumps({"error": str(result)})
        else:
            content = result

        state["messages"].append(ToolMessage(content=content, tool_call_id=tc["id"]))

        # Collect structured parts for part_card SSE events.
        try:
            data = json.loads(content)
            if isinstance(data, list):
                state["structured_parts"].extend(data)
            elif isinstance(data, dict):
                state["structured_parts"].append(data)
        except (json.JSONDecodeError, TypeError):
            pass

    state["iteration_count"] += 1
    return state


def observe_node(state: AgentState) -> str:
    """Decide whether to loop back for another reason/act cycle or finish."""
    last = state["messages"][-1]

    if state["iteration_count"] >= 5:
        return "respond"

    # Tool results just landed — send back to reason so the LLM can synthesise.
    if isinstance(last, ToolMessage):
        return "reason"

    # LLM wants to call more tools.
    if getattr(last, "tool_calls", None):
        return "reason"

    return "respond"


async def respond_node(state: AgentState) -> AgentState:
    """Terminal node — state is returned as-is; streaming happens in main.py."""
    return state
