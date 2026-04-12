import asyncio
from sqlalchemy import select
from app.db.devices_session import DevicesAsyncSessionLocal
from app.db.session import AsyncSessionLocal
from app.models.device import Device, DevicePresence
from app.models.user import User
from app.jobs.flush_presence import offline_cutoff

async def main():
    async with DevicesAsyncSessionLocal() as dbs:
        rows = (await dbs.scalars(select(Device))).all()
        presences = (await dbs.scalars(select(DevicePresence))).all()
        pmap = {p.device_id: p for p in presences}
        
        cutoff = offline_cutoff()
        print("Cutoff:", cutoff)
        
        for d in rows:
            pr = pmap.get(d.id)
            recent = False
            if pr is not None:
                dt = pr.last_seen_at
                if dt.tzinfo is None:
                    recent = dt >= cutoff.replace(tzinfo=None)
                else:
                    recent = dt >= cutoff

            if d.status == "blocked":
                st = "blocked"
            elif d.status == "error":
                st = "error"
            elif recent:
                st = "online"
            else:
                # Need to import is_stale_presence to match exactly
                from app.jobs.flush_presence import is_stale_presence
                if pr is None or is_stale_presence(pr.last_seen_at):
                    st = "anomaly"
                else:
                    st = "offline"
            
            print(f"Device: {d.id}, PR: {pr.last_seen_at if pr else None}, recent: {recent}, st: {st}")

asyncio.run(main())