# Users and actors

Source: [`proposal.md`](../proposal.md) — *Users*, *Actors*.

## User groups

| Group | Who | What they need from the app | Design implications |
|---|---|---|---|
| **Skilled users** | Comfortable with technology | No explanation or accessibility aids required | Fast, no hand-holding; keyboard-friendly |
| **Children (7–17)** | Young users inside a friend group | Simple use; their data is stored, so **parental oversight** is required | Parental oversight features; safe defaults; no public exposure of content |
| **Vulnerable people** | Users who need extra accessibility | Easy, low-friction navigation; understandable UI | WCAG-minded UI: labels, contrast, focus states, large hit targets, plain language |
| **Older people (65+)** | Expected to use it least; replacing paper notes | Read the context to understand the jokes of the younger generation and stay connected | Readable typography, clear context display, read-mostly flows must be effortless |

**Design rule derived from this table:** every UI change must work for the *least* technical group,
not just the skilled one. See `.claude/rules/web.md`.

## Actors

| Actor | Responsibilities |
|---|---|
| **Developer** | Builds and maintains the software (this repository). |
| **Admin** | Deploys the app on a self-hosted device (NAS / home lab). Manages **user identities** and server settings. |
| **User** | Normal person using the web app: reads, creates, edits, shares and searches quotes in their groups. |

## Implications for roles (application tier)

The proposal states: *"User authenticates and gets designated role. By this role they come in and do
authorised actions."* The minimum role set implied by the actors is:

- `admin` — server settings, user identity management, settings icon in the header.
- `user` — group membership and quote operations.
- *(implied by the children group)* a **parent/guardian** oversight relationship over a minor's
  account. The proposal requires the feature but does not define its shape — this is an open
  question to settle in a ticket before implementation (see `backlog.md`, epic E5).
