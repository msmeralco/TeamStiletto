# Researched Topics — Challenge 1: Clean Energy Adoption and Rewards

> **Problem statement (from `hackathon_challenges.md`, source of truth):**
> "How might we help customers compare solar options, and to recognize and reward sustainable energy choices, using clear, comparable and verifiable information?"

**Extracted elements (summary only — no new requirements added):**
- Users: Customers
- Goals: Compare solar options; recognize and reward sustainable energy choices
- Constraint: Information must be clear, comparable and verifiable

---

## Topic A: How customers compare solar options today (Philippines context)

### A1. Meralco's official solar/net-metering guidance
- Meralco maintains a "Solar & Net-Metering" advocacy hub with Net Metering 101, program details, application process, and FAQs (company.meralco.com.ph/advocacies/net-metering/frequently-asked-questions, accessed 2026-11-12).
- Meralco's own pre-solar checklist tells customers to consider (biz.meralco.com.ph — Solar & Net-Metering, accessed 2026-11-12):
  - Panel direction (south-facing recommended; Philippines is above the equator) and shading.
  - Roof structural capability (galvanized iron sheets usually sufficient, but consult the provider).
  - Choosing a reputable solar provider with after-sales service and interconnection experience.
  - Sizing the system against their **usage pattern (load profile) and peak consumption**.
- Key gap this highlights: comparison guidance exists, but it is scattered across FAQ pages and is largely advice, not a side-by-side comparison tool (Meralco FAQ pages, accessed 2026-11-12 — synthesis).

### A2. Solar market economics (why adoption is accelerating)
- Residential rooftop solar payback in the Philippines fell from **4.0 years (May 2025) to 3.1 years (May 2026)**; commercial 2.3 years; industrial 3.1 years (Ember, 2026-05-28, ember-energy.org/latest-insights/how-the-philippines-rooftop-solar-surge-can-flip-the-energy-emergency-script).
- Drivers: Meralco retail prices rose ~17% year-on-year for residential customers (May 2026 vs May 2025) and solar installation costs fell ~10% in the same period (Ember, 2026-05-28, same report; corroborated by BusinessMirror, 2026-05-28, businessmirror.com.ph/2026/05/28/phl-has-priciest-residential-electricity-in-sea-think-tank/).
- Philippines now has the **highest residential electricity price in Southeast Asia** (DOE comparison, March 2026, as cited by Energy Tracker Asia, 2026-09-24, energytracker.asia/six-months-into-energy-emergency-philippines-rooftop-solar-surges-but-barely-taps-its-potential/).
- Rooftop capacity grew from ~721 MW (early 2025) to ~1,300 MW (early 2026); only ~1% of the theoretical 106,000 MW rooftop potential (ICSC estimate) (Ember, 2026-05-28, same report; LiCAS News, 2026-05-29, philippines.licas.news/2026/05/29/rooftop-solar-growth-offers-path-out-of-energy-crisis-report-says).
- 2025 panel imports (~5,068 MW) far exceeded grid-connected utility-scale installs (~800 MW) — supply is on the ground (Philstar, 2026-07-03, philstar.com/business/2026/07/04/2539603/filipinos-going-solar; pv magazine, 2026-05-28, pv-magazine.com/2026/05/28/philippines-imported-4-gw-of-chinese-solar-panels-in-january-april).
- ~20% of households in Metro Manila and nearby provinces are interested in installing solar PV — Ateneo de Manila study, as cited in Meralco's Integrated Report 2025 (meralco.com.ph/sites/default/files/2025-annual-report/web/reports/integrated-report/MERALCO-Integrated-Report-2025.pdf, published 2026-06-15).
- 82% of surveyed households expressed some interest in solar (2024) (Ember, 2026-05-28, same report).

### A3. What a "solar comparison" typically includes (tools from other markets)
- **SunSPOT (Australia)** — free, not-for-profit calculator by UNSW + Australian PV Institute: 3D roof/shading mapping, system-size recommendation, cost, payback, annual savings, battery option; explicitly "not aligned with any solar company" — an example of *verifiable, independent* information (solar.vic.gov.au/solar-assessment-calculator, accessed 2026-11-12).
- **Energy Saving Trust (UK) solar calculator** — system size, cost, savings estimate from a few questions; prepares customers for certified-installer conversations (energysavingtrust.org.uk/tool/solar-energy-calculator, accessed 2026-11-12).
- **Solar quote-comparison tools (US)** — normalize multiple installer quotes on cost-per-watt, verify production claims against NREL PVWatts, flag red flags (inflated production, hidden fees), and score quotes on a 100-point scale (renewestimator.com/tools/solar-quote-comparison, accessed 2026-11-12).
- **Utility-branded rooftop assessments (Vera Water and Power)** — questionnaire → generation potential, ongoing utility costs, payback, with configurable system sizes (vera.chooseev.com/solar/solar-calculator, accessed 2026-11-12).
- US DOE consumer guidance recommends comparison-shopping multiple installers and verifying installer certification (NABCEP) before purchase (energy.gov — "Walk Me Through It: A Step-By-Step Guide for Consumers Going Solar", energy.gov/cmei/systems/articles/walk-me-through-it-step-step-guide-consumers-going-solar, accessed 2026-11-12).
- Australian government guidance: ask retailers what assumptions their savings calculations are based on; use an independent calculator (SunSPOT) for a second opinion (energy.gov.au/solar/solar-system-design/size-your-solar-system, accessed 2026-11-12).

Common comparable metrics across quotes/systems (synthesis of the tools above):
- Installed cost (₱/kWp or ₱/W)
- Estimated annual generation (kWh/kWp specific yield)
- Estimated bill savings and payback period
- Equipment (panel wattage, inverter brand/type) and warranties
- Installer credentials

---

## Topic B: The regulatory framework (what makes information "verifiable")

### B1. Net-Metering program (RA 9513 / Renewable Energy Act of 2008)
- Customers may install an RE facility up to **100 kW** and export unconsumed electricity to the DU; export value is credited against the monthly bill (RA 9513, as summarized by Meralco — company.meralco.com.ph/advocacies/solar-net-metering/what-is-net-metering, accessed 2026-11-12).
- Eligibility (Meralco): RE system ≤100 kW; account under applicant's name; account in good credit standing (meralco.com.ph/residential/help-support/frequently-asked-questions/net-metering, accessed 2026-11-12).
- Technologies are not limited to solar PV (wind, hydro, biomass also eligible); rooftop solar is the most common in the Philippines (Meralco Net-Metering FAQs, biz.meralco.com.ph/news-and-advisories/net-metering-faqs, accessed 2026-11-12).
- Export energy is measured with a **bi-directional meter**; an optional **REC meter** measures actual generation, with ERC-prescribed estimation if not installed (Meralco residential Net Metering FAQ, meralco.com.ph/residential/help-support/frequently-asked-questions/net-metering, accessed 2026-11-12).
- Costs to the customer: application is free; **Distribution Impact Study (DIS) is free** (Section 17, 2025 Amended Net-Metering Rules); bi-directional meter replacement fee capped at **₱3,000** for residential (ERC Advisory, 2025-09-22, meralcomain.s3.ap-southeast-1.amazonaws.com/images/ckeditor-documents/Advisory%20to%20On%20Grid%20Distribution%20Utilities%20in%20Compliance%20with%20the%20Net%20Metering%20Program.pdf); COC application fee **₱1,500** (Meralco residential FAQ, above).
- Excess credits carry over and appear on the bill's front page broken into non-VAT/VAT components ("Net-Metering Export Energy") (biz.meralco.com.ph — Solar & Net-Metering, accessed 2026-11-12) — an existing *verifiable* artifact of sustainable choice.
- Customers can pair Net-Metering with Meralco's **Peak/Off-Peak (POP) program** (Meralco Net-Metering FAQs, biz.meralco.com.ph/news-and-advisories/net-metering-faqs, accessed 2026-11-12).
- Customers with solar who do NOT export must inform Meralco and register under the **Zero Export (ZE) program** for safety (company.meralco.com.ph/advocacies/net-metering/frequently-asked-questions, accessed 2026-11-12).

### B2. Recent streamlining (2025–2026) — relevant timing context
- SONA 2025 directive → ERC Advisory (2025-09-22): uniform/streamlined documentary requirements (application form, LGU CFEI, Net-Metering Agreement — notarization not mandatory, COC fee); DUs may not add requirements such as bills of materials or equipment catalogs (ERC Advisory PDF, meralcomain.s3.ap-southeast-1.amazonaws.com, 2025-09-22).
- DOE-DILG-DPWH JMC No. 001, s. 2026: electrical permits within **3 working days**; CFEI within **7 working days**; "no additional requirements" policy; deemed approval on inaction (Philippine News Agency, 2026-01-27, pna.gov.ph/articles/1267797).
- DOE Advisory (2026-03-30) fast-tracks net-metering applications nationwide (doe.gov.ph — Advisory on Fast Tracking the Net Metering Applications, prod-cms.doe.gov.ph/documents/d/guest/a-advisory-on-fast-tracking-the-net-metering-applications-pdf).
- Amended Net-Metering Rules (ERC Res. 15, s. 2025, later amended 2026): net-metering approval reduced to ~10 days; multi-site and aggregate net metering introduced (Feb 2026) (Ember, 2026-05-28, same report; ERC resolution text at erc.gov.ph/Files/Render/media/OGCS-PROM%20Annex%20A%202026-014%20RM.pdf/).
- DOE own-use guidelines (2026-08): micro-systems ≤1 kW (micro-inverters ≤0.8 kW) exempt from COC; plug-and-play <1 kW exempt from building permits; utilities barred from imposing pre-installation clearances/fees for own-use systems (pv magazine, 2026-08-11, pv-magazine.com/2026/08/11/philippines-eases-rules-for-own-use-solar-systems).
- From June 2026, customers with >100 kW demand can enter solar power purchase agreements under updated RCOA regulations; GSIS offers a 5% "Ginhawa Solar Energy Loan" program (Ember, 2026-05-28, same report).
- Approval delays remain a live complaint — ERC and Meralco publicly committed to faster approvals at a Senate hearing; Meralco reports its part can take ~3 days in streamlined cases (Inquirer, 2026-09-10, newsinfo.inquirer.net/2303165/erc-meralco-vow-faster-net-metering-approvals-for-solar-power-users).
- Implication: the application path is being simplified — a solution should reflect the *current* simplified process and can point to official rules (RA 9513, ERC resolutions, DOE advisories) as the verifiable basis for claims (synthesis of sources above).

