# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CrewCentral is a platform for managing skills, devices, documentation, and downloads, built with a Python/FastAPI backend and React/TypeScript frontend.

## Technology Stack

- **Backend**: Python 3.11+ / FastAPI / SQLAlchemy 2.x (AsyncSession) / Alembic / uv
- **Frontend**: React 18 / TypeScript / Vite 6 / React Router / Tailwind CSS
- **Databases**: SQLite (development) / PostgreSQL or MySQL (production)
- **Storage**: Local file system (bundles/releases/.uploads)

## Key Project Structure

```
CrewCentral/
├── backend/          # FastAPI backend
│   ├── app/
│   │   ├── api/          # API routes
│   │   ├── auth/         # Authentication
│   │   ├── core/        # Core utilities
│   │   ├── db/          # Database setup
│   │   ├── models/      # SQLAlchemy models
│   │   ├── schemas/     # Pydantic schemas
│   │   └── services/    # Business logic
│   ├── alembic/          # Database migrations
│   └── pyproject.toml
├── frontend/         # React frontend
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── pages/       # Page components
│   │   └── lib/         # Utilities
│   └── package.json
├── constitution.md # Project constitution (core principles)
└── .cursor/rules/ # Development guidelines
```

## Common Commands

### Backend

```bash
cd backend
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Copy `.env.example` to `.env` and adjust configuration.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Key Principles & Guidelines

Refer to `constitution.md` for detailed core principles, including:

- Fixed technology stack requirement
- Base path consistency (frontend Router basename, backend route prefix, Session Cookie Path, and reverse proxy rules must all match)
- Dual authentication support (Session for web, JWT for clients)
- Contract-first API development
- Simple but extensible architecture

## Important Files to Reference

- `constitution.md`: Project constitution and architecture rules
- `.cursor/rules/specify-rules.mdc`: Development guidelines
- `backend/README.md`: Backend-specific instructions
