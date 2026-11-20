# 0005. Answer 404 for group-scoped resources the caller cannot access; 403 only for inviting

- **Status:** Accepted
- **Date:** 2026-11-20
- **Source:** WH1TE-SHAD0W/dzingel#3 (AC5), #5 (AC2, AC5); FR-05, FR-09, SEC-03 in `context/requirements.md`; `api/src/app.ts`

## Context
Quotes are private to a group's members. A distinct status for "exists but not yours" would let any
user probe which group or quote ids exist. #3 AC5 allows 403 or 404 for non-members; #5 AC2
explicitly requires 403 for an inviter who is not a member.

## Decision
For groups and quotes, a resource the caller is not a member of answers `404 { "error": "not found" }`,
indistinguishable from a resource that does not exist. This applies to listing/creating quotes in a
group, `GET/PUT/DELETE /api/quotes/:id` (the SQL itself only matches rows in the caller's groups) and
invite responses addressed to someone else. The one exception is `POST /api/groups/:id/invites`: a
non-member gets `403`, whether or not the group exists, as #5 requires. Input validation (`400`)
runs before the membership check, so malformed requests never reveal existence either.

## Consequences
- Easy: no information leaks through status codes or error bodies; authorisation is expressed in the
  SQL (`group_id IN (SELECT group_id FROM group_members ...)`), so a route cannot forget it.
- Hard: a client cannot tell "you were removed" from "never existed"; error messages are less helpful.
- The invite 403 is the only place where status distinguishes membership. It still does not reveal
  whether the group exists, but it differs from the 404 convention on purpose; do not "fix" it to
  404 without changing #5.
- A new group-scoped route must follow the same rule and have an auth check (SEC-03; `.claude/rules/api.md` §5).

## Verification
Reported by `tester` (re-run by the supervisor): API "Test Files 7 passed (7) / Tests 247 passed
(247)"; web "Test Files 1 passed (1) / Tests 14 passed (14)". Membership and invite behaviour is
covered in `api/test/membership.test.ts`, `api/test/quote-by-id.test.ts` and
`api/test/invites.test.ts`.

## Alternatives considered
- **403 for non-members everywhere:** rejected - confirms the id exists to an unauthorised user.
- **404 for the invite endpoint too:** rejected - #5 AC2 requires 403 for a non-member inviter.
- **Membership check before validation:** rejected - the order would let a valid-looking id be
  distinguished from a malformed one only by status; validating first keeps responses independent of
  stored data.
