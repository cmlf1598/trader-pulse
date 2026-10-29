from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas.stock import Headline

type Sentiment = Literal["bullish", "bearish", "neutral"]

MAX_JUSTIFICATION_CHARS = 400
MAX_KEY_FACTORS = 3


class GeminiSentiment(BaseModel):
    """Structured-output schema sent to Gemini. Field descriptions are part of the prompt."""

    sentiment: Sentiment = Field(description="Overall short-term market sentiment for the asset.")
    confidence: float = Field(ge=0, le=1, description="Confidence in the verdict, from 0 to 1.")
    justification: str = Field(
        min_length=1,
        description="Brief justification in Spanish, at most 280 characters.",
    )
    key_factors: list[str] = Field(
        default_factory=list,
        description="Up to 3 short key factors in Spanish.",
    )

    @field_validator("justification")
    @classmethod
    def _trim_justification(cls, value: str) -> str:
        value = value.strip()
        if len(value) > MAX_JUSTIFICATION_CHARS:
            return value[: MAX_JUSTIFICATION_CHARS - 1].rstrip() + "…"
        return value

    @field_validator("key_factors")
    @classmethod
    def _limit_key_factors(cls, value: list[str]) -> list[str]:
        return [factor.strip() for factor in value if factor.strip()][:MAX_KEY_FACTORS]


class SentimentAnalysis(BaseModel):
    symbol: str
    sentiment: Sentiment
    confidence: float
    justification: str
    key_factors: list[str]
    headlines: list[Headline]
    model: str
    generated_at: datetime
    cached: bool
