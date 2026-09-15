# FinSight AI

FinSight AI is an enterprise financial intelligence workspace demonstrating secure RAG, deterministic finance analytics, governed AI delivery, evaluation, and operational observability.

## Run locally

Backend:

```powershell
cd backend
python -m pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Frontend:

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`. Configure `backend/.env` with PostgreSQL, Pinecone, Groq, and Cohere credentials before using ingestion or AI queries.

## Project structure

The backend keeps only a few focused modules:

```text
backend/app/
	api/          HTTP routes and request models
	config.py     environment settings
	db.py         PostgreSQL access and schema initialization
	providers.py  Groq and Cohere clients
	ingestion.py  file parsing, profiling, chunking, and Pinecone indexing
	query.py      routing, SQL analysis, RAG, and hybrid answers
	quality.py    finance calculations and answer evaluation
	telemetry.py  audit logging and cost tracking
	security.py   workspace and role checks
```

## Architecture

See [docs/architecture.md](docs/architecture.md) for system boundaries, security, lineage, evaluation, observability, scalability, and failure handling.

The backend can be checked with `python -m compileall -q app` from the `backend` directory.
