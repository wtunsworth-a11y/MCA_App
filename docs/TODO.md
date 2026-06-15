# MCA App — To-Do List (Pending Actions)

Items in this list require action from outside this session (assets, decisions, accounts, etc.).

---

## Assets Needed

- [ ] **EU logo** — Provide the official EU emblem (SVG or PNG). Will be used on the Acknowledgements screen and login footer. Alternative: confirm if the code-rendered EU flag (blue rectangle, 12 gold stars in a circle) is acceptable.
- [ ] **CIFOR-ICRAF logo** — Provide logo file (SVG or PNG preferred). Will appear on the Acknowledgements screen.
- [ ] **Oro Provincial Government logo** — Provide crest or logo file (SVG or PNG preferred). Will appear on the Acknowledgements screen.
- [ ] **MCF logo** — Provide the Managalas Conservation Fund logo (SVG or PNG preferred). Will replace all "MCF Logo" placeholder boxes in the app header and Acknowledgements screen.

---

## Decisions Needed

- [x] **Acknowledgements — roles of partners** — CIFOR-ICRAF: Implementing Agency. MCF: Users. Oro Provincial Government: Project Partner. EU logo includes "Funded by the European Union" text (standard EU co-funding branding). ✓ Confirmed 2026-06-14
- [ ] **Acknowledgements — write the page content** — Draft the full acknowledgement text for each partner (EU, CIFOR-ICRAF, Oro Provincial Government, MCF) including any required legal disclaimer language. To be written by project team.
- [ ] **Acknowledgements — permanence** — Decide which logos/entries are hardwired (like EU) vs Admin-addable for future versions. Defer until acknowledgement page content is drafted.
- [ ] **Acknowledgements — logo layout** — Finalise layout once logos are available. EU prominence must meet EU co-funding branding requirements.
- [ ] **Jitsi server** — A self-hosted Jitsi Meet server is required before the Meetings module can launch video calls. Recommended: DigitalOcean Sydney droplet (~$24/month for testing). Decision needed on when to set this up.

---

## API Keys / Data Access

- [ ] **NASA FIRMS API key** — Register for a free API key at https://firms.modaps.eosdis.nasa.gov/api/ to access VIIRS near real-time fire alert data.
- [ ] **Global Forest Watch (GFW) GLAD alerts** — Check data access requirements at https://www.globalforestwatch.org/. May require a data access agreement depending on usage. Contact GFW team early to confirm terms.

---

## Accounts / Services to Set Up

- [ ] **Supabase project** — Create a Supabase project (free tier to start) for the database and auth backend. Share the project URL and anon key when ready.
- [ ] **Firebase project** — Create a Firebase project and enable Cloud Messaging (FCM) for push notifications (Service Delivery Monitoring alerts).
- [ ] **DigitalOcean account** — Required for cloud hosting (testing phase) and eventual Jitsi server.
- [ ] **Google Play Developer account** — Required to publish the Android app to the Play Store when ready.

---

## Content Needed

- [ ] **Dummy data for prototype** — User to provide realistic names, places, facility details, and activity data. See `docs/dummy_data.md` for the full specification of what is needed. Once received, prototype will be rebuilt with data wired in.
- [x] **PNG public holiday list** — 2026 confirmed via National Gazette; 2027 estimated (King's Birthday date needs gazette confirmation when released). See `docs/dummy_data.md`. ✓ Provided 2026-06-15
- [ ] **PNG public holidays 2027 — King's Birthday** — Confirm exact date via National Gazette when released (currently estimated as ~10 June 2027).
- [ ] **School holiday periods** — Provide annual school holiday calendar for PNG (used in SDM scheduling).
- [ ] **Facility list** — Provide the list of health facilities and schools within MCA clan territories (name, type, GPS coordinates) for upload into the admin panel.
- [ ] **Species list** — Provide the species list to be used in the Biodiversity Survey module (when protocol is defined).
- [ ] **Committee quorum requirements** — Provide the quorum threshold (minimum members required) for each committee (Zone Sub-Committees × 11, MCF Board). Used to gate votes in the Meetings module.
- [ ] **Acknowledgement page text** — Draft full text for each partner block (EU, CIFOR-ICRAF, Oro Provincial Government, MCF) including any legal disclaimer language required by the EU co-funding agreement.

---

## Prototype Rebuild Queue (changes collected from review — ready to build once dummy data received)

- [ ] Acknowledgements screen: 4 logo placeholders (EU · CIFOR-ICRAF · Oro Provincial Government · MCF) with role labels
- [ ] Three logo placeholders in every screen header
- [ ] New "Recent Activity" module tile + map screen with activity layers (MaFIA transect lines, Observation points colour-coded by type, Patrol route lines, SDM facility points colour-coded by compliance), time filter (7 days / 30 days / 1 year), scaled by access tier
- [ ] Performance Monitoring: add monthly grid calendar (colour-coded dots per day) + link to Recent Activity map
- [ ] MaFIA setup flow reorder: transect → navigate to start → fingerprint verify → begin survey
- [ ] Weather conditions moved from setup into Transect Description section of the survey
- [ ] MaFIA matrix: all questions A–H (71 rows), conditional rows labelled *(conditional)*, Module H as free-text below matrix
- [ ] Meetings: new meeting creation flow (5 steps: details → agenda draft → submit to members → member input → chairman approval)
- [ ] Meetings: motion recording flow (attendance → quorum check/notification → record motion → verify wording → seconder → vote count → lock)
- [ ] Meetings: quorum gate — blocks votes if not met; quorum result auto-inserted into minutes; discussion-only mode if quorum not met
- [ ] Wire in dummy data across all screens

---

*Last updated: 2026-06-14*