### B3. Other official "clean energy choice" mechanisms for Meralco customers
- **Green Energy Option Program (GEOP)** — customer choice program letting eligible end-users source 100% renewable energy from a licensed retail supplier; Meralco hosts GEOP onboarding info (switching requires 90-day notice) (company.meralco.com.ph/products-services-and-programs/green-energy-option-program-geop, accessed 2026-11-12) — an official, verifiable "sustainable choice" beyond rooftop solar.
- **MSERV** — Meralco's subsidiary for energy-efficiency solutions; conducted 200+ energy audit projects in 2024 (Meralco environmental responsibility report PDF, meralco.com.ph/sites/default/files/inline-files/9a2e083c6961caa6cb54bab52fc45d1c.pdf, accessed 2026-11-12).
- Note: GEOP eligibility thresholds referenced in Meralco materials are 50 kW and 100 kW demand — verify current thresholds before relying on specific numbers (meralco.com.ph/residential/energy-solutions/customer-choice-programs/green-energy-option-program, accessed 2026-11-12).

---

## Topic C: Recognizing and rewarding sustainable choices

### C1. Established reward mechanics from utility programs
- **Bill credits**: PG&E "Power Saver Rewards" compensates customers per kWh reduced during peak events — simple, meter-verified rewards (PG&E FAQ, powersaver.pge.com/faq, accessed 2026-11-12).
- **Gamification**: utility programs use points, badges, leaderboards, peer comparison, and competitions ("Beat the Peak", "Biggest Energy Saver" by Oncor/CenterPoint, Alectra/Horizon's "Take Charge") (E Source, 2019-12-16, esource.com/129191fzn6/what-are-some-ways-use-gamification-neighborhood-energy-efficiency-programs).
- Gamified energy programs can achieve 3–10% savings, but reviews warn that points/badges alone can feel hollow; rewards should tie to real customer actions, effort, and impact — not just consumption level (ScienceDirect — "Not so gameful: A critical review of gamification in mobile energy applications", 2019-05-01, sciencedirect.com/science/article/abs/pii/S2214629618309034).
- **Behavior-based Home Energy Reports (HERs)** are the most widespread utility behavior program, delivering meter-data-driven personalized feedback at scale (ACEEE, 2026-05-20, aceee.org/wp-content/uploads/2026/07/b2601.pdf).
- **Tiered rewards** that require consistent reductions smooth demand response and avoid post-event snap-back spikes (United Energy/Bidgely pilot, Australia) (Utility Dive, 2016-05-18, utilitydive.com/news/gamification-for-the-grid-inside-bidgelys-australian-demand-response-pilo/419230).
- Program-design best practices: keep competitions short (6 weeks–1 year), define clear rules, personalize tips, use social comparison (E Source, 2019-12-16, same link).

### C2. What Meralco already has (to build on, not duplicate)
- **Bright Ideas** — customer information drive on saving energy; **Orange Tag** — appliance label showing estimated cost per use; **Appliance Energy Calculator** — tracks appliance consumption (Meralco Sustainability pages, meralco.com.ph/sustainability, accessed 2026-11-12).
- **My Meralco / Meralco Online** — digital account platform (launched 2024) — a natural home for a solar comparison + rewards module (Meralco Prosperity chapter PDF, meralco.com.ph/sites/default/files/inline-files/c10478187dd6e3161cf5d4c308f6e3c1.pdf, accessed 2026-11-12).
- **Revamped bill** (Sep 2021) — shows historical consumption and the equivalent **carbon emissions** of monthly use (Meralco Sustainability pages, meralco.com.ph/sustainability, accessed 2026-11-12).
- **Trash-to-Cashback Program** — customers traded recyclables at select Business Centers for points applied to electricity bills — an existing precedent for *bill-applied rewards* (Meralco Annual Report 2022 brand/stewardship PDF, meralco.com.ph/sites/default/files/2023-07/9dbe0013c07df9323ad8578505c9c557.pdf, published 2023-07-05).
- **AMI rollout** — nearly 3.3 million smart meters filed with ERC; goal of converting 11 million customers to AMI by 2034 — the data backbone for verifiable, usage-based recognition (Meralco Prosperity chapter PDF, same link).
- Student-hackathon precedent (Meralco Power Academy 2024): a net-metering dashboard tracking solar production/consumption/exports in real time with an ERC-20 token ("BLTZ") rewarding surplus exports, redeemable for bill discounts — regulatory treatment of such tokens would need care (MPA Annual Report 2024, meralcopoweracademy.org/wp-content/uploads/2025/06/MPA-Annual-Report-2024-.pdf, published 2025-05-23).
- Meralco's sustainability framework is "Power, Planet, People, Prosperity"; net-metering customers grew to ~19,900 active as of 2025 (Meralco Integrated Report 2025, meralco.com.ph, published 2026-06-15).

### C3. Reward anchor points that are already verifiable
- Bi-directional meter import/export readings (Meralco Net Metering FAQ, meralco.com.ph/residential/help-support/frequently-asked-questions/net-metering, accessed 2026-11-12).
- Net-metering credits already itemized on the bill (biz.meralco.com.ph — Solar & Net-Metering, accessed 2026-11-12).
- Bill's carbon-equivalent figure (Meralco Sustainability pages, meralco.com.ph/sustainability, accessed 2026-11-12).
- AMI interval consumption data (Meralco Prosperity chapter PDF, accessed 2026-11-12).
- Enrollment status: Net-Metering, Zero Export, GEOP — official program states (Meralco FAQ and GEOP pages, accessed 2026-11-12).

---

## Topic D: Mapping findings to the challenge goals

### Goal 1: Compare solar options
- Comparable, verifiable inputs exist: system size (kWp), ₱/kWp installed cost, expected specific yield, payback, equipment specs, installer accreditation, net-metering eligibility (≤100 kW, good credit standing) (Meralco FAQ pages and market tools cited in Topics A–B, accessed 2026-11-12 — synthesis).
- Meralco can anchor estimates to its own data: customer's load profile (per Meralco's own sizing advice), current residential rates, and the actual net-metering credit mechanics on the bill (biz.meralco.com.ph — Solar & Net-Metering, accessed 2026-11-12).
- Independence is a trust lever: SunSPOT's "not aligned with any solar company" positioning shows why an unbiased comparison builds confidence; quote-normalization and red-flag checks are proven patterns (solar.vic.gov.au and renewestimator.com, accessed 2026-11-12).

### Goal 2: Recognize and reward sustainable choices
- Recognition can be metered and official: net-metering enrollment/export kWh, GEOP switching, own-use solar registration, bill carbon figure (Sources in Topics B–C).
- Rewards precedents: bill credits (PG&E-style, powersaver.pge.com/faq), bill-applied points (Trash-to-Cashback precedent inside Meralco), badges/leaderboards (gamification literature), tiered consistency rewards (Utility Dive, 2016-05-18).
- Constraint fit: rewards tied to metered export/verified program enrollment satisfy "verifiable"; rewards tied to the customer's own measured data satisfy clarity and comparability (synthesis of Topics B–C).

### Constraint: clear, comparable, verifiable information
- Clear: simple metrics (size, cost, payback, savings) in one place; plain-language process steps (market tool patterns, Topic A3).
- Comparable: same normalized metrics across quotes/options; side-by-side scoring (renewestimator.com/tools/solar-quote-comparison, accessed 2026-11-12).
- Verifiable: cite official rules (RA 9513 via Meralco; ERC Advisory 2025-09-22; DOE advisories 2026-03-30 and JMC 001 s. 2026); use metered data and documented fees (₱3,000 cap, ₱1,500 COC fee); independent production estimates rather than vendor claims (Sources in Topic B).

---

## Gaps / to verify before building
- Exact current GEOP eligibility thresholds (50 kW vs 100 kW figures differ across Meralco pages — meralco.com.ph GEOP pages, accessed 2026-11-12).
- Current average residential installed solar cost per kWp in Metro Manila (Ember cites a ~₱60/watt-equivalent figure whose units need clarification — Ember, 2026-05-28).
- Any ERC/DOE rules on rewards or bill discounts for sustainable behavior (whether a utility may offer non-tariff rewards — not found in current research).
- Whether the REC-meter generation-estimation methodology (ERC Section 19 formula) can be reused for customer-facing yield comparisons (referenced in Meralco FAQ but formula text not captured).

---

# Researched Topics — Challenge 2: Know Your Bill, Manage Your Usage

> **Problem statement (from `hackathon_challenges.md`, source of truth):**
> "How might we help customers understand what makes up their electricity bill, use their own consumption data to manage their usage?"

**Extracted elements (summary only — no new requirements added):**
- Users: Customers
- Goals: Understand the components of an electricity bill; manage usage
- Data: The customer's own consumption data

