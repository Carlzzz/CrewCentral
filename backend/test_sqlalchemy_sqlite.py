import asyncio
from sqlalchemy import select, literal_column, exists
from app.db.devices_session import DevicesAsyncSessionLocal
from app.models.device import Device, DevicePresence
from app.jobs.flush_presence import offline_cutoff

async def main():
    async with DevicesAsyncSessionLocal() as db:
        cutoff = offline_cutoff()
        print("Cutoff datetime:", cutoff)
        
        recent = exists(
            select(literal_column("1"))
            .select_from(DevicePresence)
            .where(
                DevicePresence.device_id == Device.id,
                DevicePresence.last_seen_at >= cutoff,
            )
        )
        
        stmt = select(Device.id, Device.name).where(Device.status != "blocked").where(recent)
        
        # Print compiled SQL
        print("SQL:", stmt.compile(compile_kwargs={"literal_binds": True}))
        
        rows = (await db.execute(stmt)).all()
        print("Online devices according to SQL:", rows)

asyncio.run(main())