import asyncio
from app.core.redis import get_redis

async def main():
    r = await get_redis()
    keys = await r.keys("presence:*")
    print("Keys:", keys)
    for k in keys:
        print(k, await r.hgetall(k))

asyncio.run(main())