"""Gamification: an in-memory mock layer for a single demo user.

This is the only mock/persistence-free data in the system (by design). State lives in process
memory, so it resets on restart and is per-instance on Cloud Run. Swap this class for a
database-backed implementation with the same interface to make it real.
"""

import asyncio
from collections.abc import Callable
from dataclasses import dataclass, field

from app.schemas.gamification import Badge, GamificationStatus

POINTS_PER_ANALYSIS = 10

# (minimum points, level name). Index + 1 is the level number.
LEVELS: tuple[tuple[int, str], ...] = (
    (0, "Novato"),
    (50, "Analista"),
    (150, "Estratega"),
    (300, "Experto"),
    (600, "Leyenda"),
)


@dataclass
class _Profile:
    points: int
    analyses_count: int
    symbols: set[str] = field(default_factory=set)


@dataclass(frozen=True)
class _BadgeRule:
    id: str
    name: str
    description: str
    earned: Callable[[_Profile], bool]


BADGES = (
    _BadgeRule(
        "first_analysis",
        "Primer análisis",
        "Solicita tu primer análisis de sentimiento.",
        lambda p: p.analyses_count >= 1,
    ),
    _BadgeRule(
        "bull_market_expert",
        "Experto en Mercado Alcista",
        "Completa 5 análisis de sentimiento.",
        lambda p: p.analyses_count >= 5,
    ),
    _BadgeRule(
        "consistent",
        "Analista constante",
        "Completa 10 análisis de sentimiento.",
        lambda p: p.analyses_count >= 10,
    ),
    _BadgeRule(
        "explorer",
        "Explorador de mercados",
        "Analiza 5 símbolos distintos.",
        lambda p: len(p.symbols) >= 5,
    ),
    _BadgeRule(
        "crypto_curious",
        "Cripto curioso",
        "Analiza un criptoactivo (p. ej. BTC-USD).",
        lambda p: any(symbol.endswith("-USD") for symbol in p.symbols),
    ),
    _BadgeRule(
        "strategist",
        "Estratega",
        "Alcanza el nivel Estratega.",
        lambda p: p.points >= LEVELS[2][0],
    ),
)

# Seed so the sidebar looks like an active user from the first load, while two more analyses
# visibly unlock "Experto en Mercado Alcista" and level up to Analista during a demo.
DEMO_PROFILE = _Profile(points=30, analyses_count=3, symbols={"AAPL", "MSFT", "NVDA"})


class GamificationService:
    def __init__(self, profile: _Profile | None = None):
        seed = profile or DEMO_PROFILE
        self._profile = _Profile(seed.points, seed.analyses_count, set(seed.symbols))
        self._lock = asyncio.Lock()

    async def record_analysis(self, symbol: str) -> None:
        async with self._lock:
            self._profile.points += POINTS_PER_ANALYSIS
            self._profile.analyses_count += 1
            self._profile.symbols.add(symbol)

    def status(self) -> GamificationStatus:
        profile = self._profile
        index = max(i for i, (threshold, _) in enumerate(LEVELS) if profile.points >= threshold)
        current_threshold, level_name = LEVELS[index]
        next_threshold = LEVELS[index + 1][0] if index + 1 < len(LEVELS) else None
        progress = (
            1.0
            if next_threshold is None
            else (profile.points - current_threshold) / (next_threshold - current_threshold)
        )
        return GamificationStatus(
            points=profile.points,
            level=index + 1,
            level_name=level_name,
            current_level_points=current_threshold,
            next_level_points=next_threshold,
            progress=round(progress, 4),
            analyses_count=profile.analyses_count,
            points_per_analysis=POINTS_PER_ANALYSIS,
            badges=[
                Badge(id=b.id, name=b.name, description=b.description, earned=b.earned(profile))
                for b in BADGES
            ],
        )
