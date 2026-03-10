# Codex Agent Memory Example

This is a small consumer project that shows how to use `@mahin14m/project-context-memory` around a Codex-style workflow.

## What it does

- `npm run recall -- "your task or question"` searches past project memories before you start a Codex session
- `npm run remember -- --summary "..."` stores a summary, optional decision, optional outcome, and optional raw prompt/response/analysis after Codex finishes
- `npm run demo` writes one memory and reads it back

## Setup

1. Copy `.env.example` to `.env`:

```bash
copy .env.example .env
```

Or on macOS/Linux:

```bash
cp .env.example .env
```

2. Edit `.env` with your real PostgreSQL connection string.
2. Install dependencies:

```bash
npm install
```

3. Make sure your PostgreSQL instance has pgvector available.

## Commands

Recall relevant context before prompting Codex:

```bash
npm run recall -- "How did we validate subscription renewals before invoicing?"
```

If you run `npm run recall` without a query, the script will ask you to pass one after `--`.

Store a new memory after Codex completes a task:

```bash
npm run remember -- --summary "Renewal validation now checks trial expiration before invoice creation." --decision "Validate before invoicing." --outcome "Prevents invalid renewals."
```

Store raw prompt/response/analysis along with the summary:

```bash
npm run remember -- --summary "Routing logic now checks account tier first." --prompt "Review ticket routing after the tiering update." --response "The router reads account tier before deciding escalation." --analysis "Saved as a raw interaction log linked to the summary memory."
```

## Using with a published package

After publishing `@mahin14m/project-context-memory`, replace the local dependency:

```json
{
  "dependencies": {
    "@mahin14m/project-context-memory": "^0.1.0"
  }
}
```
