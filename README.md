# EnrollChain

EnrollChain is a blockchain-assisted student admission and registration prototype for Sto. Domingo National Trade School.

This repository currently contains the approved technical foundation. Business rules that require client confirmation are deliberately excluded; see [`docs/ASSUMPTIONS.md`](docs/ASSUMPTIONS.md) and [`docs/SCOPE_BASELINE.md`](docs/SCOPE_BASELINE.md).

## Structure

```text
backend/      Django REST API
frontend/     React and TypeScript web application
blockchain/   Hardhat development environment
docs/         Scope, assumptions, architecture, and acceptance notes
```

## Local development with Docker

1. Copy `.env.example` to `.env` and replace the development secrets.
2. Run `docker compose up --build`.
3. Open the frontend at `http://localhost:5173`.
4. Open API documentation at `http://localhost:8000/api/docs/`.

The local services are PostgreSQL, Django, Vite, and a Hardhat JSON-RPC node. Blockchain integration is disabled by default until the client confirms network and wallet-custody requirements.

## Local development without Docker

Backend:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
python manage.py migrate
python manage.py runserver
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Blockchain tooling:

```bash
cd blockchain
npm install
npm test
```

## Quality checks

```bash
make check
```

No real student records or production blockchain keys should be used in the development environment.
