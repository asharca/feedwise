# HANDOFF.md — Session Continuity

## Active Work

_None — last session completed._

## Persistent Constraints

These constraints survive across sessions. Do NOT override without explicit user approval.

### Architecture

- **Web UI: no AI features** — reader, settings, auth are purely rule-based
- **Digest pipeline: LLM allowed** — clustering, summarization, importance scoring
- **LLM config**: OpenAI-compatible (baseURL + key + model), JSON mode
- **File size**: prefer small files, single responsibility
- **Testing**: new modules must have tests (pure functions mockable, fixtures for templates)

### User Preferences

- **Simplicity first** — minimum code that solves the problem (from global CLAUDE.md)
- **Surgical changes** — touch only what must be touched, match existing style
- **Goal-driven execution** — define success criteria before implementing, verify before declaring done

## Recent Decisions

_None recorded._

## Open Questions

_None._

## How to update this file

After each significant session, append:

- What was done
- What was decided
- What's next
- Any new constraints discovered
