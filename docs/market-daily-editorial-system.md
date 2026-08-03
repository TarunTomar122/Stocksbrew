# Market Daily editorial system

## Product promise

Market Daily is a short, evidence-backed letter published before the US open.
It explains the previous session, checks what changed overnight, and identifies
the few conditions that matter next. It is not a feed of headlines and it does
not pretend that every market move has one clean cause.

The reader should finish with:

1. one coherent explanation of the market;
2. the evidence behind that read;
3. the stocks that moved differently from the crowd;
4. what changed before the next open.

## What the best daily letters do

This system studies techniques, not wording. It must never mimic a publication
or writer.

- **Opening Bell Daily** usually builds an edition around one observable
  contradiction, such as weak chips alongside strong equal-weight breadth.
  The headline makes an argument and the body earns it with a compact run of
  data.
- **Axios Markets** gives paragraphs explicit jobs: what happened, why it
  matters, the other side, and the bottom line. That makes a causal argument
  easy to audit.
- **Sherwood Snacks** uses contractions, concrete nouns, short transitions,
  and occasional wit. Its accessibility comes from sentence craft, not from
  removing complexity.
- **Reuters standards** require accurate attribution, warn against hype, and
  distinguish verified facts from rumours or explanations still being tested.
- **Sherwood editorial standards** combine primary documents and secondary
  reporting, disclose conflicts, and correct material mistakes visibly.

Reference pages:

- https://www.openingbelldailynews.com/
- https://www.axios.com/newsletters/axios-markets-ef89ee10-5392-11f0-8045-b1a64bcaa320
- https://sherwood.news/snacks/newsletters/
- https://reutersagency.com/about/standards-values/
- https://sherwood.news/editorial-standards/

## Stocksbrew voice

The voice is direct, observant, lightly informal, and comfortable with
uncertainty. It sounds like one person who understands the market and can
explain it without newsroom shorthand.

Use:

- a specific first sentence;
- contractions where they occur naturally;
- varied paragraph and sentence length;
- plain verbs;
- one restrained aside when it genuinely adds clarity;
- active attribution;
- transitions that respond to the previous paragraph;
- a clear distinction between fact, reported explanation, and inference.

Avoid:

- em dashes;
- generic scene setting;
- stacked rhetorical questions;
- fake quotations;
- “in today’s fast-paced market” language;
- “navigate”, “landscape”, “delve”, “crucial”, “pivotal”, “realm”, “tapestry”,
  “underscores”, “it is worth noting”, and “only time will tell”;
- repetitive three-item lists;
- a conclusion that merely repeats the introduction;
- telling the reader to buy, sell, or hold.
- trader shorthand such as “the tape”, “calm open”, “modest bid”, “green
  board”, “risk-on”, “risk-off”, and “quality of the bid”;
- rhetorical reversals such as “not X but Y”, “this isn’t X, it’s Y”, and
  “less X, more Y”.

## Edition shape

The article is 600 to 800 words with two or three natural headings. It opens
with a specific observation, explains one central market idea, includes the
important stock outliers, and ends in one short paragraph. It has no bullet
list or scenario checklist.

Every edition contains exactly three interactive components. The anomaly rail
is required and shows unusual movers, gainers, and losers. Two additional
components are chosen from the sector chart, index chart, market pulse,
premarket board, and premarket mover cards. Components carry most of the raw
figures so the prose can remain readable.

## Evidence hierarchy

1. Stocksbrew timestamped price, breadth, sector, anomaly, and premarket data.
2. Primary sources: filings, investor relations, government releases, central
   banks, and exchange notices.
3. High-quality reported sources with a visible publication time.
4. Bounded Firecrawl search for gaps in the explanation.
5. Market-data inference, clearly labelled and never presented as a catalyst.

An unsupported explanation is written as unresolved. That is a useful result.

## Generation and publication

The full evidence pack goes to one direct OpenAI writer call using GPT-5.5. There
is no reviewer model, repair call, fallback-model carousel, or deterministic
attempt to score whether prose feels human. The prompt owns style and length.

The operational validator only checks that the artifact can be rendered and
published safely: required fields, known source identifiers, usable component
markers, previous-session and premarket timestamps, no investment advice, and
no em or en dash. A failure stops publication instead of triggering another
model call.

Every published document stores its model, evidence hash, sources, operational
validation result, word count, generation time, data components, and correction
status. On weekdays, publication runs after the 2 PM IST premarket pipeline has
completed successfully. Transient failures retry automatically. Idempotency and
previous-session checks prevent duplicate editions on reruns and market holidays.

Each archive card uses a deterministic, date-specific CC0 cover selected from a
larger topic-matched result set. Consecutive editions therefore do not all reuse
the first image returned by the provider.

## Corrections

Corrections update the same dated edition. Material changes add a plain
correction note and retain the original publication timestamp. Silent fixes
are limited to spelling, punctuation, or broken links.
