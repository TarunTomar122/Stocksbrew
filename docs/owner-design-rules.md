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
- Summaries are visual, not paragraphs: "I don't want to read text." The weekly memo is charts and cards.
- Cards in a row are equal height.
- Ranked lists with several facts per stock (Signals' Reddit names, News' most talked about) stay compact tables, not cards: "this table was better off earlier without cards". Each row still carries its signal: the mood or tone (positive/negative talk, as one figure or word) and one highlight (what is being said, the top story), not just a ticker and a number ("where info about positive or negative talk and highlight?").
- Dense data tables (screener, holdings) can stay tables, but tickers only (no long names), names on one line cut with "…", and short column words ("Avg cost").

## 4. No empty space

- "Those weird empty spaces look so bad on the right when there is no card ... It's just so bad."
- Cards in a grid keep one fixed width: an odd last card stays one column wide, never stretched over the row (REVERSED Nov 12: "not a good idea to stretch this card it should be fixed width").
- "Fixed width" means equal columns that FILL the content width, never fixed pixel widths that leave the right side empty (owner, Nov 12, on What you own: "right side is empty and that's so weird, horizontal space empty in many places... use the space nicely"). Check every page at 1280, 1440 and 1920 for empty columns. But filling the width is not "make every card full width" ("just doing grid full width might end up stretching cards for no reason, u need to redesign it"): design the arrangement instead. Cap the content width, pair related modules side by side, size each card to its content, and never pad a sparse card out to a wide column.
- A stock card shows the stock's price and today's % under it, nothing about the position's dollars ("4 numbers are super confusing"). Portfolio dollars live in the positions table.
- A list that has a "N need a look" count shows those N first; the rest fold behind one quiet toggle ("why show me all when only 6 needs a look").
- One primary button per header; extra actions go in a menu off it ("do we need 5 buttons at once???").
- Card grids never scroll inside their own box ("these areas are anti pattern since they are not obvious if they are scrollable"): show the first rows, then one quiet "Show N more" toggle. Only tables keep a max-height box, cut mid-row so a half row shows.
- Every stock card or tile shows the stock's current price beside its move ("in all these places I need the current stock price as well").
- EQUAL HEIGHTS: panels side by side in one row end level ("not same height... same issue u have to fix everywhere"). Stretch them (items-stretch, h-full) and fill the shorter one with real content (more rows, an inline bar, a useful line), never empty space.
- BALANCE CHECK, every two-column or grid page: test every data case (0, 1, few, many items; empty or full side panels; signed out) at 1280, 1440, 1920 and 390, and no column may end with a big empty area beside a taller one ("empty space on left side, u didn't fix all possible cases"). Design the structure so it balances in all of them; don't fix only the case on screen.
- VISUALS CHECK, every page, every review: any list or table of stocks has logos, any list of sectors has sector icons (components/oa/sector-icon.tsx), any list of places, tools or kinds has its icon, and any comparison of numbers gets a bar or chart, not just two numbers. The owner should never have to ask for icons ("why do i have to always tell u to use icons logos visuals lol save that for council reviews"). Judges flag every missing icon, logo or visual as a rubric break.
- Recent days in words, not dates: "today", "yesterday", the weekday name within the last week ("on Monday"), and a date only for anything older ("these dates like nov 11 is so weird like who cares... say yesterday"). Times stay only where the hour matters (premarket, an alert that fired).
- No source lines under facts or checks, and no "Our call since …, last reviewed …" line: the source goes in a hover title or behind the link ("remove those sources, that's taking space for no reason").
- No bare threshold figures beside a sentence that already says them ("what do those percentages even mean").
- No side rail that ends halfway down while the main column goes on. No card stretched tall over a short list ("hate the empty space here wtf is this ugly").
- No card padded out to match a taller neighbour: fill it with more real content, or size both lists to the same scroll height.

- No card without data: a card that can only say "you have not…", "none of your holdings…", "nothing to plan yet" is not shown at all ("dont show cards when we dont have data breh"). Empty states belong on the page that owns them, not as filler cards elsewhere.

## 5. Lists and tables

- Lists show about 8 rows (the screener about 14) in a fixed height and scroll inside, with no visible scrollbar. If we have 20 names, show all 20 in the scroll ("if we have 20 names why only showing 8?"). Never cut to 4-5.
- An inner scroll never traps the thumb: when a list reaches its end, the page keeps scrolling (no `overscroll-contain` on page lists; only popovers, sheets and dialogs may contain their scroll). The owner caught this on a phone: "when i scroll inside a table and reach the end... it doesnt then scroll the entire page".
- Every ticker in a list, table or alert shows its logo, and logos load at once.
- No decorative bars where the number already says it. Tone summaries use one figure ("75% negative"), not two counts.

## 5b. Emails
- An alert row says what the stock did to get there: "fell 4.2% to $139.80, below its $142.07 buy-more level", because the move "changes my decisions a lot". Rows carry logo, ticker, name, price and the % move; the date is said once, never a date column ("why so many dates? it's confusing").

- No list of every other stock ("the rest of your stocks" chips): "remove the rest part, it's too crowded and useless for an email." An email shows only what happened that matters, then one button to the app.
- Tile grids fill every row on phone and desktop (no lone tile beside an empty slot).

## 6. Visual style

