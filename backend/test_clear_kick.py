import asyncio
from app.core.redis import get_redis

async def main():
    r = await get_redis()
    keys = await r.keys("kick:*")
    print("Before - kick keys:", keys)
    for k in keys:
        await r.delete(k)
        print(f"  Deleted: {k}")
    keys_after = await r.keys("kick:*")
    print("After - kick keys:", keys_after)
    await r.aclose()

asyncio.run(main())