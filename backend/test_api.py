import asyncio
import httpx

async def main():
    async with httpx.AsyncClient() as client:
        # We need a valid session to call the admin API.
        # But we can just query the database directly to see what list_devices WOULD return.
        pass

asyncio.run(main())