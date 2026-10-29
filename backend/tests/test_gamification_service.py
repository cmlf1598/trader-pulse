import pytest

from app.services.gamification_service import (
    POINTS_PER_ANALYSIS,
    GamificationService,
    _Profile,
)


def earned(service: GamificationService) -> set[str]:
    return {badge.id for badge in service.status().badges if badge.earned}


def test_demo_profile_is_seeded() -> None:
    status = GamificationService().status()

    assert status.points == 30
    assert status.level == 1
    assert status.level_name == "Novato"
    assert status.current_level_points == 0
    assert status.next_level_points == 50
    assert status.progress == pytest.approx(0.6)
    assert status.points_per_analysis == POINTS_PER_ANALYSIS
    assert {b.id for b in status.badges if b.earned} == {"first_analysis"}


async def test_two_more_analyses_unlock_bull_market_expert_and_level_up() -> None:
    service = GamificationService()

    await service.record_analysis("TSLA")
    assert "bull_market_expert" not in earned(service)

    await service.record_analysis("AMZN")
    status = service.status()

    assert status.analyses_count == 5
    assert status.level_name == "Analista"
    assert "bull_market_expert" in earned(service)


async def test_recording_an_analysis_awards_points() -> None:
    service = GamificationService(_Profile(points=0, analyses_count=0))

    await service.record_analysis("AAPL")
    status = service.status()

    assert status.points == POINTS_PER_ANALYSIS
    assert status.analyses_count == 1
    assert earned(service) == {"first_analysis"}


@pytest.mark.parametrize(
    ("points", "level", "name"),
    [
        (0, 1, "Novato"),
        (49, 1, "Novato"),
        (50, 2, "Analista"),
        (150, 3, "Estratega"),
        (300, 4, "Experto"),
        (600, 5, "Leyenda"),
    ],
)
def test_levels(points: int, level: int, name: str) -> None:
    status = GamificationService(_Profile(points=points, analyses_count=0)).status()

    assert (status.level, status.level_name) == (level, name)


def test_max_level_has_full_progress() -> None:
    status = GamificationService(_Profile(points=999, analyses_count=0)).status()

    assert status.next_level_points is None
    assert status.progress == 1.0


async def test_badges_unlock_from_activity() -> None:
    service = GamificationService(_Profile(points=140, analyses_count=9))

    for symbol in ["AAPL", "MSFT", "NVDA", "TSLA", "BTC-USD"]:
        await service.record_analysis(symbol)

    assert earned(service) == {
        "first_analysis",
        "bull_market_expert",
        "consistent",
        "explorer",
        "crypto_curious",
        "strategist",
    }


def test_seed_profile_is_not_shared_between_instances() -> None:
    seed = _Profile(points=0, analyses_count=0, symbols={"AAPL"})
    GamificationService(seed)._profile.symbols.add("MSFT")

    assert seed.symbols == {"AAPL"}
