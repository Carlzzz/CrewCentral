# CrewCentral Backend

```powershell
cd backend
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Copy `.env.example` to `.env` and adjust.
