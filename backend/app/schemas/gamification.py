from pydantic import BaseModel


class Badge(BaseModel):
    id: str
    name: str
    description: str
    earned: bool


class GamificationStatus(BaseModel):
    points: int
    level: int
    level_name: str
    current_level_points: int
    next_level_points: int | None
    progress: float
    analyses_count: int
    # Lets the client apply an optimistic award that matches the server's.
    points_per_analysis: int
    badges: list[Badge]
