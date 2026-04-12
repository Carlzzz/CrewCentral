from app.jobs.flush_presence import offline_cutoff
from datetime import datetime
print("cutoff:", offline_cutoff())
print("utcnow:", datetime.utcnow())
