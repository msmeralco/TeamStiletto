# TANAW: Stakeholder Panel Review

> Simulated perspectives, not real people or official Meralco positions.

Challenge reviewed against: **Challenge 2, Know Your Bill, Manage Your Usage** ("How might we help customers understand what makes up their electricity bill, use their own consumption data to manage their usage?").

**What was reviewed:** `README.md`, `hackathon_challenges.md`, `docs/update.md`, `pitch/brief.md`, `www/index.html`, `www/app.js`, `www/lib/flags.js`, `www/lib/disputes.js`, `www/lib/chat.js`, `scripts/serve.mjs`, and a live `npm test` run (all suites pass; the golden real-bill test is skipped because `data/private/golden_bill.pdf` is not present).

Customers come from the challenge text. All other roles are **inferred stakeholders**; the challenge names only customers.

---

## Aling Merly, household budget keeper (customer)
*"Ay, maganda 'yung 'Your bill rose ₱475' agad. Pero after that, ang daming kWh at English."*
- **Works for me:** The answer comes first, in pesos ([app.js:154](../www/app.js#L154)). No login, and the privacy line says nothing is sent ([index.html:52](../www/index.html#L52)). The chat speaks Taglish and gives examples like "bumili kami ng aircon" ([app.js:232](../www/app.js#L232)).
- **Bothers me:** Everything outside the chat is in English ("Multiplier", "Remaining Balance", "kWh used", "self-checks"). The second screen asks me to check 10 fields and a charges table before I see any answer ([app.js:89-108](../www/app.js#L89-L108)). And after the explanation, the app never tells me what I can do to pay less next month.
- **I'd ask:** "Okay, aircon pala. Magkano ang matitipid ko kung bawasan ko ng isang oras?"
- **Verdict:** On the fence. It tells me why but not what to do, and the second screen may lose me.

## Lolo Ben, senior citizen (customer)
*"Masyadong maliit ang sulat. 'Yung apo ko pa ang magbabasa."*
- **Works for me:** Body text is 16px and the main buttons are large ([style.css:8](../www/style.css#L8)). The hotline 16211 comes up when the chat can't answer.
- **Bothers me:** Hints are 13px and badges 11px ([style.css:29-33](../www/style.css#L29-L33)), and those hold the important explanations. My senior discount is parsed, but nothing says whether it was applied correctly; the README admits that warning isn't built ([README.md:18](../README.md#L18)). That is the first thing I would check.
- **I'd ask:** "Nakita ba ng app kung may senior discount ako ngayong buwan?"
- **Verdict:** Would not use it alone. My grandson might.

## Carlo, WFH tech worker (customer)
*"The peso decomposition is legit. The 'Sources and assumptions' panel is what sold me."*
- **Works for me:** Each line names its rate table and URL ([app.js:206-216](../www/app.js#L206-L216)). The projection shows its backtest error. It refuses to split out weather when the fit is weak instead of inventing a number. The LLM only sees my question, never the bill ([README.md:115](../README.md#L115)).
- **Bothers me:** "Send ticket" posts my account number to a server with no login over plain HTTP ([app.js:289](../www/app.js#L289), [serve.mjs:5](../scripts/serve.mjs#L5)). Anyone who knows my CAN and billing date can read Meralco's reply to me ([serve.mjs:55](../scripts/serve.mjs#L55)). Fine for a demo, but say so out loud. There's also no "what's eating my kWh" view: the gadget wattage table exists ([chat.js:10-27](../www/lib/chat.js#L10-L27)) but is only used to argue disputes.
- **I'd ask:** "How many real bills has the parser seen besides the one May 2026 statement?"
- **Verdict:** Would use it for the explanation. Wouldn't send a dispute through it yet.

## Rhea, customer service agent (inferred stakeholder)
*"Every result screen has a 'Possible billing error?' heading. Lahat ng customer iisipin may mali."*
- **Works for me:** The dispute message is well structured: account number, readings, flags, and the household's own answers ([flags.js:96-115](../www/lib/flags.js#L96-L115)). I don't have to re-ask anything. The routing rule sends weak-only cases to "Handled by chatbot" ([disputes.js:15-25](../www/lib/disputes.js#L15-L25)).
- **Bothers me:** That heading ([index.html:85](../www/index.html#L85)) and the "Send anyway" button on every bill ([app.js:299](../www/app.js#L299): "always offered") frame a normal bill as a suspect one. The 14-day "time to follow up with Meralco" nudge is a made-up number ([disputes.js:2](../www/lib/disputes.js#L2)) and will generate follow-up calls to me.
- **I'd ask:** "When the app says 'No Meralco ticket needed', does the customer still see a big send button?"
- **Verdict:** Would back it if the dispute path stays quiet unless there is real evidence.

## Engr. Dante, billing and revenue analyst (inferred stakeholder)
*"Recomputing page 2 line by line from the bill's own numbers is the right instinct."*
- **Works for me:** 19 arithmetic checks driven by a spec file ([bill_spec.json](../www/data/bill_spec.json)), skipped rather than guessed when a number wasn't read. Rate rows that don't sum are rejected ([explain.js:23-27](../www/lib/explain.js#L23-L27)). The rate-mismatch flag only fires above 3%, with local franchise tax acknowledged.
- **Bothers me:** Lifeline rows are ignored ([explain.js:23](../www/lib/explain.js#L23)) and estimated readings aren't detected ([flags.js:72](../www/lib/flags.js#L72)), and those are where real disputes come from. The "half" and "1.5× median" thresholds are self-described judgment calls ([flags.js:41](../www/lib/flags.js#L41)). A ₱482 "hotter month" attribution from one household's 17 points is a model estimate, not a fact; the UI should label it that way.
- **I'd ask:** "What's the false-positive rate of your 'medium' flags on bills that were actually correct?"
- **Verdict:** Would back it for explaining bills. Not yet for flagging errors.

## Hackathon judge (inferred stakeholder)
*"Strong engineering. But half your demo is a dispute system the challenge didn't ask for."*
- **Works for me:** It is honest about status ("Concept, not connected to Meralco", synthetic banner) and the tests really are green. The capped chat answers are a thoughtful use of AI with a clear job.
- **Bothers me:** Challenge 2 has two halves: *understand the bill* and *manage their usage*. The demo script spends about 50 of 110 seconds on the planted error, dispute and dashboard, and nothing helps anyone *manage* usage beyond a projection and a hot/cool chart. Bill components ("what makes up") sit in a collapsed `<details>` ([index.html:79](../www/index.html#L79)). The "how" slide headline, "Everything runs in the browser", overclaims: chat, OCR and disputes all need the laptop ([README.md:6-7](../README.md#L6-L7)).
- **I'd ask:** "Show me what a customer does differently next month because of TANAW."
- **Verdict:** On the fence. Top tier on rigor, weaker on fit to the challenge.

## The skeptical engineer (inferred stakeholder)
*"Your status doc says tests fail and OCR doesn't exist. Your README says both work. Which one is true?"*
- **Works for me:** `npm test` passes 20+ suites, including OCR and page 2. The `shortcut:` markers are an honest map of the placeholders. The service-worker file list is checked by tests.
- **Bothers me:** [docs/update.md](../docs/update.md) is stale and contradicts the code (it says `reasons.json` is empty and OCR is absent), and a judge reading the repo will see it. The native builds are untested on any phone ([app.js:403](../www/app.js#L403)). The pitch notes say the bar splits into "rates, hotter month, billing days, own usage", but the app's bar has two segments ([app.js:166](../www/app.js#L166)). There are three demo dependencies on one laptop (Ollama, PaddleOCR, Wi-Fi) and no backup video yet.
- **I'd ask:** "If Ollama dies on stage, what does the chat do?" (From the code: it falls back to keyword rules. Rehearse saying that.)
- **Verdict:** Would back it after a one-hour docs and demo-hardening pass.

---

## Where they agree
- The peso breakdown and the self-checks are the real strengths (Carlo, Dante, judge, Merly).
- The "manage your usage" half is thin (Merly, Carlo, judge).
- The dispute path is louder than the evidence usually justifies (Rhea, Dante, judge).

## Where they clash
- **Merly vs Carlo:** she wants fewer screens and less detail; he wants every source line. *Resolve with a simple default view and detail behind a tap, which the results screen already does. The confirm screen doesn't.*
- **Rhea vs customers:** Rhea wants dispute buttons only when evidence exists; a customer who feels overcharged wants the right to send anyway. *Keep "send anyway", but behind a link, not as a button under a heading that says "error".*
- **Judge vs the demo:** the dashboard is the most impressive moment, but it lies outside the challenge statement.

## Top 3 changes the panel would push for
1. **Add a "Manage your usage" card (new feature).** Reuse `GADGETS` and the bill's own ₱/kWh (`r.R0`). Show "Your aircon at 8 h/day ≈ X kWh ≈ ₱Y a month; 1 hour less saves ₱Z", plus "To keep next month under ₱___, aim for ___ kWh/day" built from the projection. It covers the missing half of the challenge, all the pieces exist, and it helps Merly, Carlo and the judge. *Cheap: about half a day.*
2. **Put "What makes up your bill" on the main results screen.** Show each charge group (generation, transmission, distribution, taxes…) with its share of the bill and one plain sentence from the FAQ text already fetched. Add a senior/lifeline line saying "shown on your bill, not re-checked". *Cheap: the data is already parsed.*
3. **Reframe the error flow and fix the honesty gaps.** Rename "Possible billing error?" to "Does this bill look right?". Show the send button only on strong or medium evidence, with "send anyway" as a link. Shorten the dispute part of the demo to make room for item 1. Fix "Everything runs in the browser" on the slide and regenerate `docs/update.md`. *Cheapest of the three.*

Also worth it if time allows: a Filipino toggle for the UI copy, and a larger-text mode (Lolo Ben).

## Things to verify
- Is there a real Meralco follow-up or response deadline for billing complaints, or is 14 days arbitrary? ([disputes.js:2](../www/lib/disputes.js#L2))
- The pitch hook, "879 billing complaints… ERC, 2026, Rappler 2026-07-13": has someone opened the source and checked both numbers?
- Does Meralco accept outside-generated dispute files or tickets through any channel, or does the share-sheet route end with a hotline agent re-typing it?
- How do senior-citizen discount and lifeline lines appear on a real bill that has them? The parser has never seen one.
- What does an estimated-reading bill look like on the statement?
