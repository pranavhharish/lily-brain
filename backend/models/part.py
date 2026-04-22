from typing import TypedDict

from pydantic import BaseModel


class Part(BaseModel):
    ps_number: str
    mpn_number: str | None = None
    name: str
    brand: str | None = None
    appliance_type: str | None = None
    price: float | None = None
    availability: str | None = None
    symptoms: list[str] = []
    replaces_parts: list[str] = []
    install_video_url: str | None = None
    install_difficulty: str | None = None
    install_time: str | None = None
    product_url: str | None = None


class RepairGuide(BaseModel):
    id: str | None = None
    appliance_type: str | None = None
    symptom: str | None = None
    description: str | None = None
    occurrence_pct: int | None = None
    parts_needed: list[str] = []
    difficulty: str | None = None
    source_url: str | None = None
    repair_video_url: str | None = None


class BlogPost(BaseModel):
    id: str | None = None
    title: str
    url: str


class OrderStatus(BaseModel):
    order_id: str
    status: str | None = None
    carrier: str | None = None
    tracking_number: str | None = None
    estimated_delivery: str | None = None
    items: list[dict] = []


class ChatRequest(BaseModel):
    message: str
    session_id: str = "default"


class AgentState(TypedDict):
    messages: list
    session_id: str
    scope_passed: bool
    structured_parts: list[dict]
    iteration_count: int
