# 0001. Use a three-tier architecture with Astro, Hono and SQLite

- **Status:** Accepted
- **Date:** 2026-11-20
- **Source:** `proposal.md` — *Proposed Three-Tier Architectural Design*, *Proposed Technology Stack*; `context/architecture.md`

## Context
The app targets self-hosters on modest hardware (NAS, home lab) with a resource budget of roughly
200 MB memory and 4 % CPU at 50 concurrent connections (NFR-01, NFR-02). Data must stay on the
owner's machine (SEC-06), and each tier should be replaceable later (NFR-08).

## Decision
The system is split into a presentation tier (Astro, static HTML/CSS with minimal JavaScript, served
by NGINX), an application tier (Hono in TypeScript, exposing `/api/*`) and a data tier (a single
SQLite file on a volume). Tiers talk only through HTTP (`/api`) and the `Db` interface.

## Consequences
- Easy: tiny footprint, a single DB file to back up, independent replacement of any tier.
- Hard: SQLite serialises writes — fine for friend groups, a ceiling for large installs.
- Do not add a server-rendered framework, an ORM or a second database without revisiting this ADR.

## Verification
No test result was provided — the repository has no test suite yet (backlog E8).

## Alternatives considered
- **Hosted cloud services:** rejected — contradicts the privacy-first, self-hosted goal.
- **Heavier JS frameworks (SPA):** rejected — the proposal chooses Astro specifically to keep client JavaScript minimal (NFR-07).
- **Client/server DB (e.g. Postgres):** rejected for MVP — no media, small data, and an extra container breaks the resource budget.
