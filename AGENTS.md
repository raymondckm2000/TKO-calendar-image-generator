# AGENTS.md

# Agent Instructions for This Repository

This repository contains a Next.js application for generating calendar images from Google Calendar ICS feeds.

All coding agents MUST follow the instructions below.

---

# Repository Structure

```txt
docs/review/      -> mandatory review markdown files
lib/calendar/     -> calendar parsing logic
lib/image/        -> image rendering logic
components/       -> reusable UI components
app/api/          -> API routes
```

---

# Setup Commands

Install dependencies:

```bash
npm install
```

Run development server:

```bash
npm run dev
```

Run lint:

```bash
npm run lint
```

Run production build:

```bash
npm run build
```

---

# Core Rules

## Rule 1 — Never Modify Main Directly

Always create feature branches.

Required workflow:

```bash
git checkout main
git pull
git checkout -b feature/<task-name>
```

---

## Rule 2 — Mandatory Review Markdown

After EVERY code change:

Create:

```txt
docs/review/<branch>-<timestamp>.md
```

Example:

```txt
docs/review/feature-calendar-parser-2026-05-13-1200.md
```

Task is FAILED if review markdown is missing.

---

# Required Review Format

```md
# Task Review

## Branch
feature/calendar-parser

## Summary
Implemented Google Calendar ICS parser.

## Files Changed
- lib/calendar/parser.ts
- app/api/extract/route.ts

## What Changed
- added node-ical integration
- added month filtering
- normalized event structure

## Verification
- npm run lint
- npm run build

## Risks
- timezone edge cases not fully tested

## Diff
```diff
+ import ical from 'node-ical'
```

## Output
Successfully generated normalized monthly event JSON.

## Review Status
READY_FOR_PM_REVIEW
```

---

# Mandatory Completion Output

At the END of EVERY task:

Print:

```txt
Review file created:
docs/review/<filename>.md
```

If missing:
TASK FAILED.

---

# Minimal Diff Policy

Only modify files required for the task.

DO NOT:
- refactor unrelated code
- rename unrelated files
- modify unrelated UI
- add unnecessary dependencies

---

# Verification Requirements

Before completion:

```bash
npm run lint
npm run build
```

If verification fails:
DO NOT claim success.

---

# Architecture Rules

## Reuse Existing Patterns

Before coding:
- inspect existing structure
- follow current architecture
- avoid duplicate implementations

---

## i18n First

Avoid hardcoded UI strings.

Future localization support must remain possible.

---

## Trust > Design

Use factual and professional wording.

Avoid:
- fake marketing language
- exaggerated claims
- unnecessary abstraction

---

# Preferred Stack

- Next.js
- TypeScript
- Tailwind CSS
- node-ical
- Puppeteer
- Vercel

---

# Branch Naming

```txt
feature/<task>
fix/<task>
refactor/<task>
docs/<task>
```

---

# Commit Naming

```txt
feat:
fix:
refactor:
docs:
chore:
```

---

# Forbidden Actions

Agents MUST NOT:

- push directly to main
- skip review markdown
- skip verification
- fabricate test results
- modify unrelated files
- claim completion without verification

---

# Recommended Development Flow

1. Create feature branch
2. Implement task
3. Verify changes
4. Create review markdown
5. Commit
6. Push branch
7. Open PR
8. Await PM review