**Summary:** Meralco already publishes an unbundled bill explainer, a monthly consumption tracker, an environmental-impact estimate, an Appliance Calculator, Orange Tags, prepaid (Kuryente Load), Peak/Off-Peak pricing, and a smart-meter (AMI) program that is being scaled to ~12 million endpoints. The bill is ~64% generation and only ~12% distribution, so most of a customer's bill moves with fuel, forex, WESM prices and pass-through charges — not with Meralco's own rate. The biggest customer pain points documented in 2026 are bill spikes, estimated/catch-up readings, and disputes, which the ERC has addressed with stay-of-disconnection and "pay average while under investigation" rules.

---

## Topic A: What makes up a Meralco bill

### A1. The unbundled bill (2025 average)
- 2025 average residential bill mix: **64% generation, 12% distribution, 11% other charges, 8% transmission, 5% system loss** (Meralco "Understand Your Bill", updated 2026-05-01, meralco.com.ph/residential/understand-your-bill; corroborated by GMA News, 2026-04-27, gmanetwork.com/news/money/companies/985542/explainer-what-each-charge-in-the-meralco-bill-mean-for-customers/story/).
- Only about **12%** of the bill goes to Meralco; the remaining **88%** are pass-through charges (Meralco "Understand Your Bill", 2026-05-01; Meralco "Check Your Rates & Charges", meralco.com.ph/residential/rates-and-charges, accessed 2026-11-12).
- **Reconciling 12% vs 17.5%**: both are Meralco-sourced but from different vintages. The **12%** is the current 2025-average mix (distribution plus customer service, metering and billing). The **17.5%** is an older mix (generation ~55%, transmission 10.1%, taxes 11.7%, other 5.7%) still repeated in Meralco's "Oil-Driven Energy Crisis" FAQ and 2026 press briefings. Use 12% for the current bill and cite 17.5% only as a legacy figure (Meralco "Understand Your Bill", 2026-05-01; Meralco "Oil-Driven Energy Crisis" FAQ, meralco.com.ph/help/faqs/oil-driven-energy-crisis, accessed 2026-11-12; GMA News, 2026-04-27, gmanetwork.com/news/money/economy/985462/meralco-clarifies-electricity-bill-charges/story/).
- Unbundling is required by the **Electric Power Industry Reform Act (EPIRA) of 2003** so customers can see where each peso goes (Meralco rates-and-charges FAQ, accessed 2026-11-12; GMA News explainer, 2026-08-09, gmanetwork.com/news/money/economy/997870/explainer-why-is-electricity-expensive-in-the-philippines/story/).
- Generation charge covers power bought from Independent Power Producers, Power Supply Agreement producers, the **Wholesale Electricity Spot Market (WESM)**, and exported energy from Net Metering/DER participants (Meralco "Understand Your Bill", 2026-05-01).
- Transmission charge goes to **NGCP**; system loss is capped by the ERC and losses above the cap cannot be passed on (Meralco "Understand Your Bill", 2026-05-01).
- "Other charges" include VAT and Energy Tax (for residential >650 kWh), Real Property Tax and Local Franchise Tax, Lifeline Subsidy, Senior Citizen Subsidy, **FiT-All**, **GEA-All**, and Universal Charges (missionary electrification, environmental charge of **P0.0025/kWh**, NPC stranded debts) (Meralco "Understand Your Bill", 2026-05-01).

### A2. How the bill is laid out for customers
- Front page: bill summary, payment info, Customer Account Number, bill computation summary, distribution-related charges, **monthly consumption tracker**, bill announcement, **typical consumption tracker** (kWh and estimated daily peso cost), **environmental impact** (estimated GHG equivalent), QR/barcode, contact info (Meralco "Understand Your Bill", 2026-05-01).
- Back page: payments, unpaid balances, detailed bill breakdown, Service ID Number, metering information (meter number, readings, reading dates, multiplier), total energy amount, rate components, adjustments, authorized payment partners (Meralco "Understand Your Bill", 2026-05-01).
- "Why your bill can change" is explained as: electricity use changed; billing period has a different number of days; rates/pass-through charges changed; meter reading or adjustment posted; prior balance or payment changed (Meralco "Understand Your Bill", 2026-05-01).
- **Bill deposit** is reviewed annually: >10% above the 12-month average bill = refund of excess plus interest; within 10% = no change; >10% below = additional deposit collected in 12 monthly installments. From **May 2026**, qualified residential customers may get the deposit and interest automatically as a bill credit (e.g., full Lifeline subsidy recipients and customers who paid on/before due date for 24 months) (Meralco "Understand Your Bill", 2026-05-01).

### A3. Current rates and rate changes
- October 2026: overall rate for a typical household **P15.0615/kWh**; the month's increase was **P0.3191/kWh**, or about **P64 more for 200 kWh** (Philstar, 2026-10-13, philstar.com/headlines/2026/10/14/2563111/meralco-rates-month; Meralco "Residential Bills at Typical Consumption Levels, October 2026" PDF, meralco.com.ph/uploads/documents/source-delta/2026-10-25/5afca4c86acee54e324a937c7481894500ae62aa0a92140d65f6a0e6ea943f79.pdf).
- October 2026 generation charge rose **P0.4973/kWh** due to fuel costs and peso depreciation; transmission fell **P0.1384/kWh**; taxes fell **P0.1436/kWh** (Philstar, 2026-10-13).
- The ERC approved a new distribution rate for the first regulatory period **July 2026–June 2030**: average **P1.48/kWh from P1.35/kWh**; Meralco was ordered to refund **P2.64 billion over six months**, equivalent to **P0.1733/kWh** for residential customers (Philstar, 2026-10-13).
- Starting **November 2026**, Distribution, Supply and Metering (DSM) charges are adjusted under the ERC-approved distribution rates after "11 years with no rate reset"; the adjustment for a 200 kWh residential customer is about **P1.92** on the bill (Meralco 1RP FAQ, as of 2026-11-06, meralco.com.ph/help/faqs).
- The ERC extended suspension of disconnection for residential customers consuming **200 kWh or less** in November or December 2026, provided they settle unpaid May–July 2026 bills and installment payments by **November 26, 2026** (Meralco 1RP FAQ, 2026-11-06, meralco.com.ph/help/faqs).

### A4. Subsidies and discounts on the bill
- **Lifeline discount** brackets: **from April 2026** the ERC-mandated structure is 0–50 kWh = **100%**, 51–70 kWh = **35%**, 71–100 kWh = **20%**. The old structure (0–20 = 100%; 21–50 = 50%; 51–70 = 35%; 71–100 = 20%) applied until March 2026 (Meralco rates-and-charges FAQ, meralco.com.ph/residential/rates-and-charges, accessed 2026-11-12; ERC Resolution No. 2, s. 2026, as summarized in Rappler, 2026-04-28, rappler.com/business/meralco-electricity-bill-subsidy-charges/; PIA, 2026-02-14, pia.gov.ph/news/pbbm-simplified-rules-now-make-electricity-subsidy-within-reach-of-the-poor-solar-net-metering-more-accessible-for-households/).
- Meralco also states "100% discount ... for all qualified marginalized end-users with a monthly consumption of 50 kWh or less" and a **uniform national lifeline subsidy rate of P0.01/kWh beginning March 2026** (Meralco Regulatory FAQ, accessed 2026-11-12; Meralco rates-and-charges FAQ, accessed 2026-11-12).
- **Senior Citizen discount**: 5% on certain bill components if the bill is under the senior's name and consumption is ≤100 kWh; DSWD-accredited senior centers get 50% (Meralco rates-and-charges FAQ, accessed 2026-11-12).
- The apparent conflict on the 21–50 kWh bracket is a **transition artifact**: Meralco's FAQ table shows the pre-April 2026 column (21–50 = 50%) beside the April 2026 column where 0–50 kWh is merged into a single 100% band (Meralco rates-and-charges FAQ, accessed 2026-11-12; ERC Resolution No. 2, s. 2026).

---

## Topic B: Managing usage with the customer's own data

### B1. What Meralco already gives customers
- **My Meralco / My Meralco app**: view and pay bills, report outages, track reports, notifications, Appliance Calculator and Orange Tag, Bright Ideas tips, business-center locator (Google Play listing, accessed 2026-11-12; Meralco Help, meralco.com.ph/help, accessed 2026-11-12).
- **Bill-based consumption history**: monthly consumption tracker and typical consumption tracker in kWh and estimated daily peso cost (Meralco "Understand Your Bill", 2026-05-01).
- **Environmental impact estimate** on the bill (GHG equivalent), explicitly labeled an estimate, not a meter measurement (Meralco "Understand Your Bill", 2026-05-01).
- **Appliance Calculator / Orange Tag / Bright Ideas**: appliance operating-cost calculator, Meralco Power Lab-tested orange tag showing estimated cost per hour/day, and energy-saving content (Meralco 1RP FAQ, 2026-11-06; Meralco "Energy Efficiency" FAQ, meralco.com.ph/help/faqs/energy-efficiency, accessed 2026-11-12).
- **Orange Tag** supplements the DOE yellow label and is based on actual Power Lab tests; a QR code was added to the revised tag (CLASP, "From Informational to Comparative: The New Philippine Energy Label", 2023-01, clasp.ngo/wp-content/uploads/2023/01/PELP-Final-Report.pdf; Philstar, 2015-02-08, philstar.com/lifestyle/business-life/2015/02/09/1421117/find-out-how-much-you-can-save-electricity-meralco-power-lab).
- **DOE Philippine Energy Labeling Program (PELP)**: 5-star rating plus QR code, replacing the old yellow label; covers air conditioners, refrigerators, lighting and TVs (CLASP, 2023-01, same link; DOE PELP FAQ, legacy.doe.gov.ph/pelp/pelp-faqs-d-enforcement-monitoring-and-verification, accessed 2026-11-12).
- **Kuryente Load (prepaid)**: buy electricity credits in small denominations; daily balance SMS with kWh equivalent and rate; low-load reminder; reload confirmation; rate-adjustment notices; rebate/debit notices; disconnection notice; reconnection within **15 minutes** after reload with **no reconnection fee**; no monthly bill; unused load does not expire; zero load = disconnection, and 90 days disconnected = termination (Meralco Prepaid Electricity page, meralco.com.ph/residential/energy-solutions/prepaid-electricity, accessed 2026-11-12).
- **Peak/Off-Peak (POP)**: time-of-use generation rates. Peak: Mon–Sat 8am–9pm (13 h), Sunday 6pm–8pm (2 h); off-peak: Mon–Sat 9pm–8am (11 h), Sunday 12am–6pm and 8pm–12am (22 h). Reference rates from **18 June 2025**: blended generation **P6.64/kWh**, POP peak **P8.38/kWh**, off-peak **P4.55/kWh**; rates vary monthly (Meralco POP page, meralco.com.ph/residential/energy-solutions/peak-off-peak, accessed 2026-11-12).
- **Smart meters (AMI)**: automatic readings, faster outage detection, faster reconnection after payment; free meter and replacement; no rate change; ~15-minute interruption during replacement; separate communication network (no home internet needed); can support POP, Net Metering and Customer Choice Programs; **AMI Postpaid** sends daily consumption updates via SMS (Meralco Smart Meters page, meralco.com.ph/residential/energy-solutions/smart-meters, accessed 2026-11-12; Daily Tribune, 2026-11-10, tribune.net.ph/2026/11/10/meralco-pushes-smart-meters-energy-saving-measures).

