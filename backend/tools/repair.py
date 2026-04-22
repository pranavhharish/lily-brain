import json

from langchain_core.tools import tool

from db.queries import search_repair_guides


@tool
async def troubleshoot_tool(
    query: str,
    appliance_type: str | None = None,
) -> str:
    """Troubleshoot refrigerator or dishwasher problems. Use when user describes a symptom
    or problem like ice maker not working, dishwasher leaking, noisy refrigerator etc."""
    results = await search_repair_guides(query, appliance_type)
    return json.dumps([r.model_dump() for r in results])
