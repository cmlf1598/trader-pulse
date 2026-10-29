import time
from collections import OrderedDict
from collections.abc import Callable


class TTLCache[V]:
    """In-process cache with per-entry expiry and LRU eviction.

    Only touched from the event loop thread and never awaits, so it needs no lock.
    A `ttl_seconds` of 0 disables caching entirely.
    """

    def __init__(
        self,
        ttl_seconds: float,
        *,
        max_entries: int = 256,
        clock: Callable[[], float] = time.monotonic,
    ):
        self._ttl = ttl_seconds
        self._max_entries = max_entries
        self._clock = clock
        self._entries: OrderedDict[str, tuple[float, V]] = OrderedDict()

    def get(self, key: str) -> V | None:
        entry = self._entries.get(key)
        if entry is None:
            return None
        expires_at, value = entry
        if self._clock() >= expires_at:
            del self._entries[key]
            return None
        self._entries.move_to_end(key)
        return value

    def set(self, key: str, value: V) -> None:
        if self._ttl <= 0:
            return
        self._entries[key] = (self._clock() + self._ttl, value)
        self._entries.move_to_end(key)
        while len(self._entries) > self._max_entries:
            self._entries.popitem(last=False)

    def __len__(self) -> int:
        return len(self._entries)
