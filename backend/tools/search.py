import json

from langchain_core.tools import tool

from db.queries import get_part_by_ps_number, search_parts


@tool
async def search_parts_tool(
    query: str,
    appliance_type: str | None = None,
) -> str:
    """Search for refrigerator or dishwasher parts by description, symptom or part name.
    Use this when user is looking for a part or describing an appliance problem."""
    results = await search_parts(query, appliance_type)
    return json.dumps([p.model_dump() for p in results])


@tool
async def get_part_details_tool(ps_number: str) -> str:
    """Get detailed information about a specific part by its PartSelect PS number.
    Use when user mentions a specific PS number."""
    part = await get_part_by_ps_number(ps_number)
    if not part:
        return "Part not found"
    return json.dumps(part.model_dump())
