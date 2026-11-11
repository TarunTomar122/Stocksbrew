# The owner's design rules (the judging rubric)

Every rule here comes from the owner's own feedback on the live site (Nov 9-11, 2026), most with screenshots. Builders follow them; judges (Codex, Cursor) score against them and call out every break by page and element. A page that breaks one of these cannot score above 7 on UI, whatever else it does well. Quotes are the owner's words.

## 1. Nothing repeated on every row or card

The rule the owner has repeated most, and is angriest about: "repeating the same thing in every single row just makes it look super ugly. Whether it be the chat icon or the same text or whatever, I need it removed."

- No icon on every row or card: no chat/Ask icon, no eye icon, no chevron (›, ⌄) on rows. "i dont like these chevrons at all i hate it ... id rather not have to click these."
- No identical link text on every row or card ("Why it moved →", "Our view on X →", "Ask about this →", "Open →", "N more →").
- No identical sentence or badge on several cards ("Our call moved to Hold, and you hold it. Review?" ×3). Say a shared event once at the group level; each card shows only what differs.
- The row or card itself is the link, with a hover state. One shared action goes in the section header or footer. One Ask per page, never per item, even when a judge suggests "make every card askable".
- Two buttons that do the same thing are a break ("why two buttons abt ask and chat???").

## 2. Don't make people click to read

- No accordions or "Why" toggles hiding the useful sentence. "you don't need the Why chevron. You could always show that information in the card." Show it.
- Summaries that sit behind a chevron row become cards with the information visible.

## 3. Cards, not tables, for stock items

- Stock items in the briefing, memo, market summaries and similar lists are small cards side by side, with the logo, one big figure and one highlighted fact. "Instead of having this in a table with rows, turn them into small cards ... each stock gets a card with some information that we need highlighted."
- Reads and summaries are visual, not paragraphs: "I don't want to read text." Insights are cards with one big figure, and the weekly memo is charts and cards.
- Cards in a row are equal height.
- Dense data tables (screener, holdings) can stay tables, but tickers only (no long names), names on one line cut with "…", and short column words ("Avg cost").

## 4. No empty space

- "Those weird empty spaces look so bad on the right when there is no card ... It's just so bad."
- No half-empty card rows: a lone card fills its row, and an odd last card spans the row.
- No side rail that ends halfway down while the main column goes on. No card stretched tall over a short list ("hate the empty space here wtf is this ugly").
- No card padded out to match a taller neighbour: fill it with more real content, or size both lists to the same scroll height.

## 5. Lists and tables

- Lists show about 8 rows (the screener about 14) in a fixed height and scroll inside, with no visible scrollbar. If we have 20 names, show all 20 in the scroll ("if we have 20 names why only showing 8?"). Never cut to 4-5.
- Every ticker in a list, table or alert shows its logo, and logos load at once.
- No decorative bars where the number already says it. Tone summaries use one figure ("75% negative"), not two counts.

## 5b. Emails

- No list of every other stock ("the rest of your stocks" chips): "remove the rest part, it's too crowded and useless for an email." An email shows only what happened that matters, then one button to the app.
- Tile grids fill every row on phone and desktop (no lone tile beside an empty slot).

## 6. Visual style

- No coloured top borders on cards: "I simply don't like top borders."
- No small labels above big headings ("i dont like these sub headings in small words on bigger headings").
- Quiet focus states: no thick coloured focus line on inputs.
- Section and nav group labels are quiet and must not look clickable.
- Charts must be readable without a legend lesson ("no clue how to make sense of these red green dots"). Plain numbers beat clever encodings.
- Each place has one icon, used in the nav and beside its own page title.

## 7. Insights first, real data only

- "I want insights, that's what a user will pay for ... don't just show data, show insights." Every page opens with a read: a headline plus up to 3 insights, each with a number compared with a baseline, the stocks it touches, and what to do. Tables are evidence underneath.
- Stocks first, not news first: headlines are evidence attached to a stock, grouped by stock.
- Nothing stale presented as news: "it's 2026 and this is from last year??" A year-old event never leads a page.
- Nothing simulated or made up shown as real. When a reason isn't confirmed, write nothing ("why show no confirmed reason, just not write anything").

## 8. Writing

- Reads like a person wrote it: full sentences, plain words, no AI-sounding phrasing, no truncated sentences. (Don't remove the word "AI" itself.)
- No mechanics copy: no footnotes explaining how the UI, the data or the rule works ("stupid technical details"), and no "what would change it: revisit if momentum breaks..." boilerplate.
- Headlines are short: one idea, about 12-18 words, one number. Caveats go underneath.
- Call words are always Buy more / Keep / Sell some, never Hold / Accumulate / Avoid / Trim. A call shows only its own price level.
- Headlines from sources are not shown in Scraped Title Case.

## 9. Calls

- Calls stay put: no Buy more ↔ Sell some flips within days without a named hard reason (results, a guidance change, a big stock-specific move, a market sell-off). "It goes from accumulate to trim in the span of two days, which is crazy."
- Never show a sale next to a Keep or Buy more call ("here you are saying hold it and sell it at the same time").
- A call's reasons and the conditions that would change it are specific and checkable, with numbers and sources.

## 10. Layout and placement

- Secondary material goes in the right rail, not the main column ("this should be in sidebar on right, cz it's not super important"; e.g. Your agents on the briefing).
- Today includes Premarket ("where is premarket??? need that in today").
- A stock page header must not have an empty left side and too much text on the right.

## 11. Speed

- The app must feel "super fast and snappy". Pages that do too much are a failure even if they look good. No blocking reads or model calls on page load, and keep HTML light.

## 12. Product scope the owner rejected

- No WhatsApp/Telegram/SMS delivery, no public scoreboard of our calls (or hit rate in emails), no browser extension.
- No broker or bank connection, no trade execution.

## 13. Free vs Pro

- Free must not give everything away: locks at high-intent moments make people click Subscribe. They stay honest: no blurred real data, and the call itself and the user's own data stay free.

## How judges use this

Score UI, UX, usability, human wording, agent feel and similarity to volaren.ai out of 10. Then list every break of these rules you can see, as page → element → rule number, before suggesting anything new. Do not suggest anything these rules forbid (e.g. per-card Ask icons, accordions, colored tone edges).
