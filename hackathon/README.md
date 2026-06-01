# Hackathon

Product spec for the hackathon build.

## What We Are Building

A `thesis compiler` for retail investors.

The user writes a short belief, like:

`Semiconductor demand will expand structurally over the next 2 years because AI infrastructure spend is still early, not late. NVIDIA, TSMC, and Micron should benefit.`

The product turns that into a structured object with:
- theme / sector
- beneficiary names
- risk names
- drivers
- disproof conditions
- evidence hooks
- daily conviction score
- portfolio impact

## Core Loop

1. User writes a short thesis
2. The compiler expands it into a structured draft
3. The user reviews the extracted structure
4. The system tracks evidence against the thesis over time
5. The score changes daily as support and contradiction changes
6. The portfolio layer shows what that thesis means for holdings

## MVP Scope

- short-input thesis compiler
- family-based inference for sectors and likely names
- server-side LLM compile path with fallback
- evidence timeline and daily score UI
- simple portfolio impact section

## Non-Goals

- generic stock chat
- single-ticker research memo
- unbounded news scraping
- pretending the model knows everything

## Product Rules

- short input must be enough
- the compiler must do the heavy lifting
- the user should edit the structured result, not write a long memo
- if the evidence is weak, the UI should say so
- the product must feel like a stateful investment tool, not a prompt wrapper

## Current Build Status

- `/hackathon` route exists
- thesis compiler exists
- server-side compile route exists
- daily score and portfolio impact UI exist
- evidence ingestion is still demo-only