### B2. What the usage data shows (typical drivers of a high bill)
- Meralco data show electricity demand rises **20%–33%** during the dry season, driven by cooling appliances (Daily Tribune, 2026-03-16, tribune.net.ph/2026/03/16/meralco-renews-call-for-energy-efficiency-to-manage-consumption).
- Aircon guidance: DOE recommends **25°C**; every 1°C lower can add **5%–7%** to aircon operating cost; inverter aircons can save **30%–64%** vs conventional units based on Meralco Power Lab tests (Meralco "Energy Efficiency" FAQ, accessed 2026-11-12; Daily Tribune, 2026-03-16).
- Illustrative monthly savings cited by Meralco Power Lab (estimates only): up to **P2,064.62/month** if all listed tips are followed; aircon setting up to **P1,600**; DC fan **P190**; aircon filter cleaning **P95**; unplugging TV box **P28.60**; unplugging water dispenser **P151.02**; frequent refrigerator opening adds about **5%** to consumption (PEP, 2026-03-19, pep.ph/lifestyle/home/191418/meralco-tips-save-electricity-bill-a717-20260319).
- One extra hour of nighttime aircon use adds about **P118/month**; a typical electric fan used 12 h/day costs close to **P300/month** (PEP, 2026-07-24, pep.ph/lifestyle/home/193092/ask-meralco-appliances-electrci-bill-a717-20260725-lfrm).

### B3. AMI scale and rules (the data backbone for usage management)
- Meralco has installed roughly **250,000 smart meters** and proposed **3–3.2 million more over four years**, subject to regulatory approval; customers do not pay for the meter or installation (Daily Tribune, 2026-11-10).
- Meralco plans **280,000–420,000 smart meters in 2027**, with **P4–4.6 billion** investment, aligned with ERC-approved AMI capex; the ERC approved about **P33.4 billion** for AMI under the **July 2026–June 2030** regulatory period; Meralco aims for **~12 million smart meters over a decade** (BusinessWorld, 2026-11-02, bworldonline.com/corporate/2026/11/02/790893/meralco-plans-up-to-p4-6-billion-smart-meter-rollout-in-2027/).
- Initial phase: ~**72,000** Aclara (Hubbell) smart meters under a two-year supply agreement (Hubbell/Aclara, 2026-03-04, hubbell.com/aclara/en/news/hubbell-partners-with-meralco-on-smart-meter-supply-contract; Manila Bulletin, 2026-08-05, mb.com.ph/2026/08/05/meralco-bets-on-improved-smart-metering-to-boost-grid-resilience).
- ERC amended the **AMI Rules** in late 2025 (first major update since 2016), adding a **Consumer Meter Data Channel** for near-real-time usage access and requiring cybersecurity and data-privacy safeguards (Power Philippines, 2025-11-04, powerphilippines.com/erc-approves-updated-smart-meter-rules-for-philippine-utilities/; Malaya Business Insight, 2025-11-04, malaya.com.ph/business/corporate/erc-eases-rules-on-rollout-of-smart-electricity-meters/).

### B4. Billing accuracy and disputes (a live customer problem in 2026)
- The ERC received **879 complaints** in 2026 involving meter errors, estimated bills and billing adjustments, plus **243** "unusually high billing" complaints and **528** other contested billing cases (Rappler, 2026-07-13, rappler.com/business/wrong-power-bill-energy-regulatory-commission-clarifies-no-blanket-pay-first-rule/).
- ERC clarified there is no blanket "pay first" rule: for erroneous readings/estimated bills/adjustments caused by the utility, filing a complaint suspends disconnection; for an "unusually high bill" (more than **100% above the 12-month average**), the customer may pay the average monthly bill while the utility investigates (Rappler, 2026-07-13; Philstar Life, 2026-07-16, philstarlife.com/news-and-views/825784-meralco-customers-can-pay-only-average-consumption-while-disputed-bill-being-reviewed).
- Reported bill-shock cases in 2026 include a **P2.7 million** charge dating back to 2023, a **P290,000** charge due to a tampered meter, and a **P54,000** erroneous-billing case in Marikina (ABS-CBN News, 2026-08-27, abs-cbn.com/news/business/2026/8/27/more-customers-complain-of-electric-bill-shock-1827).
- A secondary legal explainer states that if a meter is found to run fast beyond the allowed tolerance (average error **>+2%**) without tampering, the customer may be entitled to a refund for up to **six months** before the error was discovered; this is attributed to the Magna Carta for Residential Electricity Consumers but should be verified against the ERC text (LabanPH, 2026-07-11, labanph.org/answer/my-meralco-bill-suddenly-doubled-how-do-i-dispute-it — secondary source).
- Meralco's own guidance for a high bill is to check consumption, billing days, current rates, meter readings, adjustments, prior balances and posted payments, because more than one factor may have changed (Meralco "Understand Your Bill", 2026-05-01).

---

## Topic C: What "understanding the bill" and "managing usage" could build on

### C1. Data and artifacts already available to a customer
- Monthly kWh and peso history, meter readings and reading dates, billing period length (Meralco "Understand Your Bill", 2026-05-01).
- Appliance-level estimates from the Appliance Calculator and Orange Tag (Meralco 1RP FAQ, 2026-11-06).
- Daily consumption SMS for AMI Postpaid enrollees; daily balance SMS for Kuryente Load (Daily Tribune, 2026-11-10; Meralco Prepaid Electricity page, accessed 2026-11-12).
- Time-of-use rates under POP (Meralco POP page, accessed 2026-11-12).
- Net-metering credits and export energy on the bill (Challenge 1 sources).
- Environmental-impact estimate (GHG equivalent) on the bill (Meralco "Understand Your Bill", 2026-05-01).

### C2. Privacy and regulatory boundaries
- Electricity consumption records are commonly **personal information** under the **Data Privacy Act of 2012 (RA 10173)** when linked or linkable to an identifiable customer; the IRR requires organizational, physical and technical safeguards (RA 10173, lawphil.net/statutes/repacts/ra2012/ra_10173_2012.html; NPC IRR, privacy.gov.ph/implementing-rules-regulations-data-privacy-act-2012/; NDV Law, "Energy Data Privacy", ndvlaw.com/energy-data-privacy-protecting-grid-analytics-and-consumer-metrics-under-the-dpa/, accessed 2026-11-12).
- The NPC issued an advisory opinion on a request for information from Meralco, confirming that the request pertains to personal information (NPC Advisory Opinion No. 2019-005, privacy.gov.ph/wp-content/uploads/2019/10/v15BRedacted5D20Advisory20Opinion20No.202019-005.pdf).
- ERC's amended AMI Rules explicitly require consumer data-privacy safeguards alongside the Consumer Meter Data Channel (Power Philippines, 2025-11-04; Malaya, 2025-11-04).

### C3. What Meralco says it is doing with data
- Meralco's Data Platform (with Cloudera) runs machine-learning models; predictive analytics for secondary lines and overloaded transformers helped prevent probable outages to almost **200,000 customers in 2021** (Cloudera, 2022-09-07, cloudera.com/about/news-and-blogs/press-releases/2022-09-07-meralco-harnesses-the-power-of-data-to-drive-business-success-with-cloudera.html).
- Meralco's 2022 annual report says the same program spared nearly **930,400 customers** from potential unplanned outages in 2022, a 365% increase from the prior year (Meralco 2022 Strategic Report, meralco.com.ph/governance/annual-reports/2022/strategic-report, accessed 2026-11-12).

---

## Topic D: Mapping findings to the challenge goals

### Goal 1: Understand the components of an electricity bill
- A complete, regulator-backed breakdown already exists (generation 64%, distribution 12%, other 11%, transmission 8%, system loss 5%) and is explained line by line on Meralco's site (Meralco "Understand Your Bill", 2026-05-01; GMA News, 2026-04-27).
- The bill already shows consumption history, typical consumption, meter readings and an environmental estimate, so a solution can explain *why* a bill moved rather than re-display the bill (Meralco "Understand Your Bill", 2026-05-01).
- The hardest part is not the static breakdown but the monthly pass-through movement (generation 64% driven by fuel, forex and WESM) and one-off adjustments (estimated readings, bill deposit, refunds) (Meralco "Understand Your Bill", 2026-05-01; Philstar, 2026-10-13).

