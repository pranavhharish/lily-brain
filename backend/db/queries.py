import asyncio
import logging

from db.client import embed_text, get_supabase
from models.part import BlogPost, OrderStatus, Part, RepairGuide

logger = logging.getLogger(__name__)


async def search_parts(query: str, appliance_type: str | None = None) -> list[Part]:
    def _fetch() -> list[dict]:
        vector = embed_text(query)
        params: dict = {"query_embedding": vector, "match_count": 5}
        if appliance_type:
            params["filter_appliance_type"] = appliance_type
        return get_supabase().rpc("match_parts", params).execute().data or []

    rows = await asyncio.to_thread(_fetch)
    return [Part(**row) for row in rows]


async def get_part_by_ps_number(ps_number: str) -> Part | None:
    def _fetch() -> list[dict]:
        return (
            get_supabase()
            .table("parts")
            .select(
                "ps_number,mpn_number,name,brand,appliance_type,price,"
                "availability,symptoms,replaces_parts,install_video_url,"
                "install_difficulty,install_time,product_url"
            )
            .eq("ps_number", ps_number)
            .limit(1)
            .execute()
            .data
            or []
        )

    rows = await asyncio.to_thread(_fetch)
    return Part(**rows[0]) if rows else None


async def search_repair_guides(query: str, appliance_type: str | None = None) -> list[RepairGuide]:
    def _fetch() -> list[dict]:
        vector = embed_text(query)
        params: dict = {"query_embedding": vector, "match_count": 3}
        if appliance_type:
            params["filter_appliance_type"] = appliance_type
        return get_supabase().rpc("match_repair_guides", params).execute().data or []

    rows = await asyncio.to_thread(_fetch)
    return [RepairGuide(**row) for row in rows]


async def search_blog(query: str) -> list[BlogPost]:
    def _fetch() -> list[dict]:
        vector = embed_text(query)
        return (
            get_supabase()
            .rpc("match_blog_posts", {"query_embedding": vector, "match_count": 2})
            .execute()
            .data
            or []
        )

    rows = await asyncio.to_thread(_fetch)
    return [BlogPost(**row) for row in rows]


async def get_order_status(order_id: str) -> OrderStatus | None:
    def _fetch() -> list[dict]:
        return (
            get_supabase()
            .table("orders")
            .select("order_id,status,carrier,tracking_number,estimated_delivery,items")
            .eq("order_id", order_id)
            .limit(1)
            .execute()
            .data
            or []
        )

    rows = await asyncio.to_thread(_fetch)
    if not rows:
        return None
    row = rows[0]
    if row.get("estimated_delivery") is not None:
        row["estimated_delivery"] = str(row["estimated_delivery"])
    return OrderStatus(**row)
