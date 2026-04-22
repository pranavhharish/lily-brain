from functools import lru_cache

from openai import OpenAI
from supabase import Client, create_client

from config import settings

_openai_client: OpenAI | None = None


def _get_openai() -> OpenAI:
    global _openai_client
    if _openai_client is None:
        _openai_client = OpenAI(api_key=settings.OPENAI_API_KEY)
    return _openai_client


@lru_cache(maxsize=1)
def get_supabase() -> Client:
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)


def embed_text(text: str) -> list[float]:
    response = _get_openai().embeddings.create(
        model="text-embedding-3-small",
        input=text.strip() or " ",
        dimensions=1536,
    )
    return response.data[0].embedding


def embed_batch(texts: list[str]) -> list[list[float]]:
    cleaned = [t.strip() or " " for t in texts]
    response = _get_openai().embeddings.create(
        model="text-embedding-3-small",
        input=cleaned,
        dimensions=1536,
    )
    return [item.embedding for item in sorted(response.data, key=lambda x: x.index)]