### Goal 2: Manage usage using the customer's own consumption data
- The customer's own data exists at several resolutions: monthly bill history, daily AMI SMS, prepaid balance SMS, and (for AMI) near-real-time access via the Consumer Meter Data Channel (Meralco Smart Meters page, accessed 2026-11-12; ERC AMI Rules, 2025-11-04).
- Meralco already offers behavior-change content (Bright Ideas), appliance-level estimates (Appliance Calculator, Orange Tag) and price signals (POP) — a solution should integrate with these rather than duplicate them (Meralco 1RP FAQ, 2026-11-06; Meralco POP page, accessed 2026-11-12).
- The clearest user problems documented in 2026 are bill spikes and disputes, not lack of a dashboard: estimated/catch-up readings, tampered-meter charges, and slow explanations (Rappler, 2026-07-13; ABS-CBN, 2026-08-27).

### Constraint fit
- "Own consumption data" is available but fragmented across the bill, SMS, app and prepaid channel; privacy law and ERC AMI rules constrain how it can be shared or reused (RA 10173; ERC AMI Rules, 2025-11-04).
- A trustworthy solution should show the *basis* of each number (actual vs estimated reading, billing days, rate version) because that is exactly what customers dispute (Meralco "Understand Your Bill", 2026-05-01; Rappler, 2026-07-13).

---

## Open questions / gaps (Challenge 2)
- **Resolved — share of bill going to Meralco**: use **12%** for the current (2025 average) bill; **17.5%** is a legacy mix still repeated in some Meralco FAQs and press briefings (see Topic A1).
- **Resolved — when the distribution charge last changed**: the current level has been unchanged since a **P0.0360/kWh reduction in August 2022**; before that, charges had been unchanged since the **July 2015** reduction. "Not increased since 2015" and "unchanged since August 2022" are both true: 2015 was the last increase, August 2022 was the last change (a decrease) (Meralco September 2022 Rates Update, company.meralco.com.ph/news-and-advisories/september-2022-rates-updates; BusinessWorld, 2026-09-11, bworldonline.com/top-stories/2026/09/11/776314/meralco-lowers-september-power-rate-by-4-centavos-kwh/; GoSolar PH, 2026-08-29, gosolarph.com/guides/meralco-distribution-charge-explained/).
- **Resolved — lifeline bracket**: 21–50 kWh = 50% was the pre-April 2026 rule; from April 2026 the 0–50 kWh band is 100% (see Topic A4).
- **Resolved — current smart-meter count**: **~196,000 as of February 2026** (Power Philippines, 2026-02-11, powerphilippines.com/meralco-to-deploy-72000-smart-meters-in-2026-under-ami-push-with-aclara/; Philstar, 2026-02-12, philstar.com/business/2026/02/12/2507356/meralco-seeks-approval-p532-billion-collections) and **~250,000–260,000 as of November 2026** (Daily Tribune, 2026-11-10, tribune.net.ph/2026/11/10/meralco-pushes-smart-meters-energy-saving-measures; FintechNewsPH, 2026-11-08, fintechnewsph.com/meralco-smart-home-technology-smarter-services/, quoting Meralco SVP Charina Padua on 2026-11-05). The gap is timing plus the 2026 Aclara rollout, not a definitional conflict; in May 2025 the count was ~100,000 including ~40,000 prepaid (Daily Tribune, 2025-05-28, tribune.net.ph/2025/05/28/meralco-seeks-go-ahead-for-full-smart-meter-rollout).
- Whether **daily/near-real-time AMI data** is available to all smart-meter customers or only AMI Postpaid enrollees (Meralco Smart Meters page and Daily Tribune, 2026-11-10).
- Whether Meralco exposes a **downloadable interval-data / Green Button-style** export for customers — not found in public sources.
- Whether the Appliance Calculator uses the customer's **actual current rate** or a generic rate — not stated on the public pages reviewed.
- Exact ERC rules on **caps for estimated billing** and the reconciliation method — not captured; the Magna Carta and ERC dispute guidelines would need to be read in full.
- How many customers are actually enrolled in **Kuryente Load** and **POP** — public figures not found.

---

# Researched Topics — Challenge 3: Grid Intelligence from Connected Devices

> **Problem statement (from `hackathon_challenges.md`, source of truth):**
> "How might we combine data from smart meters, IoT sensors, field devices and other data-gathering tools with publicly available online information to understand how the distribution network is behaving? This includes recognizing changing demand such as electric vehicle charging, spotting unusual patterns that may point to equipment issues or safety hazards, and confirming and locating possible power issues."

**Extracted elements (summary only — no new requirements added):**
- Goal: Understand how the distribution network is behaving
- Data sources: smart meters; IoT sensors; field devices; other data-gathering tools; publicly available online information
- Scope includes: recognizing changing demand (e.g., EV charging); spotting unusual patterns that may indicate equipment issues or safety hazards; confirming and locating possible power issues

**Summary:** Meralco is building exactly the data foundation this challenge describes: AMI smart meters (~250,000–260,000 installed by November 2026; target ~12 million), AMI over power-line carrier (AMI-HPLC), a Grid-Edge Operations and Control Center (GEOCC) targeted for 2030, ADMS with fault location/isolation/restoration (PLISR/FLISR), transformer analytics (MeTA), a private LTE network, and a data platform with ML models. Publicly available sources (PAGASA weather, customer outage reports, social media, third-party outage trackers) are used informally or for coordination, but no public evidence was found of a single system that fuses all of them. EV charging is a known emerging load, but Meralco says the main gap is *where* EV demand will cluster.

---

## Topic A: Meralco's current grid-data infrastructure

### A1. Smart meters and AMI
- **~250,000–260,000** smart meters installed as of November 2026 (Daily Tribune, 2026-11-10, tribune.net.ph/2026/11/10/meralco-pushes-smart-meters-energy-saving-measures; FintechNewsPH, 2026-11-08, fintechnewsph.com/meralco-smart-home-technology-smarter-services/); the count was **~196,000 in February 2026** (Power Philippines, 2026-02-11; Philstar, 2026-02-12). Target **~12 million** over a decade (BusinessWorld, 2026-11-02; Hubbell/Aclara, 2026-03-04).
- Initial deployments: ~**72,000** Aclara I-210+c and kV2c meters with IPv6, multi-vendor architecture (Hubbell/Aclara, 2026-03-04); Itron Gen5 AMI network initially managing **73,000 endpoints** across Metro Manila (Itron, 2025-10-21, na.itron.com/w/meralco-collaborates-with-itron-to-enhance-smart-grid-journey).
- Smart meters automatically send readings, detect outages, and speed reconnection after payment; they use a separate communication network, not the customer's internet (Meralco Smart Meters page, accessed 2026-11-12).
- AMI Postpaid sends **daily consumption updates via SMS**; Meralco is developing app-based access (Daily Tribune, 2026-11-10).

### A2. AMI-HPLC and GEOCC
- **AMI-HPLC** (High-Speed Power Line Carrier Communication) transmits smart-meter data over Meralco's existing power lines to improve visibility across the low-voltage network. Meralco presented it as an **advancing capability** (Huawei Connect 2026, 2026-09-17), not a completed rollout; **no public coverage or endpoint figures** were found (Power Philippines, 2026-09-18, powerphilippines.com/meralco-lays-groundwork-for-smarter-grid-with-ami-hplc-future-control-center/; Context.ph, 2026-09-18, context.ph/2026/09/18/meralco-builds-smarter-more-resilient-grid-with-modern-power-infrastructure/).
- Stated uses: outage detection and restoration verification, energy balancing, system-loss monitoring, transformer-loading tracking, and other network conditions (Power Philippines, 2026-09-18; The Chronicle, 2026-09-18, thechronicle.com.ph/meralco-builds-smarter-grid-for-solar-ev-and-battery-boom/).
- **GEOCC** (Grid-Edge Operations and Control Center) is **planned for completion by 2030** in the Meralco Ortigas compound; it would complement the existing System Control Center with low-voltage situational awareness and DER coordination (Manila Standard, 2025-10-17, manilastandard.net/business/314656461/meralco-plans-to-build-twin-control-center.html; Daily Tribune, 2025-10-18, tribune.net.ph/2025/10/18/meralco-readies-hub-for-decentralized-grid).
- **GEOCC funding**: it is a pillar of Meralco's **P272-billion capex program for 2027–2030** under its 1RP application (Manila Bulletin, 2026-02-23, mb.com.ph/2026/02/23/meralco-seeks-higher-distribution-rates-after-decade-long-price-freeze). The ERC approved **P229.45 billion** in total 1RP capex for July 2026–June 2030, including **P33.4 billion** for AMI, but **no separate GEOCC budget line or construction start** has been disclosed publicly (BusinessWorld, 2026-11-02, bworldonline.com/corporate/2026/11/02/790893/meralco-plans-up-to-p4-6-billion-smart-meter-rollout-in-2027/).
- Meralco also says it is pursuing AI, advanced analytics and cybersecurity, and participated in a US–Philippines Smart Grid Technologies Reverse Trade Mission (Daily Tribune, 2026-02-16, tribune.net.ph/2026/02/16/meralco-eyes-us-tech-for-grid-push).

### A3. Distribution automation and control
- **ADMS** with **Pinpoint Location, Isolation, and Service Restoration (PLISR/FLISR)**: automatically isolates affected sections and restores healthy portions ("self-healing"), shortening restoration time (Power Philippines, 2025-10-21, powerphilippines.com/meralco-fortifies-grid-with-stronger-structures-and-smart-automation/).
- Meralco's smart-grid roadmap also lists **Advanced Network Automation (ANA)**, smart substations (IEC 61850), **DERMS**, **EV Management System**, SCADA, Advanced Asset Management, Mobile Work and Outage Management, and control-center modernization (Meralco smart-grid presentation deck, iiee.org.ph:89/uploads/files/1161.pdf, accessed 2026-11-12).
- **Wireless Private Network**: private LTE supporting Distribution Automation and AMI, with **103 base stations** being installed by MIESCOR under a four-phase program (Meralco 2025 Integrated Report, meralco.com.ph/uploads/documents/legacy-documents/v2/annual-integrated-report/3b/meralco-doc-3b3048e253fe185b.pdf, published 2026).
- **EMX (Elevated Metering Transformation)**: remote meter reading, disconnection and reconnection; expands network visibility and enables early detection of irregularities and pilferage (Manila Bulletin, 2026-08-05, mb.com.ph/2026/08/05/meralco-bets-on-improved-smart-metering-to-boost-grid-resilience).

