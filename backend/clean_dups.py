import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import text, select, delete
from app.models.device import Device, DevicePresence

async def main():
    dbs_engine = create_async_engine('sqlite+aiosqlite:///c:/Users/zhaocao/Documents/GitHub/CrewCentral/backend/devices_dev.db')
    DbsSessionLocal = async_sessionmaker(dbs_engine)
    
    try:
        async with DbsSessionLocal() as dbs:
            rows = (await dbs.scalars(select(Device).order_by(Device.updated_at.desc()))).all()
            seen = set()
            to_delete = []
            for d in rows:
                key = (d.owner_user_id, d.mac_address) if d.mac_address else (d.owner_user_id, d.device_uuid)
                if key in seen:
                    to_delete.append(d.id)
                else:
                    seen.add(key)
            
            print("To delete:", to_delete)
            if to_delete:
                # also delete presence
                await dbs.execute(delete(DevicePresence).where(DevicePresence.device_id.in_(to_delete)))
                await dbs.execute(delete(Device).where(Device.id.in_(to_delete)))
                await dbs.commit()
                print("Deleted old duplicates")
    except Exception as e:
        print('Error:', e)

asyncio.run(main())
