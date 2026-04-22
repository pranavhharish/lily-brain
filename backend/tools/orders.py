import json

from langchain_core.tools import tool

from db.queries import get_order_status


@tool
async def get_order_status_tool(order_id: str) -> str:
    """Get the status of a PartSelect order by order ID.
    Use when user asks about their order."""
    order = await get_order_status(order_id)
    if not order:
        return "Order not found"
    return json.dumps(order.model_dump())
