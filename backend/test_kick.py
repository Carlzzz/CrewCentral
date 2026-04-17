import asyncio
from app.core.redis import get_redis

async def main():
    r = await get_redis()
    keys = await r.keys("kick:*")
    print("Kick keys:", keys)
    for k in keys:
        v = await r.get(k)
        ttl = await r.ttl(k)
        print(f"  {k} = {v}, TTL = {ttl} seconds ({ttl // 60} min remaining)")
    await r.aclose()

asyncio.run(main())