### A4. Field devices and transformer analytics
- Meralco's 2026 procurement for distribution-line inspection lists: **Fault Circuit Indicators (FCI)**, **DT Monitoring Equipment (DTME)**, load loggers, recording power analyzers, pole ground-resistance testing, load/voltage testing, meter-to-distribution-transformer testing, and line phasing checks (Meralco procurement page, CE0926-0966-1, meralco.com.ph/bids/procurement/system-analysis-distribution-line-inspection-and-testing, accessed 2026-11-12).
- **MeTA (Metered Transformer Analytics)**: smart meters installed on distribution transformers, using **IEEE Std C57.91-2011** to calculate temperatures and assess loading; in an initial **428-transformers** pilot, about **30%** were confirmed overloaded and corrected (Meralco paper, "Prevention of Premature Distribution Transformer Failures Using Metered Transformer Analytics", studylib.net/doc/27927996/metered-transformer-analytics, accessed 2026-11-12).
- Meralco's data platform uses predictive models to identify secondary lines for rehabilitation and overloaded transformers (Cloudera, 2022-09-07; Meralco 2022 Strategic Report).

### A5. Current reliability and loss baselines
- 2025: **SAIFI 0.91** times, **SAIDI 97.50** minutes (all-time best; better than the 1–100 gold standard), **system loss 5.85%** (18th consecutive year below the regulatory cap), **8.221 million** customers, **peak demand 9.13 GW** on 2025-04-23 (Meralco FY2025 Operational Performance Report, meralco.com.ph/uploads/documents/legacy-documents/v2/quarterly-results/33/meralco-doc-33c274e9b24afab5.pdf; Meralco 2025 Integrated Report).
- Q1 2026: system loss **5.72%**, SAIFI **0.150**, SAIDI **16.112** minutes, average retail rate **P12.39/kWh** (Meralco Technical Performance page, meralco.com.ph/investors/technical-performance-and-customer-care-highlights, accessed 2026-11-12).
- Solar-related incremental losses: **427 GWh** in 2025 vs 353 GWh in 2024 (+20.8%); **74 GWh** incremental year-to-date (Meralco FY2025 Operational Performance Report).

---

## Topic B: Recognizing changing demand (EV charging and DER)

### B1. EV charging
- Meralco powers **more than 2,000 EV charging points** across public, private and residential locations in its franchise area (The Chronicle, 2026-10-26, thechronicle.com.ph/the-road-to-electric-mobility-starts-with-a-stronger-grid/; Context.ph, 2026-10-26, context.ph/2026/10/26/meralco-strengthens-grid-for-electric-mobility-growth/).
- Meralco targets electrifying **25% of its own fleet by 2030**; it has deployed **150+ EVs** since 2020, abated **230+ metric tons of CO2**, and plans **160+ additional chargers by 2027** (Meralco Electric Vehicles page, meralco.com.ph/residential/energy-solutions/electric-vehicles, accessed 2026-11-12).
- Charger classes: Level 1 AC <3.7 kW; Level 2 AC 7.4–11 kW; Level 3 DC 30 kW and up (Meralco EV page, accessed 2026-11-12).
- Meralco says the distribution infrastructure is ready for the first waves of fleet electrification, but the main challenge is identifying **where EV adoption will cluster** (residential communities, commercial hubs, industrial logistics routes) so grid upgrades are targeted (BusinessWorld, 2026-07-23, bworldonline.com/spotlight/2026/07/23/764563/driving-the-philippine-ev-transition-through-strategic-infrastructure-and-grid-resilience/).
- The IEA expects EVs to be about **45% of Philippine car sales by 2035** under its Stated Policies Scenario (Manila Times, 2026-10-27, manilatimes.net/2026/10/27/fast-times/can-the-philippine-power-grid-support-an-ev-revolution/2454530).
- Smart charging, time-of-use rates and managed charging can shift demand away from the evening peak (Manila Times, 2026-10-27, citing Meralco COO Ronnie Aperocho).
- Meralco's subsidiary **Movem Electric** provides EV supply/leasing, fleet operations, e-shuttling and charging solutions, supported by its **ChargeM** platform (The Chronicle, 2026-10-26).

### B2. Rooftop solar and other DER
- Net-metering customers grew to about **19,900 active** as of 2025 (Meralco Integrated Report 2025, cited in Challenge 1 research).
- Meralco estimates **74 GWh** of incremental losses from solar in 2025 year-to-date and **427 GWh** for full-year 2025 (Meralco FY2025 Operational Performance Report).
- Meralco frames AMI-HPLC and GEOCC as preparation for bidirectional flows from rooftop solar, battery storage and EVs (Power Philippines, 2026-09-18; The Chronicle, 2026-09-18).
- Huawei, Meralco and SANXING launched an **Intelligent Distribution Solution** at MWC 2026, covering automated fault detection/self-healing, real-time transformer and meter monitoring, non-technical loss reduction, and capex optimization (Hardware Busters, 2026-03-08, hwbusters.com/news/huawei-meralco-and-sanxing-launch-intelligent-distribution-solution/).

---

## Topic C: Spotting anomalies, hazards and power issues

### C1. How outages are classified and reported today
- **Planned outage**: maintenance, upgrades, relocation for government projects, or new construction; customers are advised at least **72 hours** ahead (Meralco "Brownouts and Incidents" FAQ, meralco.com.ph/help/faqs/outages-and-incidents, accessed 2026-11-12).
- **Unplanned outage**: generation deficiency, weather, foreign objects, or failure of line hardware/components (Meralco FAQ, accessed 2026-11-12).
- Customers can view an **outage map** with current/future outages and estimated time of restoration (ETR); if their outage is not on the map, they can file a report with up to **5 photos** (PDF/PNG/JPG/BMP, ≤5 MB), a Service ID or address, a map pin or landmarks, and contact details; they can track the report under "Summary of Reports" (Meralco FAQ, accessed 2026-11-12).
- **Safety/incident reports** cover streetlights and safety concerns: broken/fallen pole, sparking wire, fallen wire, loose/damaged/detached wire, explosion near a Meralco facility, pole or wire obstructing the road (Meralco FAQ, accessed 2026-11-12).
- Meralco restores power through its **System Control** or **Sector Operations** teams, dispatching crews to investigate and repair; ETR is based on historical data and can change during restoration (Meralco FAQ, accessed 2026-11-12).

### C2. Detection and prevention tools already in use
- **Thermographic scanning** of power lines and equipment after typhoons and other disturbances to identify potential faults (Meralco 2025 Integrated Report).
- **Predictive analytics** on secondary lines and overloaded transformers prevented probable outages to ~200,000 customers in 2021 and ~930,400 in 2022 (Cloudera, 2022-09-07; Meralco 2022 Strategic Report).
- **MeTA** transformer monitoring and IEEE C57.91 thermal calculations (Meralco paper, accessed 2026-11-12).
- **Anti-Urban Blight Program**: decluttering poles and cables with LGUs and telcos, covering **60 cities and municipalities** as of end-October 2025, to reduce safety risks and storm-related outages (Power Philippines, 2025-12-04, powerphilippines.com/decluttering-the-skyline-a-city-by-city-movement-for-safer-power/).
- **Vegetation management**: tree-trimming on Talim Island (Power Philippines, 2025-10-01, powerphilippines.com/meralco-trims-trees-in-talim-island-to-boost-power-reliability/); MIESCOR provides vegetation management, thermographic testing, line patrol and detailed pole inspection (MIESCOR, miescor.ph/subsidiaries?tab=CFS, accessed 2026-11-12).
- **Storm readiness**: Meralco coordinates with **PAGASA** and monitors weather; crews are pre-positioned and safety-first restoration is emphasized (The Chronicle, 2026-07-08, thechronicle.com.ph/meralco-activates-emergency-response-teams-steps-up-preventive-measures-ahead-of-super-typhoon-inday/; Daily Tribune, 2026-08-19, tribune.net.ph/2026/08/19/meralco-attributes-storm-resilience-to-long-term-infra-investments).
- Meralco's 2016 resiliency presentation already listed **PHIVOLCS REDAS** (Rapid Earthquake Assessment System) as a near-real-time earthquake hazard decision-support tool (Meralco presentation, 2016-03-16, paperzz.com/doc/9385382/pdf).

### C3. Publicly available online information (examples)
- **PAGASA** weather warnings (used for storm readiness; Meralco says it coordinates with PAGASA) (The Chronicle, 2026-07-08).
- **Customer-generated reports and social media**: Meralco's own outage map and report form; third-party aggregators such as **BrownoutBA?** (crowd-sourced reports plus official advisories from Meralco and other utilities, brownoutba.com, accessed 2026-11-12) and **outage.report** (aggregates anonymous reports and public social-media posts, outage.report/ph/meralco, accessed 2026-11-12).
- **WESM** market data and **NGCP** grid conditions are public, but no source was found showing Meralco automatically fusing them into distribution-level anomaly detection (WESM site, wesm.ph, accessed 2026-11-12; Meralco generation-charge explanations, accessed 2026-11-12).
- **DOE/ERC** advisories and rules (e.g., AMI Rules, net-metering advisories) are public and set the constraints for data use (ERC AMI Rules, 2025-11-04).

