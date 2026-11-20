# Project overview

Source: [`proposal.md`](../proposal.md) — *Introduction*, *Objectives*, *Justification*, *Conclusion*.

## What is a "džingel"?

Close groups of friends — online or in person — build up an internal, situational humour: a joke
that happened spontaneously in one specific situation and is later reused by referring back to that
situation. In Slovakia this is called a **džingel**. Its meaning depends heavily on the situation it
came from.

## Problem

Over time these džingels fade from memory or get scattered across many chat platforms. People who
were not there (or who forgot) can no longer understand the joke, and the original context is hard
to recall.

## Proposed solution

A lightweight, **privacy-focused, self-hostable** web app where a group keeps its džingels — the
quote **and the context of the situation** — in one place, and can search them later.

- Target audience for hosting: the **self-hosting community** (NAS, home lab), not public cloud
  services. All data stays on the host owner's machine.
- Category: a note-taking app, but niche — built specifically for situational group quotes and
  their context. It is *not* meant to be a generic "share a list of jokes" tool.
- The whole project is **open source**, with a deployment guide so anyone can run the stack on their
  own infrastructure.

## Objectives

1. **Architectural** — design a 3-tier architecture (presentation / application / data).
2. **Implementation** — build the web app with the core functionality needed to solve the problem.
3. **Testing and evaluation** — a lightweight system: ~**200 MB memory**, **4 % CPU** at
   **50 requests per second / 50 concurrent connections**, response latency target **100 ms**.

## Justification

The author repeatedly could not understand jokes and had to keep asking — and the reverse happened
too: others asked about a joke and nobody could recall the exact context.

## Future direction (beyond MVP)

Situational-context **RAG search** over the stored quotes and their context.
