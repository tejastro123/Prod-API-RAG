# Prod-API-RAG

Production-ready Retrieval-Augmented Generation (RAG) API platform with a modern web frontend, observability endpoints, and deployment-ready infrastructure.

[![Python](https://img.shields.io/badge/Python-3.11%2B-blue.svg)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-Frontend-3178C6.svg)](#)
[![FastAPI](https://img.shields.io/badge/FastAPI-API-009688.svg)](#)
[![Vite](https://img.shields.io/badge/Vite-Frontend-646CFF.svg)](#)
[![License](https://img.shields.io/badge/License-Private%20%2F%20TBD-lightgrey.svg)](#)

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Repository Structure](#repository-structure)
- [Tech Stack](#tech-stack)
- [Key Features](#key-features)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Local Development (Backend)](#local-development-backend)
  - [Local Development (Frontend)](#local-development-frontend)
  - [Run with Docker Compose](#run-with-docker-compose)
- [Configuration](#configuration)
- [API & Frontend](#api--frontend)
- [Testing](#testing)
- [Deployment](#deployment)
- [Observability & Operations](#observability--operations)
- [Security Notes](#security-notes)
- [Roadmap](#roadmap)
- [Contributing](#contributing)

---

## Overview

**Prod-API-RAG** is a full-stack production-oriented RAG system designed to:

- ingest and index domain knowledge,
- retrieve relevant context efficiently,
- generate grounded responses through an API agent workflow,
- expose health/metrics endpoints for operational visibility,
- provide a React-based chat and dashboard frontend.

The project combines a Python backend with a TypeScript frontend and includes deployment assets for cloud and containerized environments.

---

## Architecture

High-level flow:

1. **Client Request** (web chat/UI or API consumer)
2. **Backend API Layer** (request validation, routing, orchestration)
3. **Retrieval Layer** (vector/database lookup, cache-aware retrieval)
4. **Generation Layer** (LLM/agent pipeline with context grounding)
5. **Streaming/Response Delivery** (SSE/JSON response)
6. **Observability** (health checks, metrics, logs)

Supporting components include local persistence, test suites, and deployment manifests.

---

## Repository Structure

```text
.
├── app/                      # Backend application modules (API, services, core logic)
├── frontend/                 # React + Vite frontend application
├── docs/                     # Project and operational documentation
├── tests/                    # Automated tests
├── chroma_db/                # Vector store artifacts (environment-specific)
├── logs/                     # Runtime/log outputs (environment-specific)
├── scratch/                  # Experimental/dev scripts and temporary work
├── main.py                   # Backend app entrypoint
├── run_agent.py              # Agent/runtime launcher
├── pyproject.toml            # Python project config and dependencies
├── uv.lock                   # Locked dependency graph
├── docker-compose.yml        # Multi-service local/prod-like orchestration
├── Dockerfile                # Container build definition
├── render.yml                # Render deployment config
└── README.md                 # Project overview (this file)
```

> Note: Some generated/runtime directories and files (e.g., DB/log artifacts) should be treated as environment-specific.

---

## Tech Stack

### Backend
- **Python** (project-managed via `pyproject.toml` / `uv.lock`)
- Likely async API framework pattern (entrypoint in `main.py`)
- Retrieval + agent orchestration modules under `app/`

### Frontend
- **React 18** + **TypeScript**
- **Vite 5**
- **Zustand** (state management)
- **TanStack Query** (health/metrics polling)
- **React Router v6**
- **Zod** (schema validation)

### Infrastructure / DevOps
- **Docker / Docker Compose**
- **Render** deployment manifest (`render.yml`)
- Shell-based operational/test command scripts

---

## Key Features

- Production-style RAG API surface
- Retrieval and response-generation orchestration
- Streaming-friendly chat workflows
- Frontend chat UI with thread/state persistence
- Live dashboard/health/metrics-oriented UI patterns
- Containerized local/prod-like execution support
- Test suite and operational scripts for reliability

---

## Getting Started

### Prerequisites

- **Python 3.11+**
- **Node.js 18+** and **npm**
- **Docker** + **Docker Compose** (optional, recommended)
- Git

---

### Local Development (Backend)

```bash
# 1) Clone
git clone https://github.com/tejastro123/Prod-API-RAG.git
cd Prod-API-RAG

# 2) Create environment (example)
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate

# 3) Install dependencies
# If using uv:
# uv sync
# otherwise fallback:
pip install -e .

# 4) Run backend
python main.py
```

Backend typically runs on a local API port (project/env dependent).

---

### Local Development (Frontend)

```bash
cd frontend/rag-webapp
npm install
npm run dev
```

Default Vite URL: `http://localhost:5173`

The frontend can proxy API requests to the backend, or use `VITE_API_URL` for direct target configuration.

---

### Run with Docker Compose

```bash
docker compose up --build
```

Use this mode for a closer-to-production local stack with consistent environment bootstrapping.

---

## Configuration

Create environment files as needed.

### Frontend (`frontend/rag-webapp/.env.local`)

```env
VITE_API_URL=https://prod-api-rag.onrender.com
```

If omitted, frontend dev proxy behavior may be used based on Vite config.

### Backend
Configure backend environment variables for:
- model/provider credentials,
- retrieval/index paths,
- database/vector-store configuration,
- runtime/logging options.

> Keep secrets out of version control. Use `.env` + secret managers in deployment.

---

## API & Frontend

### Frontend Routes (current web app)
- `/chat` — Main chat experience (streaming responses)
- `/dashboard` — Health/metrics style monitoring view
- `/threads` — Conversation/thread management

### API
The backend entrypoint and app modules expose API endpoints for:
- chat/query execution,
- health/status checks,
- potentially metrics and diagnostic routes.

For exact endpoint contracts, refer to `app/` modules and docs under `docs/`.

---

## Testing

Run tests from repository root:

```bash
# Python tests
pytest -q
```

Additional command scripts may exist (e.g., production test helpers):
- `Production-test-commands.sh`

---

## Deployment

### Render
- Deployment configuration is present in `render.yml`.

### Container
- Build: `Dockerfile`
- Multi-service orchestration: `docker-compose.yml`

Recommended deployment practices:
- pin dependencies (`uv.lock`),
- use environment-specific configs,
- enforce health checks and startup probes,
- centralize logs/metrics.

---

## Observability & Operations

Operational readiness should include:

- structured application logs,
- liveness/readiness health endpoints,
- request/error metrics,
- retrieval latency and cache hit-rate tracking,
- model/provider failure fallbacks and retries.

Use the dashboard and backend diagnostics to monitor runtime behavior.

---

## Security Notes

- Never commit API keys or credentials.
- Rotate secrets periodically.
- Validate and sanitize user inputs.
- Apply rate limits and auth controls for public endpoints.
- Keep dependencies updated and scanned.

---

## Roadmap

- Expanded ingestion pipelines and document lifecycle tooling
- Stronger eval framework for retrieval and answer quality
- Multi-tenant/project isolation support
- AuthN/AuthZ hardening for production API consumers
- CI/CD quality gates (lint, type-check, tests, security scanning)

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit with clear, scoped messages
4. Add/extend tests for your change
5. Open a pull request with context and validation steps

---

For product context and implementation notes, also review:

- `docs/`
- `PROD_UPGRADE_PLAN.md`
- `RAG_WebApp_Build_Plan.md`
- `REPORT.MD`
