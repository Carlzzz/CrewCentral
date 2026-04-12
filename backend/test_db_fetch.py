import asyncio
from sqlalchemy import select
from app.db.devices_session import DevicesAsyncSessionLocal
from app.models.device import DevicePresence
from app.jobs.flush_presence import offline_cutoff

async def main():
    async with DevicesAsyncSessionLocal() as db:
        rows = (await db.scalars(select(DevicePresence))).all()
        cutoff = offline_cutoff()
        print(f"Cutoff (aware): {cutoff}")
        print(f"Cutoff (naive): {cutoff.replace(tzinfo=None)}")
        for r in rows:
            print(f"Device: {r.device_id}")
            print(f"  Last seen: {r.last_seen_at} (tzinfo: {r.last_seen_at.tzinfo})")
            
            dt = r.last_seen_at
            if dt.tzinfo is None:
                recent = dt >= cutoff.replace(tzinfo=None)
                print(f"  Compared naive: {dt} >= {cutoff.replace(tzinfo=None)} -> {recent}")
            else:
                recent = dt >= cutoff
                print(f"  Compared aware: {dt} >= {cutoff} -> {recent}")

asyncio.run(main())