---

## Topic D: Privacy, cybersecurity and data governance

- Electricity consumption data linked to a customer is personal information under **RA 10173**; utilities must implement organizational, physical and technical safeguards and limit processing to declared purposes (RA 10173; NPC IRR; NDV Law, accessed 2026-11-12).
- The NPC has opined that a request for information directed to Meralco pertains to personal information (NPC Advisory Opinion No. 2019-005, privacy.gov.ph).
- ERC's amended **AMI Rules** require cybersecurity protocols and consumer data-privacy safeguards, and create a **Consumer Meter Data Channel** for near-real-time customer access (Power Philippines, 2025-11-04; Malaya, 2025-11-04).
- The WESM **Retail Manual on Disclosure and Confidentiality of Contestable Customer Information** treats retail customer load data and metering/connection details as confidential, releasable only with customer authorization (WESM Retail Manual, wesm.ph, accessed 2026-11-12).
- Meralco's own smart-meter FAQ states the meter collects only electricity-consumption information and that meters are secure against tampering (Meralco Smart Meters page, accessed 2026-11-12) — a vendor-style claim that should be treated as a claim, not independently verified.

---

## Topic E: Mapping findings to the challenge goals

### Goal: Understand how the distribution network is behaving
- Meralco is assembling the required layers: AMI (customer edge), AMI-HPLC (low-voltage visibility), ADMS/PLISR (automation), MeTA/DTME/FCI (asset condition), private LTE (communications), and a data platform with ML (analytics) (Sources in Topic A).
- The gap is integration: GEOCC is still **proposed**, and no public source shows a single operational picture that combines smart-meter, IoT, field-device and public online data (Context.ph, 2026-10-23; Power Philippines, 2026-09-18).

### Scope 1: Recognizing changing demand such as EV charging
- EV charging points, fleet electrification targets and charger classes are documented; Meralco explicitly says the challenge is locating **clusters** of EV demand (The Chronicle, 2026-10-26; BusinessWorld, 2026-07-23).
- Rooftop solar already changes net flows and creates measurable incremental losses (427 GWh in 2025), which Meralco tracks (Meralco FY2025 Operational Performance Report).

### Scope 2: Spotting unusual patterns that may indicate equipment issues or safety hazards
- Existing signals: transformer loading/temperature (MeTA), thermographic scans, FCIs, DTME, outage reports with photos, safety-concern categories, and predictive models for overloaded transformers/secondary lines (Meralco paper; Meralco procurement page; Cloudera, 2022-09-07).
- Meralco already uses customer reports as a safety-hazard channel (broken poles, sparking/fallen wires, explosions) (Meralco FAQ, accessed 2026-11-12).

### Scope 3: Confirming and locating possible power issues
- The outage map, ETR, report tracking, AMI outage detection and PLISR/FLISR already provide confirmation and location at different levels (Meralco FAQ; Meralco Smart Meters page; Power Philippines, 2025-10-21).
- AMI-HPLC is specifically aimed at outage detection and restoration verification at the low-voltage edge (Power Philippines, 2026-09-18).

### Constraint fit
- Any solution that ingests customer consumption data must respect the DPA, the ERC AMI Rules and the WESM confidentiality manual (Topic D).
- "Publicly available online information" is available (PAGASA, social media, third-party trackers), but quality, licensing and verification vary; third-party outage sites are crowd-sourced and not official (brownoutba.com; outage.report, accessed 2026-11-12).

---

## Open questions / gaps (Challenge 3)
- **Resolved — smart-meter count**: ~196,000 (Feb 2026) and ~250,000–260,000 (Nov 2026); the difference is timing plus the 2026 rollout, not conflicting definitions (see Topic A1).
- **Resolved — GEOCC status/funding**: planned for 2030 and part of the 1RP capex program; ERC approved P229.45 billion total 1RP capex including P33.4 billion for AMI, but no standalone GEOCC budget or construction start is public (see Topic A2).
- **AMI-HPLC coverage**: sources describe the technology and benefits but give **no coverage or endpoint numbers**; whether it is at scale or pilot remains unverified.
- Whether Meralco **formally ingests** PAGASA/PHIVOLCS/social-media/WESM data into an automated anomaly-detection pipeline, or only uses them for manual coordination — no public source found.
- No public evidence found of Meralco using **dashcams** or **low-cost environmental sensors** as grid-intelligence inputs (see Challenge 4).
- Whether Meralco offers **third-party data access/APIs** (e.g., for researchers or LGUs) — not found.
- Actual **EV clustering data** by barangay/city — not public; Meralco says this is the key planning gap (BusinessWorld, 2026-07-23).
- Cybersecurity architecture and incident history for AMI/OT — only high-level claims are public (Cyber Magazine, 2022-03-28, cybermagazine.com/company-reports/meralco-the-company-thats-stepping-up-smart-grid-security).
- The exact **number and location** of FCIs, DTMEs and remote-controlled switches — procurement documents describe scope but not installed base.

---

# Researched Topics — Challenge 4: Smarter Field Observation

> **Problem statement (from `hackathon_challenges.md`, source of truth):**
> "How might we use field assets, such as utility vehicles, dashcams, smartphones and low-cost environmental sensors, to safely capture useful environmental and infrastructure data?"

**Extracted elements (summary only — no new requirements added):**
- Goal: Capture useful environmental and infrastructure data
- Field assets: utility vehicles; dashcams; smartphones; low-cost environmental sensors
- Constraint: Capture must be safe

**Summary:** Meralco already equips field crews with smartphones/tablets and purpose-built apps (meter reading, real-time payment validation), uses ruggedized tablets for mobile outage management, and uses drones, thermographic scanning, line patrol and pole inspection (partly through MIESCOR). Low-cost environmental sensing in the Philippines is mostly academic/LGU-led (UP CARE, DENR-EMB interest), and no public evidence was found that Meralco deploys dashcams or low-cost air-quality sensors. The safety constraint is explicit in Meralco's storm-response messaging, and drone use is subject to CAAP permits.

---

## Topic A: Field assets Meralco already uses

### A1. Smartphones, tablets and field apps
- **Meter Reading App (MRA)**: installed on crew phones; calculates best routes, alerts crew to potential meter concerns, lets readers upload meter photos as proof of reading (Meralco Corporate Partners, 2021-09-01, corporatepartners.meralco.com.ph/news-and-advisories/meralco-digital-innovations-meter-reading-real-time-validation).
- **Real Time Validation App (RTVA)**: disconnection crews check payment/disconnection status on demand; estimated to have prevented **more than 4,000** "salisi" disconnections and saved customers reconnection fees (Meralco Corporate Partners, 2021-09-01).
- Meralco's 2022 annual report cites **upgraded handheld terminals for meter reading** and **geo-tagging customer locations** for efficient response and outage resolution (Meralco 2022 Strategic Report, accessed 2026-11-12).
- Meralco has used **ruggedized, off-the-shelf tablets** with the Navagis mobile outage solution, enabling real-time crew tracking, work-order push, ad-hoc data collection, customizable forms and route directions (Navagis case study, 2013, navagis.com/successstories/pdf/20130Meralco_NavagisCaseStudy_Email.pdf).
- Navagis reports the mobile outage solution cut standard outage resolution time by **50%** and hazardous outage resolution time by **24%** during Tropical Storm Trami (Navagis case study, 2013).
- Meralco's 2016 resiliency presentation lists **vehicles with GPS, tablets and smartphones**, and **aerial drones** as part of its communication/restoration strategy (Meralco presentation, 2016-03-16, paperzz.com/doc/9385382/pdf).

