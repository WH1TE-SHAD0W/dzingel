---
name: pii-sanitizer
description: "Privacy rules and the standard TypeScript redaction helper for džingel: keep quote text/context and personal data out of logs, errors and third parties; redact emails and phone numbers from any free text that must be logged; synthetic data in tests. Use when writing logging, error handling, validation of free-text input, or test fixtures."
---

# Skill: PII sanitizer (`pii-sanitizer`)

Quotes are inside jokes about real friends, often minors (`context/security-and-privacy.md`).

## Rules
1. **Never log** quote `text`, quote `context`, group names, usernames or session tokens — log ids
   and outcomes instead: `quote.created id=42 group=3`.
2. **Errors are generic** to the client (`{ "error": "invalid input" }`); never echo the input back
   in an error message.
3. If free text *must* reach a log (e.g. an admin audit note), pass it through `redact()` first.
4. **No third parties:** no external fonts, CDNs, analytics or error trackers in `web/`; no outbound
   calls with user content from `api/`.
5. **Tests and docs use synthetic data**: `alex.dev@example.org`, group "Test Crew", quote
   "synthetic quote 1". `example.org` / `example.com` only.

## Standard helper — `api/src/redact.ts` (create on first use)

```ts
const EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE = /\+?\d[\d\s().-]{7,}\d/g;

/** Mask personal identifiers in free text before it is logged. */
export function redact(input: string): string {
  return input.replace(EMAIL, "[redacted-email]").replace(PHONE, "[redacted-phone]");
}
```

The helper must stay runtime-neutral (no `node:*` imports) so it works on Node and Workers.
Cover it with tests: an email, a phone number with spaces, text with diacritics left intact.
