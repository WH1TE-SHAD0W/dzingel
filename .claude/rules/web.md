---
paths:
  - "web/src/**"
---

# Frontend guardrails (Astro)

Users include children (7–17), vulnerable people needing accessibility support, and people over 65
(`context/users-and-actors.md`). Design for the least technical of them.

1. **Minimal JavaScript** (NFR-07): prefer static Astro markup; client scripts only for interaction.
2. **Render user content as text** — `textContent` / Astro `{expr}` escaping. Never `innerHTML`,
   `set:html` or `insertAdjacentHTML` with user data.
3. **Accessibility** (NFR-05): every input has a visible label or `aria-label`; buttons have
   descriptive text; visible focus styles; keyboard-operable; colour contrast ≥ 4.5:1; base font
   ≥ 16px; errors announced in text (not colour alone); replace `prompt()`/`alert()`/`confirm()`
   with accessible in-page UI when touching those flows.
4. **No third-party requests** — no external fonts, CDNs, analytics or embeds (privacy stance).
   Self-host any asset.
5. **Frontend validation mirrors the API** (`maxlength` 1000 for quote text, etc.) but is never the
   only check (SEC-01).
6. Talk to the backend only through relative `/api/...` URLs — the proxy (Vite dev, NGINX, or the
   Cloudflare service binding) routes them.
