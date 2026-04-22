"""
Load all three PartSelect CSVs into Supabase with embeddings.
Run from backend/: python -m loader.load_csv
"""

import csv
import logging
from pathlib import Path

from db.client import embed_batch, get_supabase

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent.parent.parent / "data"

ALLOWED_APPLIANCES = {"refrigerator", "dishwasher"}
BATCH_SIZE = 100


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _split_list(value: str) -> list[str]:
    return [v.strip() for v in value.split(",") if v.strip()]


def _to_float(value: str) -> float | None:
    try:
        return float(value.strip())
    except (ValueError, AttributeError):
        return None


def _to_int(value: str) -> int | None:
    try:
        return int(value.strip())
    except (ValueError, AttributeError):
        return None


def _clean_appliance(value: str) -> str | None:
    for part in value.split(","):
        cleaned = part.strip().rstrip(".").strip().lower()
        if cleaned in ALLOWED_APPLIANCES:
            return cleaned
    return None


def _read_csv(path: Path) -> list[dict]:
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _chunked(lst: list, size: int):
    for i in range(0, len(lst), size):
        yield lst[i : i + size]


def _dedup(rows: list[dict], key: str) -> list[dict]:
    seen: dict = {}
    for row in rows:
        k = row.get(key, "")
        if k:
            seen[k] = row
    return list(seen.values())


# ---------------------------------------------------------------------------
# loaders
# ---------------------------------------------------------------------------

def load_parts() -> None:
    rows = _read_csv(DATA_DIR / "all_parts.csv")
    supabase = get_supabase()
    log.info("Loading %d parts rows", len(rows))

    # filter appliance types
    valid = []
    for row in rows:
        appliance_type = _clean_appliance(row.get("appliance_types", ""))
        if appliance_type is None:
            continue
        symptoms = _split_list(row.get("symptoms", ""))
        valid.append((row, appliance_type, symptoms))

    # deduplicate by ps_number globally to avoid intra-batch conflicts
    deduped: dict[str, tuple] = {}
    for item in valid:
        key = item[0].get("part_id", "").strip()
        if key:
            deduped[key] = item
    valid = list(deduped.values())

    log.info("parts: %d unique rows after dedup", len(valid))
    inserted = 0

    for chunk in _chunked(valid, BATCH_SIZE):
        try:
            embed_inputs = [
                r["part_name"].strip() + " " + ", ".join(syms)
                for r, _, syms in chunk
            ]
            embeddings = embed_batch(embed_inputs)

            records = [
                {
                    "ps_number": row["part_id"].strip(),
                    "name": row["part_name"].strip(),
                    "mpn_number": row.get("mpn_id", "").strip() or None,
                    "price": _to_float(row.get("part_price", "")),
                    "appliance_type": appliance_type,
                    "replaces_parts": _split_list(row.get("replace_parts", "")),
                    "symptoms": symptoms,
                    "brand": row.get("brand", "").strip() or None,
                    "availability": row.get("availability", "").strip() or None,
                    "install_difficulty": row.get("install_difficulty", "").strip() or None,
                    "install_time": row.get("install_time", "").strip() or None,
                    "install_video_url": row.get("install_video_url", "").strip() or None,
                    "product_url": row.get("product_url", "").strip() or None,
                    "embedding": embedding,
                }
                for (row, appliance_type, symptoms), embedding in zip(chunk, embeddings)
            ]

            supabase.table("parts").upsert(records, on_conflict="ps_number").execute()
            inserted += len(records)
            log.info("parts: %d/%d inserted", inserted, len(valid))

        except Exception as exc:
            log.error("parts chunk failed: %s", exc)

    log.info("parts: done (%d/%d rows)", inserted, len(valid))


def load_repairs() -> None:
    rows = _read_csv(DATA_DIR / "all_repairs.csv")
    supabase = get_supabase()
    log.info("Loading %d repair rows", len(rows))

    # deduplicate by source_url
    rows = _dedup(rows, "symptom_detail_url")
    rows = [r for r in rows if r.get("symptom_detail_url", "").strip()]
    log.info("repair_guides: %d unique rows after dedup", len(rows))

    # truncate so we can do plain inserts without needing a unique constraint
    supabase.table("repair_guides").delete().not_.is_("source_url", "null").execute()
    supabase.table("repair_guides").delete().is_("source_url", "null").execute()
    log.info("repair_guides: table cleared")

    inserted = 0
    for chunk in _chunked(rows, BATCH_SIZE):
        try:
            embed_inputs = [
                row.get("symptom", "").strip() + " " + row.get("description", "").strip()
                for row in chunk
            ]
            embeddings = embed_batch(embed_inputs)

            records = [
                {
                    "appliance_type": row.get("Product", "").strip().lower() or None,
                    "symptom": row.get("symptom", "").strip() or None,
                    "description": row.get("description", "").strip() or None,
                    "occurrence_pct": _to_int(row.get("percentage", "")),
                    "parts_needed": _split_list(row.get("parts", "")),
                    "source_url": row.get("symptom_detail_url", "").strip() or None,
                    "difficulty": row.get("difficulty", "").strip() or None,
                    "repair_video_url": row.get("repair_video_url", "").strip() or None,
                    "embedding": embedding,
                }
                for row, embedding in zip(chunk, embeddings)
            ]

            supabase.table("repair_guides").insert(records).execute()
            inserted += len(records)
            log.info("repair_guides: %d/%d inserted", inserted, len(rows))

        except Exception as exc:
            log.error("repair_guides chunk failed: %s", exc)

    log.info("repair_guides: done (%d/%d rows)", inserted, len(rows))


def load_blogs() -> None:
    rows = _read_csv(DATA_DIR / "partselect_blogs.csv")
    supabase = get_supabase()
    log.info("Loading %d blog rows", len(rows))

    # deduplicate by url
    rows = _dedup(rows, "url")
    rows = [r for r in rows if r.get("url", "").strip()]
    log.info("blogs: %d unique rows after dedup", len(rows))

    # truncate so we can do plain inserts
    supabase.table("blog_posts").delete().not_.is_("url", "null").execute()
    supabase.table("blog_posts").delete().is_("url", "null").execute()
    log.info("blog_posts: table cleared")

    inserted = 0
    for chunk in _chunked(rows, BATCH_SIZE):
        try:
            embed_inputs = [
                row.get("title", "").strip() or row.get("url", "").strip()
                for row in chunk
            ]
            embeddings = embed_batch(embed_inputs)

            records = [
                {
                    "title": row.get("title", "").strip() or None,
                    "url": row.get("url", "").strip(),
                    "embedding": embedding,
                }
                for row, embedding in zip(chunk, embeddings)
            ]

            supabase.table("blog_posts").insert(records).execute()
            inserted += len(records)
            log.info("blog_posts: %d/%d inserted", inserted, len(rows))

        except Exception as exc:
            log.error("blog_posts chunk failed: %s", exc)

    log.info("blog_posts: done (%d/%d rows)", inserted, len(rows))


# ---------------------------------------------------------------------------
# entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    log.info("Starting CSV load")
    load_parts()
    load_repairs()
    load_blogs()
    log.info("All done")