- No coloured top borders on cards: "I simply don't like top borders." This covers share cards and link-preview (OG) images too ("u also need to remove the top colored borders from those cards i told u i hate them", Nov 12).
- Share cards and link previews are visual: logos, one big number, a small chart, coloured movers. A text-only card is a break ("these shared cards look ugly as fuck with no visuals").
- No small labels above big headings ("i dont like these sub headings in small words on bigger headings").
- Quiet focus states: no thick coloured focus line on inputs.
- Section and nav group labels are quiet and must not look clickable.
- A chart's axis labels sit right under the line, with space between them and whatever comes next (the owner caught month labels drifting down onto the stats below).
- Charts must be readable without a legend lesson ("no clue how to make sense of these red green dots"). Plain numbers beat clever encodings.
- Each place has one icon, used in the nav and beside its own page title.

## 7. Details first, real data only

- No "read" block on any page (owner, Nov 12, replacing the old "every page opens with a read" rule): "on all the pages I see this, like a main card with some highlighter… it's super useless to me. Unless I force myself I never actually pay attention to any of this… I would rather just go into the details myself… You might have to remove it from all the places." A page opens straight on its real content: the lists, tables and cards. No headline-plus-insight-cards summary at the top, and its content is not moved into some other summary card. Where it held the page's only "as of" time, one quiet timestamp sits near the data.
- Stocks first, not news first: headlines are evidence attached to a stock, grouped by stock.
- Nothing stale presented as news: "it's 2026 and this is from last year??" A year-old event never leads a page.
- Nothing simulated or made up shown as real. When a reason isn't confirmed, write nothing ("why show no confirmed reason, just not write anything").

## 8. Writing

- Reads like a person wrote it: full sentences, plain words, no AI-sounding phrasing, no truncated sentences. (Don't remove the word "AI" itself.)
- No mechanics copy: no footnotes explaining how the UI, the data or the rule works ("stupid technical details"), and no "what would change it: revisit if momentum breaks..." boilerplate.
- Word budget, hard limits (owner, Nov 12: "this is like too much text how are you shipping too much text"):
  - a page title or headline is at most 10 words;
  - no paragraph under a page title: at most one line of 15 words, and only when it says something the content below doesn't;
  - a card is a big figure, a label of a few words saying what it is, and at most ONE line (≤15 words), only when it adds something; never a second, muted sentence ("all of these cards are giving too much sentences instead u could just tell me in one line cant u??");
  - never restate in prose what the cards, table or plan list right below already show.
  When in doubt, cut. A judge counts words and flags every breach as a rule-8 break.
- Call words are always Buy more / Keep / Sell some, never Hold / Accumulate / Avoid / Trim. A call shows only its own price level.
- Headlines from sources are not shown in Scraped Title Case.

## 9. Calls

- Calls stay put: no Buy more ↔ Sell some flips within days without a named hard reason (results, a guidance change, a big stock-specific move, a market sell-off). "It goes from accumulate to trim in the span of two days, which is crazy."
- Never show a sale next to a Keep or Buy more call ("here you are saying hold it and sell it at the same time").
- A call's reasons and the conditions that would change it are specific and checkable, with numbers and sources.

## 10. Layout and placement

- Secondary material goes in the right rail, not the main column ("this should be in sidebar on right, cz it's not super important"; e.g. Your agents on the briefing). But a rail must still pass the BALANCE CHECK (rule 4): where its height can't match the main column across the data cases, it moves under the main content instead. My stocks (Nov 12, "empty space on left side, u didn't fix all possible cases") has no rail: the weekly memo and Your agents are cards after the holdings, in the same columns, laid out so their rows end full.
- Today includes Premarket ("where is premarket??? need that in today"), but only before the open: from 4:00 ET until 9:30 on a trading day. After that the nav hides it and /premarket goes to Market today ("premarket should only be shown until the stock market opens that day").
- A stock page header must not have an empty left side and too much text on the right.

- My stocks is about the person's stocks, not the tools: "a lot of useless insights, I'd rather have more useful stuff about my stocks". Each holding with its move, gain, call and the one thing that matters for it; tools (stress test, goal planner, dividends) are links, not cards.
- Agent status reads in two seconds: one row per agent (kind, short name, a figure, when it ran) and flagged stocks as logo chips with their move. No "Checked: …" paragraphs ("what is this design and why is it so text").

- Biggest things first (Nov 13): the top of /agent and /briefing is "Biggest things" (Needs you sits under it, only when something waits), leading with the biggest real events on the person's stocks, ranked by impact: earnings with the after-hours move (CBRS +18% after hours), big news moves (SMCI −11% on a DOJ probe), filings that change the story. Never practice-account buy suggestions there ("I don't want the practice account thingy. That one is useless for me"). The record never shows expired reminders. 5%+ move lines stay ("I needed that").

## 11. Speed

- The app must feel "super fast and snappy". Pages that do too much are a failure even if they look good. No blocking reads or model calls on page load, and keep HTML light.

## 12. Product scope the owner rejected

- No WhatsApp/Telegram/SMS delivery, no public scoreboard of our calls (or hit rate in emails), no browser extension.
- No broker or bank connection, no trade execution.

## 13. Free vs Pro

- Free must not give everything away: locks at high-intent moments make people click Subscribe. They stay honest: no blurred real data, and the call itself and the user's own data stay free.

## How judges use this

Score UI, UX, usability, human wording, agent feel and similarity to volaren.ai out of 10. Then list every break of these rules you can see, as page → element → rule number, before suggesting anything new. Do not suggest anything these rules forbid (e.g. per-card Ask icons, accordions, colored tone edges).
