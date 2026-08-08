# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

See also `AGENTS.md` for Next.js-specific agent rules (auto-maintained by `next dev`).

## Overview

This repo now hosts a Next.js app (TypeScript, App Router, Tailwind CSS v4) alongside the original static HTML prototype. Per the PRD (`PRD.md`), the personal-intro site is being rebuilt/extended as the Next.js app under `src/`; the legacy static files remain for reference during the migration.

## Structure

- `src/app/` — Next.js App Router pages and layouts.
- `public/` — static assets served by Next.js.
- `intro.html`, `index.html` — original self-contained static prototype (inline `<style>`, no dependencies). Kept as reference/fallback; not part of the Next.js build.
- `PRD.md` — requirements for the personal-intro site expansion (contact links, responsive layout, projects section).
- `wireframe.png`, `scripts/` — supporting design assets.

## Working in this repo

- Package manager: npm. Commands: `npm run dev`, `npm run build`, `npm run lint`.
- Verify changes with `npm run dev` (or `npm run build`) rather than opening HTML files directly, for anything under `src/`.
- No test suite is configured.
- Match the PRD's constraints where they still apply to the Next.js app (responsive 320px–1440px, light/dark theme support, no external CDN assets — npm dependencies are fine since this is now a build-tooled project).
