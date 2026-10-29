from datetime import datetime
from typing import Literal

from pydantic import BaseModel

type HistoryRange = Literal["1d", "5d", "1mo", "6mo", "1y"]


class Quote(BaseModel):
    symbol: str
    price: float
    previous_close: float | None
    change: float | None
    change_percent: float | None
    volume: int | None
    currency: str | None
    exchange: str | None
    as_of: datetime


class PricePoint(BaseModel):
    time: datetime
    close: float


class PriceHistory(BaseModel):
    symbol: str
    range: HistoryRange
    interval: str
    points: list[PricePoint]


class Headline(BaseModel):
    title: str
    publisher: str | None
    url: str | None
    published_at: datetime | None
