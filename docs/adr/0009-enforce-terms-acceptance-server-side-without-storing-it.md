# 0009. Enforce Terms acceptance on the server at registration, without storing it

- **Status:** Accepted
- **Date:** 2026-11-22
- **Source:** WH1TE-SHAD0W/dzingel#23 (acceptance criteria 5 and 9, open questions 3, 4, 5, 6, decided by the maintainer); SEC-02 and NFR-04 in `context/requirements.md`; data minimisation in `context/security-and-privacy.md`.

## Context
Users include minors and the app holds personal data about real people. #23 asks for Terms and a Privacy notice with explicit acceptance at registration. A frontend checkbox alone is only a convenience (SEC-02). The issue offered storing the accepted version and timestamp per user (AC 6, conditional) or not storing anything. Self-hosters run their own instances (NFR-04), so one fixed legal text cannot be right for all of them, and the project cannot supply final legal wording.

## Decision
`POST /api/auth/register` requires the boolean `acceptTerms: true`. The check runs in the route wrapper before Better Auth is called; missing, false or non-boolean values answer `400` with `fields.acceptTerms = "must be accepted"`, merged with other field errors, and no user is created. Acceptance is not stored: no column, no migration (AC 6 does not apply). The Terms and Privacy pages are public static English pages; operator name, contact and effective date are build-time `PUBLIC_*` variables (`web/src/lib/legal.ts`) and the body text is edited in the page files. The shipped text is a marked DRAFT, not legal advice, and final wording is human-owned.

## Consequences
- Nothing new about a user is stored, so there is no new personal data, no directory leakage risk and no migration on node:sqlite or D1.
- There is no proof of who accepted what or when. If a jurisdiction or operator needs that record, a new numbered migration and a superseding ADR are required.
- Terms have no version, so a changed text cannot trigger re-acceptance. Existing users are not re-prompted (out of scope per the maintainer).
- Changing operator details needs a rebuild and redeploy; there is no runtime editor or admin UI.
- Only English is provided.
- Open items, not decided here: parental consent and an age threshold for minors (jurisdiction dependent; the guardian feature FR-12 is undefined), re-acceptance by existing users, and the final legal wording. Proposed for the maintainer: assign a requirement ID in `context/requirements.md` for terms acceptance.
- Do not drop the server-side check on the grounds that the form has a required checkbox.

## Verification
Reported by `tester` (not run by `documenter`): api `Test Files 10 passed (10) / Tests 369 passed (369)`; web `Test Files 7 passed (7) / Tests 261 passed (261)`; both typechecks clean (astro check 0 errors).

## Alternatives considered
- **Store accepted version and timestamp per user (AC 6):** rejected by the maintainer; it adds personal data and a migration to meet a need (proof of consent) that is not yet established, and consent for minors is unresolved anyway.
- **Frontend checkbox only:** rejected; a direct API call would bypass it, contrary to SEC-02.
- **Fixed legal text for all deployments:** rejected; self-hosters are different operators (NFR-04) and need their own name, contact and wording.
- **Runtime or admin-editable terms:** rejected; out of scope in #23 and would need storage and an admin UI.
- **Slovak or both languages:** not chosen; the maintainer decided English only.