### A2. Drones and aerial inspection
- Meralco began planning drone use around **2015**, initially **three drones** (north, central, south) to inspect areas hard to reach after typhoons or floods; deployment depended on **CAAP permits** (Smart Energy International, 2015-09-07, smart-energy.com/regional-news/asia/meralco-capex-spending-on-smart-grid/).
- Meralco's 2016 resiliency deck lists **aerial drones** among strategies to enhance communication, planning and restoration (Meralco presentation, 2016-03-16).
- **MSpectrum** (Meralco's solar subsidiary) offers aerial drone shots and thermal imaging as part of its premium solar O&M plan, plus IV curve tracing and performance monitoring (MSpectrum O&M page, spectrum.net.ph/operations-maintenance, accessed 2026-11-12).
- Meralco performs **thermographic scanning** of power lines and equipment after typhoons and other natural disturbances (Meralco 2025 Integrated Report).
- No recent public figure was found for Meralco's current drone fleet size or the number of drone inspection flights per year.

### A3. Ground inspection and vehicle-based work
- MIESCOR (Meralco's technical/back-end support arm) provides distribution line and substation maintenance, **vegetation management**, transformer vault maintenance, **pole ground resistance testing**, **thermographic testing**, **regular line patrol and detailed pole inspection**, and substation O&M (MIESCOR, miescor.ph/subsidiaries?tab=CFS, accessed 2026-11-12).
- Meralco's 2026 procurement for distribution-line inspection and testing requires crews to conduct elevated and ground-level inspections, load/voltage testing, transformer monitoring, FCI installation, pole ground-resistance testing, and **site photographs** (Meralco procurement page, CE0926-0966-1, accessed 2026-11-12).
- Meralco's fleet includes **150+ EVs** since 2020 and a target to electrify **25% of its fleet by 2030** (Meralco EV page, accessed 2026-11-12) — relevant if vehicles are used as sensor platforms.

---

## Topic B: Low-cost environmental sensors (Philippines context)

### B1. Why low-cost sensors matter here
- Regulatory air-quality monitoring stations are expensive and sparse: each station costs about **$15,000–$40,000 (P878,000–P2.34 million)** to establish and maintain, and only about **45%** of the population lives within **25 km** of a monitoring site (Greenpeace 2023, as cited in ISPRS Annals, 2026-02-10, doi.org/10.5194/isprs-annals-x-5-w4-2025-315-2026).
- Low-cost IoT sensors cost around **P50,000 each** in the UP CARE project and can improve spatial density, though they are less precise than reference stations (ISPRS Annals, 2026-02-10).

### B2. Philippine low-cost sensor work
- **UP CARE** (UP Diliman, DOST-funded) has deployed **36 sensor prototypes** nationwide since 2022 with LGUs, covering indoor/outdoor particulates and gases, plus mobile and wearable sensors (UP CIDS, 2025-07-09, cids.up.edu.ph/making-invisible-visible-up-experts-government-industry-push-democratized-air-quality-monitoring-through-low-cost-sensors/).
- DENR-EMB has expressed interest in integrating low-cost technologies into the national monitoring network and is updating standards (UP CIDS, 2025-07-09).
- A UP Diliman study developed a GIS + heuristic algorithm for siting low-cost IoT air-quality sensors in near-road Quezon City; a 40-sensor test covered about **1.27–1.35 million residents (23.0%–24.4% of the city)** (ISPRS Annals, 2026-02-10).
- A low-cost LoRa PM2.5 system using PMS7003, BME280 and ESP32-LoRa cost about **USD 275**, achieved a **250 m** communication range and **92.4%** data delivery in field deployment (IEEE, 2026-02-05, doi.org/10.1109/acdsa67686.2026.11468017).
- A LoRa-based mobile air-quality system was installed on **e-trikes** at UP Diliman, measuring PM2.5, PM10, CO2, temperature, humidity and VOC with GPS and a Grafana dashboard (E3S Web of Conferences, 2025, doi.org/10.1051/e3sconf/202563403003).
- Caveats: tropical humidity and temperature challenge low-cost sensor accuracy; calibration and sensor selection matter (MDPI, 2021-12-28, mdpi.com/1660-4601/19/3/1522; E3S, 2025).

### B3. Drone-based environmental/infrastructure capture (Philippine examples)
- A Bulacan DRRMO used a DJI Matrice 4 drone and DJI Terra to map rivers and critical infrastructure before typhoon season, detecting **power lines in protruding trees**, trees close to power lines, hazardous tall trees near houses, river vegetation overgrowth and garbage accumulation (BRAAMD, 2026-08-14, braamdstore.com/tag/drrmo-drones/).
- A Mariveles, Bataan LGU used a DJI Zenmuse L3 LiDAR payload to survey **470 hectares in about 2 hours** and post-process in about **6 hours** for a drainage master plan (Drones.com.ph, 2026-08-14, drones.com.ph/fighting-the-floods-how-drones-can-help-the-philippines-respond-to-the-august-2026-habagat-crisis/).
- International utility practice: drones carry RGB, infrared, corona, RF-noise and LiDAR sensors for line/structure/substation inspection, vegetation management and storm damage; NERC documents these uses and benefits (NERC, 2019-02-01, nerc.com/globalassets/programs/event-analysis/lessons-learned/20190201_current_drone_usage.pdf).
- A Finland pilot used drones + LiDAR at night to detect storm damage on overhead lines, mapping **3 km** of line in **10–15 minutes** per scan (Hepta, 2021-04-19, heptainsights.com/case-study/storm-inspection-with-lidar-drones-finland/).

---

## Topic C: Safety and regulatory constraints

### C1. Safety is an explicit operating constraint
- Meralco says restoration "must be as fast as possible but never at the expense of worker and public safety"; crews navigate flooded roads, fallen trees, downed poles and unstable structures before repairs can begin (Daily Tribune, 2026-08-19, tribune.net.ph/2026/08/19/meralco-attributes-storm-resilience-to-long-term-infra-investments).
- Meralco issues public electrical-safety advisories before, during and after storms: turn off the main switch before floodwater enters, unplug appliances, wear rubber gloves and rubber-soled footwear when cleaning, ensure wiring is dry, and have flood-exposed systems inspected by a licensed electrician (The Chronicle, 2026-07-08).
- Crews are dispatched to investigate outages and assess damage before restoration; ETR may change based on crew assessment (Meralco "Brownouts and Incidents" FAQ, accessed 2026-11-12).

### C2. Drone and data-capture rules
- **CAAP rules for commercial RPAS** (drone) operations: register the drone (all commercial operations regardless of weight; non-commercial RPAs ≥7 kg also register), hold an **RPA Controller Certificate** (commercial operations or RPA ≥7 kg; 5-year validity), and an **RPAS Operator Certificate** for commercial operations. Fees include **P1,500 + 12% VAT** for registration and **P3,360** for the controller certificate (CAAP "RPA Registration", caap.gov.ph/rpa-registration-2/, accessed 2026-11-12; CAAP "RPA Controller Certificate", caap.gov.ph/rpa-controller-certificate/, accessed 2026-11-12).
- A **Special Flight Permit** is required for night flying, **BVLOS**, operating within **10 km of the aerodrome reference point**, flying over populated areas, or above **400 ft AGL** (CAAP "Types of Operations", caap.gov.ph/types-of-operations/, accessed 2026-11-12).
- **Open-category** limits (PCAR Part 11): RPA ≤25 kg, not over assemblies/uninvolved people, ≥30 m horizontal from people, ≥150 m from residential/commercial/industrial/recreational areas, VLOS only, ≤120 m AGL, no dropping goods; failing any condition moves the operation to the "specific" category requiring a **Certificate of Authorization** (CAAP PCAR Part 11, caap.gov.ph/wp-content/uploads/2026/01/PART-11-Aerial-Work-and-Operating-Limitations-for-Non-Type-Certificated-Aircraft.pdf, accessed 2026-11-12).
- Commercial operations also require **third-party liability insurance**, and **EVLOS is treated as BVLOS** (CAAP PCAR Part 11, accessed 2026-11-12).
- Imagery captured by field assets can include people, vehicles, plates or private property; this may engage the **Data Privacy Act** and require purpose limitation, access controls and retention rules (RA 10173; NPC IRR, accessed 2026-11-12).
- No current, **Meralco-specific** public guidance was found on drone flight rules, imagery retention or data-sharing with LGUs — see Open questions.

### C3. What "useful environmental and infrastructure data" could include
- Infrastructure condition: poles, conductors, insulators, transformers, vegetation encroachment, leaning/broken poles, sparking/fallen wires (Meralco FAQ; MIESCOR; NERC).
- Environmental: air quality (PM2.5/PM10, gases), temperature/humidity, flood/water levels, vegetation and heat (UP CARE; ISPRS; Drones.com.ph).
- Location/context: GPS-tagged photos, timestamps, pole numbers, service IDs, landmarks (Meralco FAQ; Meralco procurement page).

---

## Topic D: Mapping findings to the challenge goals

### Goal: Capture useful environmental and infrastructure data
- Existing capture channels: crew smartphones (MRA, RTVA, photo upload), tablets (Navagis), drones (planning since 2015; MSpectrum thermal/drone O&M), thermographic scanning, line patrol/pole inspection (MIESCOR), and customer-submitted photos through the outage/safety report form (Sources in Topic A).
- Low-cost environmental sensing is feasible in the Philippine context (UP CARE, LoRa PM2.5, e-trike mobile monitoring) but is not documented as a Meralco deployment (Topic B).

### Field assets named in the challenge
- **Utility vehicles**: Meralco has a fleet (including 150+ EVs) and uses vehicles with GPS/tablets/smartphones; no public evidence of vehicles being used as systematic sensor platforms (Meralco 2016 deck; Meralco EV page).
- **Dashcams**: no public evidence found of Meralco dashcam use (see Open questions).
- **Smartphones**: clearly in use for meter reading, payment validation and photo capture (Meralco Corporate Partners, 2021-09-01).
- **Low-cost environmental sensors**: strong Philippine academic/LGU precedent, but no Meralco deployment found (UP CIDS, 2025-07-09; ISPRS, 2026-02-10).

### Constraint: Capture must be safe
- Meralco's own messaging prioritizes worker and public safety over speed; drones and remote sensing are attractive precisely because they reduce hazardous ground work (Daily Tribune, 2026-08-19; NERC, 2019).
- Drone use needs CAAP permits and privacy safeguards (Smart Energy International, 2015-09-07; RA 10173).

---

## Open questions / gaps (Challenge 4)
- **Current drone program**: no recent public figure for fleet size, flight volume, payloads or coverage; the only specific plan found is the 2015 "three drones" pilot (Smart Energy International, 2015-09-07).
- **Dashcams**: no public evidence found that Meralco uses dashcams in vehicles; this may be an unexplored area.
- **Low-cost environmental sensors**: no public evidence found that Meralco deploys air-quality or environmental sensors; the documented work is academic/LGU-led (UP CARE; DENR-EMB interest).
- **Vehicle-as-sensor**: whether Meralco vehicles carry cameras, LiDAR or environmental sensors beyond GPS/tablets — not found.
- **Resolved — CAAP rules**: registration, controller/operator certificates, Special Flight Permit triggers, open-category limits, BVLOS/EVLOS and flight-over-people rules are captured in Topic C2 (CAAP, accessed 2026-11-12). Remaining: confirm whether a **Meralco-specific** operator certificate/authorization and insurance are already in place.
- **Imagery/data governance**: whether Meralco has policies on retaining, sharing or publishing field imagery (especially images of people/private property) — not found.
- **Cost/benefit data**: no public Meralco figures on drone vs ground inspection cost or time savings; international sources cite large savings but are not Meralco-specific (NERC, 2019; Hepta, 2021).
- **Integration with GEOCC/AMI**: whether field-observation data would feed the planned 2030 GEOCC or a separate asset-management system — not stated publicly (Context.ph, 2026-10-23).
