"""
EveningEventBus — in-memory SSE broadcast for evening mutations.
Publishes an "updated" signal to all connected clients when an evening changes.
Single-worker only (no Redis needed for this use case).
"""
import asyncio
from collections import defaultdict


class EveningEventBus:
    def __init__(self) -> None:
        self._subscribers: dict[int, set[asyncio.Queue]] = defaultdict(set)

    def subscribe(self, evening_id: int) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue()
        self._subscribers[evening_id].add(q)
        return q

    def unsubscribe(self, evening_id: int, q: asyncio.Queue) -> None:
        self._subscribers[evening_id].discard(q)

    async def publish(self, evening_id: int) -> None:
        for q in list(self._subscribers.get(evening_id, [])):
            await q.put("updated")


event_bus = EveningEventBus()
