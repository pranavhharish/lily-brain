import json

from langchain_core.tools import tool

from db.queries import search_blog


@tool
async def search_blog_tool(query: str) -> str:
    """Search for how-to guides and repair articles about refrigerators and dishwashers."""
    results = await search_blog(query)
    return json.dumps([b.model_dump() for b in results])
