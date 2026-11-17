# PLU Analyzer Platform

> **Urban-planning feasibility analysis for French land parcels — explained simply.**

PLU Analyzer is a full-stack web application built with **Next.js**, **Payload CMS**, **PostgreSQL**, and **TypeScript**. It helps architects, urban planners, and property developers figure out **what you are allowed to build** on a piece of land in France, how big the building can be, and export those constraints for CAD tools like **ArchiCAD**.

---

## Table of Contents

- [What Does This App Actually Do?](#what-does-this-app-actually-do)
- [How the Analysis Pipeline Works](#how-the-analysis-pipeline-works)
- [Tech Stack (What's Inside)](#tech-stack-whats-inside)
- [Prerequisites](#prerequisites)
- [Quick Start Guide (Step-by-Step)](#quick-start-guide-step-by-step)
- [Demo Login Accounts](#demo-login-accounts)
- [Pages & Features](#pages--features)
- [Environment Variables Explained](#environment-variables-explained)
- [Project Structure](#project-structure)
- [Useful Commands](#useful-commands)
- [Troubleshooting](#troubleshooting)

---

## What Does This App Actually Do?

In France, every town or group of towns has a rulebook called a **PLU** (_Plan Local d'Urbanisme_) or **PLUi** (_Plan Local d'Urbanisme Intercommunal_). It answers questions like:

- _How tall can my building be?_ (e.g., max 12 meters or 3 floors)
- _How much of the lot can the building cover?_ (e.g., max 40% footprint)
- _How far back from the street or neighbors must it sit?_ (setbacks)
- _How much green space and how many parking spots are required?_

Normally, an architect or urbanist has to manually:

1. Look up the land parcel on a government map (Cadastre).
2. Find which zone the parcel is in (e.g., `UA`, `UB`, `N`).
3. Download a 100+ page PDF rulebook from the _Géoportail de l'Urbanisme_.
4. Read the PDF and do math in a spreadsheet.

**PLU Analyzer automates this workflow in one place.** You give it an address or a parcel ID, and it fetches the map data, finds the zoning, reads/extracts the rules, optionally uses AI (Groq) to interpret complex French legal text, calculates buildable area (**constructibility**), and generates an **ArchiCAD-ready export**.

---

## How the Analysis Pipeline Works

When you run an analysis in the workspace (`POST /api/plu/analyze`), the backend runs `runPluAnalysisPipeline` ([`src/services/plu/pipeline.ts`](src/services/plu/pipeline.ts)) through these steps:

```text
1. Geocoding          ──▶ Turns a French street address into GPS coordinates (data.geopf.fr)
2. Cadastre Lookup    ──▶ Finds the official parcel ID (IDU), boundaries & area in m² (IGN Apicarto)
3. Zoning Lookup      ──▶ Checks which PLU zone the parcel belongs to (IGN GPU + AMP ArcGIS)
4. GPU Documents      ──▶ Finds official PLU PDFs/documents for that commune
5. PDF Extraction     ──▶ Extracts PLU articles from PDFs (with optional OCR via Tesseract)
6. AI Interpretation  ──▶ Uses Groq LLM (optional) to turn legal text into structured numbers
7. Validation         ──▶ Checks rule completeness and flags missing/invalid constraints
8. Constructibility   ──▶ Calculates max footprint, floor area, green space, and ArchiCAD export
```

Every run is saved with an execution log, a **Snapshot** (so you can replay or compare analyses later), and **Prompt History**.

---

## Tech Stack (What's Inside)

If you're new to these tools, here is what each one does:

| Tool                         | Plain-English Role                                                                                           |
| :--------------------------- | :----------------------------------------------------------------------------------------------------------- |
| **Next.js 16 (App Router)**  | Runs both the website UI (React 19) and the backend API routes.                                              |
| **Payload CMS 3**            | Manages users, login, permissions, and database tables, plus gives you a ready-made `/admin` dashboard.      |
| **PostgreSQL 15**            | The database that stores projects, parcels, rules, documents, and analysis snapshots.                        |
| **Docker**                   | Runs PostgreSQL in an isolated container so you don't have to install Postgres manually on your machine.     |
| **Tailwind CSS + shadcn/ui** | Styles the interface with clean, modern UI components and dark/light mode.                                   |
| **Leaflet**                  | Displays interactive maps showing the land parcel's polygon shape.                                           |
| **TanStack React Query**     | Keeps frontend data in sync with the backend API cleanly.                                                    |
| **Groq API**                 | Optional fast AI model (`llama-3.3-70b-versatile`) that reads French PLU text and extracts structured rules. |
| **Vitest**                   | Runs automated unit and integration tests.                                                                   |

---

## Prerequisites

Make sure you have these installed before starting:

1. **Node.js** `>= 20.9.0` ([Download Node.js](https://nodejs.org/))
2. **pnpm** (recommended package manager — install with `npm install -g pnpm`)
3. **Docker & Docker Compose** ([Download Docker](https://www.docker.com/get-started/)) — used to run the PostgreSQL database.

---

## Quick Start Guide (Step-by-Step)

### 1. Clone the repository & install dependencies

```bash
pnpm install
```

### 2. Set up your environment file

Copy the example environment file to `.env`:

```bash
cp .env.example .env
```

Open `.env` and set a secret key for `PAYLOAD_SECRET` (any random 32+ character string). Everything else works out of the box for local development! _(If you have a Groq API key for AI rule interpretation, you can paste it into `GROQ_API_KEY`.)_

### 3. Start the PostgreSQL database

```bash
docker compose up -d
```

This starts a PostgreSQL 15 container named `plu-analyzer-postgres` on port **`5433`** (intentionally not `5432` so it won't clash with any local Postgres you already have).

You can verify it's healthy with:

```bash
docker compose ps
```

### 4. Run database migrations

This creates all the tables (Users, Projects, Parcels, Regulations, Analyses, etc.) in PostgreSQL:

```bash
pnpm migrate
```

### 5. Seed demo data (Recommended)

Populate the database with sample users, a reference parcel in Aix-en-Provence (`13001000AB0123`), a sample project, regulations, and a sample analysis:

```bash
pnpm seed
```

### 6. Start the app!

```bash
pnpm dev
```

Now open your browser and visit:

- **Main App**: [http://localhost:3000](http://localhost:3000)
- **Payload Admin Panel**: [http://localhost:3000/admin](http://localhost:3000/admin)

---

## Demo Login Accounts

After running `pnpm seed`, you can log in with any of these three roles:

| Role              | Email                    | Password          | What they can do                                               |
| :---------------- | :----------------------- | :---------------- | :------------------------------------------------------------- |
| **Admin**         | `admin@pluanalyzer.fr`   | `PluAdmin2026!`   | Full access to all projects, users, and `/admin` CMS settings. |
| **Urban Planner** | `planner@pluanalyzer.fr` | `PluPlanner2026!` | Create/manage projects, run PLU analyses, upload documents.    |
| **Viewer**        | `viewer@pluanalyzer.fr`  | `PluViewer2026!`  | Read-only access to view projects and analysis results.        |

---

## Pages & Features

### Web Pages

- **`/` (Dashboard)** — Log in, view existing urban-planning projects, or create a new project.
- **`/workspace`** — The main workbench. Look up a parcel by address or IDU, view it on the interactive Leaflet map, run a PLU analysis, inspect constructibility calculations, compare snapshots, and export for ArchiCAD.
- **`/documents`** — Browse and manage uploaded/fetched PLU regulatory PDF documents.
- **`/admin`** — Payload CMS Admin UI to inspect or edit raw database collections directly.

### Custom API Endpoints

- `POST /api/plu/parcel-lookup` — Search for a parcel by address or cadastral reference (`codeInsee`, `section`, `numero`, `idu`).
- `POST /api/plu/analyze` — Run the full PLU feasibility pipeline for a project & parcel.
- `POST /api/plu/replay` — Re-run an analysis from a saved snapshot.
- `POST /api/plu/compare` — Compare two analysis snapshots side-by-side.

Payload CMS also automatically exposes REST (`/api/...`) and GraphQL (`/api/graphql`) endpoints for all collections.

---

## Environment Variables Explained

Here is what each setting in `.env.example` does:

| Variable                  | Default / Example                                                | Plain-English Explanation                                                             |
| :------------------------ | :--------------------------------------------------------------- | :------------------------------------------------------------------------------------ |
| `DATABASE_URI`            | `postgresql://plu_user:plu_password@localhost:5433/plu_analyzer` | Connection string to the PostgreSQL database (matches `docker-compose.yml`).          |
| `PAYLOAD_SECRET`          | `replace-with-a-strong-32-char-secret-key`                       | Secret key used by Payload CMS to sign login cookies/tokens.                          |
| `NEXT_PUBLIC_SERVER_URL`  | `http://localhost:3000`                                          | Public URL where the app is running.                                                  |
| `GEOCODING_API_URL`       | `https://data.geopf.fr/geocodage/search`                         | French government API that converts addresses to GPS coordinates.                     |
| `IGN_APICARTO_BASE_URL`   | `https://apicarto.ign.fr/api`                                    | French IGN API for cadastral parcels and GPU zoning boundaries.                       |
| `GPU_API_BASE_URL`        | `https://www.geoportail-urbanisme.gouv.fr/api`                   | Official _Géoportail de l'Urbanisme_ API for PLU documents.                           |
| `AMP_ARCGIS_PLUI_URL`     | `https://sig.ampmetropole.fr/arcgis/rest/services`               | Aix-Marseille-Provence Metropolis ArcGIS server for local PLUi zoning.                |
| `AMP_ARCGIS_ZONING_LAYER` | `PLUi/MapServer/0`                                               | Specific map layer on the AMP ArcGIS server.                                          |
| `GROQ_API_KEY`            | _(empty)_                                                        | Optional API key for Groq AI. Without it, AI interpretation is skipped/fallback.      |
| `GROQ_MODEL`              | `llama-3.3-70b-versatile`                                        | Which Groq LLM model to use for reading PLU rules.                                    |
| `GROQ_API_URL`            | `https://api.groq.com/openai/v1/chat/completions`                | Groq API endpoint.                                                                    |
| `OCR_ENABLED`             | `false`                                                          | Set to `true` if you want to run OCR on scanned PDFs that don't have selectable text. |
| `OCR_COMMAND`             | `tesseract`                                                      | CLI command used for OCR when `OCR_ENABLED=true`.                                     |

---

## Project Structure

```text
pluanalyzer2/
├── docker-compose.yml        # Spins up PostgreSQL 15 on port 5433
├── .env.example              # Template for environment variables
├── src/
│   ├── payload.config.ts     # Main Payload CMS configuration & database setup
│   ├── collections/          # Database tables (Users, Projects, Parcels, Regulations, Analyses, etc.)
│   ├── access/               # Role-based permissions (admin, urban_planner, viewer)
│   ├── migrations/           # Database schema migrations
│   ├── seed/                 # Script to populate demo users, parcel, and project
│   ├── services/plu/         # Core business logic:
│   │   ├── pipeline.ts       #   Orchestrates the 8-step analysis workflow
│   │   ├── geocoding.ts      #   Address -> lat/lng
│   │   ├── cadastre.ts       #   IGN parcel lookup
│   │   ├── apicarto.ts       #   IGN GPU zoning lookup
│   │   ├── metropole-arcgis.ts # Aix-Marseille-Provence zoning lookup
│   │   ├── gpu-documents.ts  #   Fetches official PLU PDFs
│   │   ├── pdf-extractor.ts  #   Parses articles from PDFs
│   │   ├── groq-interpreter.ts # AI interpretation of PLU rules
│   │   ├── regulatory-validator.ts # Validates rule completeness
│   │   ├── constructibility.ts # Calculates buildable area & setbacks
│   │   └── archicad-export.ts # Formats results for ArchiCAD
│   ├── app/
│   │   ├── (app)/            # Frontend pages (/, /workspace, /documents)
│   │   ├── (payload)/        # Payload CMS /admin panel & REST/GraphQL APIs
│   │   └── api/plu/          # Custom PLU API routes
│   ├── components/           # React UI components (Navbar, ParcelMap, WorkspaceClient, etc.)
│   ├── api/                  # Frontend API client helpers
│   └── types/                # TypeScript type definitions
```

---

## Useful Commands

| Command               | What it does                                                              |
| :-------------------- | :------------------------------------------------------------------------ |
| `pnpm dev`            | Starts the development server with hot-reload at `http://localhost:3000`. |
| `pnpm build`          | Builds the production Next.js bundle.                                     |
| `pnpm start`          | Runs the built production server.                                         |
| `pnpm typecheck`      | Checks TypeScript types across the whole project without emitting files.  |
| `pnpm test`           | Runs all Vitest unit and integration tests once.                          |
| `pnpm test:watch`     | Runs Vitest in watch mode while developing.                               |
| `pnpm migrate`        | Applies pending Payload CMS database migrations.                          |
| `pnpm migrate:create` | Creates a new migration after you edit a collection schema.               |
| `pnpm generate:types` | Regenerates `src/payload-types.ts` from your Payload collections.         |
| `pnpm seed`           | Seeds the database with demo users and sample Aix-en-Provence data.       |

---

## Troubleshooting

- **"Connection refused" / Database error on startup**
  Make sure Docker is running and you started Postgres with `docker compose up -d`. Check that `DATABASE_URI` in `.env` uses port `5433`.
- **Tables don't exist / `relation "users" does not exist`**
  You probably skipped `pnpm migrate`. Run `pnpm migrate` and then `pnpm seed`.
- **AI interpretation step shows a warning or skips**
  This is normal if `GROQ_API_KEY` is blank in `.env`. The rest of the pipeline (geocoding, cadastre, zoning, validation, constructibility) still works without it.
- **External French API timeouts (IGN / GPU / ArcGIS)**
  The app queries live French government GIS services (`data.geopf.fr`, `apicarto.ign.fr`, `geoportail-urbanisme.gouv.fr`). If one of those public APIs is temporarily slow or offline, the pipeline logs a warning for that step and continues with available data.
