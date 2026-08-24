from neo4j import AsyncGraphDatabase
from app.config import settings


class GraphService:
    def __init__(self):
        self._driver = None

    async def connect(self):
        self._driver = AsyncGraphDatabase.driver(
            settings.neo4j_uri,
            auth=(settings.neo4j_user, settings.neo4j_password),
        )

    async def close(self):
        if self._driver:
            await self._driver.close()

    async def execute(self, query: str, params: dict = None) -> list[dict]:
        if not self._driver:
            await self.connect()
        async with self._driver.session() as session:
            result = await session.run(query, params or {})
            records = await result.data()
            return records

    async def execute_write(self, query: str, params: dict = None) -> list[dict]:
        if not self._driver:
            await self.connect()
        async with self._driver.session() as session:
            result = await session.run(query, params or {})
            records = await result.data()
            return records


graph_service = GraphService()
