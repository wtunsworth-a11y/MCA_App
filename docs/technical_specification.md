# Managalas Conservation Area (MCA) App — Technical Specification

**Version:** 1.0
**Date:** 2026-06-14
**Status:** Active Development

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [Geographic Structure](#3-geographic-structure)
4. [User Tiers and Permissions](#4-user-tiers-and-permissions)
5. [Authentication](#5-authentication)
6. [Data Integrity and GPS Flagging](#6-data-integrity-and-gps-flagging)
7. [Offline Sync Strategy](#7-offline-sync-strategy)
8. [Modules](#8-modules)
   - 8.1 [Patrol](#81-patrol)
   - 8.2 [Biodiversity Survey (Line Transect)](#82-biodiversity-survey-line-transect)
   - 8.3 [Threat / Incident Report](#83-threat--incident-report)
   - 8.4 [Community Data](#84-community-data)
   - 8.5 [Environmental Alerts](#85-environmental-alerts)
   - 8.6 [Meetings and Calendar](#86-meetings-and-calendar)
   - 8.7 [Service Delivery Monitoring](#87-service-delivery-monitoring)
   - 8.8 [Observations](#88-observations)
   - 8.9 [Biodiversity Monitoring](#89-biodiversity-monitoring)
   - 8.10 [MaFIA Tool (Managalas Forest Integrity Assessment)](#810-mafia-tool-managalas-forest-integrity-assessment)
   - 8.11 [Performance Management (Deferred)](#811-performance-management-deferred)
9. [Acknowledgements](#9-acknowledgements)
10. [Admin Configuration](#10-admin-configuration)
11. [Infrastructure](#11-infrastructure)
12. [Future Considerations](#12-future-considerations)

---

## 1. Project Overview

The Managalas Conservation Area (MCA) App is a donor-funded conservation monitoring application built for Clan Stewards operating in the Managalas Conservation Area, Papua New Guinea. The app is the primary data collection and communication tool for community-based environmental stewardship across the MCA.

### Key Characteristics

- **Offline-first design:** Built for environments with limited or no network connectivity. All core functions operate fully offline; data syncs to the cloud when connectivity is available.
- **Field-deployed mobile app:** Targets Android devices used by Clan Stewards in remote areas.
- **Web-based administration:** A React web panel supports supervisory tiers (Zone Staff, MCF, External Partners, Technical Advisors, and Admins).
- **Portable architecture:** While built for the MCA, the system is designed to be configurable for deployment in other conservation areas via Admin-managed settings.
- **Permanent EU acknowledgement:** Version 1 was fully funded by the European Union. This acknowledgement is hardwired into the application and cannot be edited or removed by any user, including Admin.

---

## 2. Technology Stack

### Mobile Application

| Component | Technology |
|---|---|
| Framework | Flutter (Dart) |
| Target Platform | Android |
| Local Storage | SQLite via Drift |
| Maps | flutter_map (offline tile support) |
| Spatial Operations | turf_dart (on-device) |
| Video Meetings | jitsi_meet_flutter_sdk |
| Push Notifications | Firebase Cloud Messaging (FCM) |
| Calendar Integration | add_2_calendar package |

### Backend and Infrastructure

| Component | Technology |
|---|---|
| Database | Supabase (PostgreSQL + PostGIS) |
| API | Supabase REST API |
| Authentication | Supabase Auth |
| File Storage | Supabase Storage |
| Video Meetings Server | Jitsi Meet (self-hosted, DigitalOcean Sydney) |
| Cloud Hosting | DigitalOcean Sydney (testing phase, ~$24/month) |
| Push Notifications | Firebase Cloud Messaging (FCM) |
| AI Transcription | OpenAI Whisper (cloud API preferred; on-device fallback) |

### Web Administration Panel

| Component | Technology |
|---|---|
| Framework | React |
| Backend | Supabase (shared with mobile) |

---

## 3. Geographic Structure

The MCA is organised in a four-level geographic hierarchy. All boundaries are stored in Supabase and synced to devices.

```
MCA (whole area)
└── 11 Zones (1, 2, 3, 4, 5, 6, 7A, 7B, 8, 9, 10)
    └── Clans (multiple per zone, ~55 total)
        └── 2–5 Clan Stewards per clan
```

### Hierarchy Notes

- **MCA boundary:** Outer boundary polygon comprising 267 coordinate pairs. Admin-editable.
- **Zones:** 11 zones with Admin-editable boundaries. Zone 7A and Zone 7B are fully independent entities despite the shared numeric designation.
- **Clans:** Boundaries are based on customary law. Overlaps between clan boundaries are acknowledged but not enforced by the system. Admin-editable.
- **Stewards:** 2–5 Clan Stewards are assigned per clan.

### Spatial Data Specifications

**MCA Boundary:**
- 267 coordinate pairs stored as a polygon in PostGIS.

**Zone Polygons:**
- Stored with coordinate rings, including holes where applicable.
- Each zone has Admin-configurable fill colour, stroke colour, and label.

**Clan Polygons:**

| Field | Description |
|---|---|
| id | Unique identifier |
| name | Clan name |
| cu_name | Community unit name |
| zone | Parent zone |
| ward | Ward |
| llg | Local Level Government area |
| persons | Total population count |
| males | Male population count |
| females | Female population count |
| households | Household count |
| centroid | Centroid point (geometry) |
| coords | Boundary polygon coordinates |
| fill | Polygon fill colour (Admin-editable) |
| stroke | Polygon stroke colour (Admin-editable) |

---

## 4. User Tiers and Permissions

### Tier Overview

| Tier | Role Type | Data Visibility | Primary Platform |
|---|---|---|---|
| Clan Steward | Field collector | Own submitted records only | Mobile app |
| Zone Staff | Supervisory | Summary — own zone only | Web panel |
| MCF | Supervisory | Summary — all MCA by zone | Web panel |
| External Partner | Supervisory | Summary — all MCA | Web panel |
| Technical Advisor | Supervisory | Full detail — everything | Web panel |
| Admin | Configuration | Everything + system config | Web panel |

### Sub-Roles (within Meetings)

Two sub-roles exist within the meetings module and are scoped to committees (Zone Sub-Committees and the MCF Board):

| Sub-Role | Scope | Permissions |
|---|---|---|
| Secretary | One per Zone Sub-Committee + one for MCF Board | Create and schedule meetings; draft and submit agendas; record motions; compile and submit minutes |
| Chairman | One per Zone Sub-Committee + one for MCF Board | Approve or reject agendas; approve or return draft minutes |

### Environmental Alerts Visibility

Environmental alert visibility follows a separate, broader scope than general data visibility:

| Tier | Alert Visibility |
|---|---|
| Clan Steward | Own zone only |
| Zone Staff | Whole MCA |
| MCF | All MCA |
| External Partner | All MCA |
| Technical Advisor | All MCA |
| Admin | All MCA |

---

## 5. Authentication

### Biometric-Only Login

The MCA App uses fingerprint biometrics as the sole authentication mechanism. There is no password fallback. This design ensures that records are permanently and verifiably linked to a specific individual.

### Enrollment

- Physical, in-person enrollment is required.
- Admin supervises all initial enrollments to verify identity.
- One account per person — the account follows the individual, not the device.
- If a device is borrowed, the registered Steward's fingerprint will not match and access will be denied.

### Device Migration

If a Steward is issued a new device:
1. The Steward requests re-enrollment.
2. Admin reviews and approves the request in person.
3. Biometric data is registered on the new device under the same account.

### In-Field Fingerprint Verification

In addition to the app login, certain modules require a second, in-field fingerprint verification:
- **MaFIA Transect:** Required at the start of the transect, before data collection begins.
- **Jitsi video meetings:** Required before the meeting interface launches.
- **Meeting attendance:** Attendance is auto-recorded from the fingerprint-verified join event.

This second verification confirms the Steward is physically present at the field activity, not merely logged into the device.

---

## 6. Data Integrity and GPS Flagging

### GPS Recording

Every form submission records the device GPS coordinates at the time of data entry. This applies to all modules.

### Location Validation

The recorded GPS coordinates are compared against the expected location for the activity type. The acceptable radius for each activity type is Admin-configurable.

| Activity | Expected Location |
|---|---|
| Facility visit (Service Delivery Monitoring) | Within configurable radius of facility GPS coordinates |
| Biodiversity transect | Within configurable radius of transect start point |
| Patrol | Within clan boundary polygon |
| Incident / Threat report | Within or near MCA boundary polygon |
| Community data collection | Within clan boundary polygon |

### Flagging Behaviour

- A location mismatch does not prevent data submission. The record is saved normally.
- The submitting Steward is not notified of the flag.
- Flags are visible to Zone Staff and above in the reporting interface.

### Time-Based Flagging

Service Delivery Monitoring visits are only considered valid if they occur during approved windows:
- **Morning window:** 9:00 am – 11:00 am
- **Afternoon window:** 2:00 pm – 3:00 pm

Submissions outside these windows are saved and automatically flagged in reporting. The Steward is not notified.

---

## 7. Offline Sync Strategy

### Local Data Collection

All data is collected and stored locally in SQLite (via Drift) on the device. The app is fully functional with no network connection. There is no dependency on network access for data entry in any core module.

### Sync Behaviour

- Background sync to Supabase occurs automatically when a network connection becomes available.
- Sync is bi-directional: device data is pushed up; Admin-configured data is pulled down.

### Admin-Configured Data Sync (Pull)

The following data is pushed from Supabase to devices during sync:
- MCA and zone boundary polygons
- Clan boundaries and metadata
- Species lists
- Facility lists
- PNG public holiday lists
- School holiday periods
- Observation and threat type lists
- Acceptable GPS radii
- Jitsi server URL

### Environmental Alerts (Pull Only)

- VIIRS fire alert data and GFW forest cover change alerts are fetched and cached when connectivity is available.
- When offline, cached data is displayed alongside a prominent "last updated" timestamp.
- Environmental alerts use a pull-only model — no push notifications are generated for alert events.

### Meetings and Calendar

- Meeting data, agendas, minutes, and calendar entries are synced when online.
- Jitsi video meetings require an active network connection.

---

## 8. Modules

---

### 8.1 Patrol

Clan Stewards record patrol activities within their clan territory.

**Data Fields:**

| Field | Type |
|---|---|
| Date | Date (auto) |
| Start time | Time |
| End time | Time |
| Steward name(s) | Reference to verified Steward(s) |
| GPS track | Recorded path (geometry) |
| Distance | Calculated from GPS track |
| Observations / Notes | Free text |

---

### 8.2 Biodiversity Survey (Line Transect)

Stewards conduct wildlife observations along a randomly generated transect within their clan boundary.

#### Transect Generation Algorithm

The transect is generated programmatically using `turf_dart` on-device spatial operations. The algorithm ensures both endpoints fall within the clan boundary polygon.

1. Load the clan boundary polygon (GeoJSON).
2. Compute the bounding box of the polygon.
3. Generate a random point within the bounding box.
4. Test `booleanPointInPolygon(point, polygon)`. If false, return to step 3.
5. Pick a random bearing between 0° and 359°.
6. Calculate the endpoint using `destination(point, 0.1 km, bearing)` via `turf_dart`.
7. Test `booleanPointInPolygon(endpoint, polygon)`. If false, return to step 3.
8. Both endpoints are confirmed inside the polygon. The transect is valid.
9. Display the transect on the map. Show bearing and distance to the transect start point from the Steward's current GPS location.

#### Data Recorded Along the Transect

| Field | Type |
|---|---|
| Species encountered | From Admin-configurable species list |
| Distance from transect line | Measured distance |
| GPS point of sighting | Point (geometry, auto) |
| Count | Integer |
| Health/condition | Descriptive |
| Photo | Image (optional) |
| Notes | Free text (optional) |

---

### 8.3 Threat / Incident Report

Stewards record observed threats or incidents within or near the MCA.

**Data Fields:**

| Field | Type |
|---|---|
| Threat type | Single select from Admin-configurable list |
| GPS location | Point (geometry, auto) |
| Severity | Rating scale |
| Photo | Image (optional) |
| Description | Free text |
| Timestamp | Datetime (auto) |
| Submitting Steward | Linked to verified identity |

> **Note:** Threat and incident types are now captured under the Observations module (Section 8.8). The separate Threat / Incident module has been merged into Observations. Threat type remains an Admin-configurable observation type within that module.

---

### 8.4 Community Data

Records demographic and resource-use information at the village or clan level.

**Data Fields:**

| Field | Type |
|---|---|
| Village / Clan | Reference |
| Household count | Integer |
| Population data | Numeric fields |
| Resource use | Descriptive fields |
| Notes | Free text |

**Baseline data:** Demographic data from the clan data file is pre-loaded per clan and serves as the baseline for comparison across collection periods.

---

### 8.5 Environmental Alerts

Displays spatial environmental alerts overlaid on the map. This module is read-only for all tiers — no data entry occurs here.

#### Alert Sources

| Source | Data Type | Provider |
|---|---|---|
| VIIRS | Active fire alerts | NASA FIRMS API |
| GFW GLAD | Forest cover change alerts | Global Forest Watch |

#### Behaviour

| State | Behaviour |
|---|---|
| Online | Data auto-refreshes from APIs and is cached locally |
| Offline | Cached data displayed with "last updated" timestamp |

#### Visibility

Alert visibility is scoped by tier, independent of general data visibility rules. See [Section 4](#4-user-tiers-and-permissions) for the tier visibility table.

**Note:** No push notifications are sent for environmental alerts. The module is pull-only.

---

### 8.6 Meetings and Calendar

Supports structured committee meetings for Zone Sub-Committees and the MCF Board, with integrated video conferencing and AI-assisted transcription.

#### Applicable Tiers

| Committee | Members |
|---|---|
| Zone Sub-Committee | Zone Staff tier for a given zone |
| MCF Board | MCF tier members |

#### Roles in Meetings

- **Secretary:** Creates and schedules meetings, drafts agendas, records motions, compiles minutes.
- **Chairman:** Approves or rejects agendas and minutes.
- **Attendees:** View draft agendas, suggest agenda items, participate via Jitsi.

#### Agenda Structure

The agenda follows a fixed structure. Opening and closing items are hardwired and cannot be edited or removed. The middle section is variable.

| Position | Item |
|---|---|
| 1 | Opening Prayer (fixed) |
| 2 | Apologies (fixed) |
| 3 | Review of Minutes (fixed) |
| 4 to n | Variable agenda items (added by Secretary, suggested by attendees) |
| n+1 | Any Other Business — AOB (fixed) |
| n+2 | Date and Time of Next Meeting (fixed) |
| n+3 | Closing Prayer (fixed) |

**Auto-inserted agenda items:** If minutes from a previous meeting have not been finalised (returned for further edits), the agenda for the subsequent meeting automatically includes a finalisation item for each outstanding set of minutes. These auto-inserted items cannot be removed.

#### Meeting Workflow

1. Secretary creates the meeting and drafts the agenda.
2. Attendees can view the draft agenda and suggest additional items.
3. Secretary submits the agenda to the Chairman for approval.
4. **Chairman approves** → Agenda is finalised and distributed to attendees.
   **Chairman rejects** → Agenda is returned to the Secretary with written reasons. Secretary revises and resubmits. This cycle repeats until approval.
5. Meeting occurs via Jitsi video integration (requires network).
6. Attendance is automatically recorded from the fingerprint-verified join event.
7. Secretary records audio on a single central device. Motions and votes are logged in-app during the meeting.
8. AI transcription via Whisper processes the audio recording (English and Tok Pisin; Tok Pisin accuracy is acknowledged as imperfect).
9. Secretary reviews the AI-generated transcript and compiles draft minutes.
10. Secretary submits draft minutes to the Chairman.
11. **Chairman approves** → Minutes are circulated to all attendees.
    **Chairman returns** → Minutes go back to the Secretary for further edits. Process repeats.
12. At the next meeting, Agenda item 3 (Review of Minutes) formally reviews and ratifies the previous meeting's minutes.
13. Any outstanding unratified minutes are auto-inserted into subsequent agendas (see above).

#### Motion Recording

During a live meeting, the Secretary records motions using the in-app motion recording workflow:

1. Secretary taps "Record Motion."
2. All participants receive a visual indicator that the meeting is paused for a motion.
3. Secretary enters: motion text, name of seconder, and vote count (For / Against / Abstain).
4. Outcome is auto-calculated based on the vote count.
5. The motion record is locked into the minutes and cannot be edited after confirmation.
6. Meeting resumes.

#### Jitsi Integration

| Parameter | Detail |
|---|---|
| SDK | jitsi_meet_flutter_sdk |
| Server | Self-hosted on DigitalOcean Sydney (server configuration TBD — prerequisite for meetings module launch) |
| Network requirement | Active internet or internal wireless connection |
| Pre-join verification | Fingerprint verification required before Jitsi launches |
| Server URL | Admin-configurable |

#### Calendar Features

- Internal per-tier app calendar displays upcoming meetings and relevant dates.
- Device calendar integration via `add_2_calendar` package (adds meetings to the device's native calendar).
- `.ics` file export for calendar sharing.

---

### 8.7 Service Delivery Monitoring

Monitors staffing and attendance at health and education facilities within clan territories on two randomly scheduled working days per month.

#### Facility Management

- Admin uploads and maintains the facility list (name, type, GPS coordinates).
- The app assigns each facility to a clan using a point-in-polygon test against clan boundary polygons.

**Facility Types:**

| Category | Sub-types |
|---|---|
| Health | Clinic, Aid Post, Hospital |
| Education | Primary School, Secondary School |

#### Visit Scheduling

Two visits are scheduled per facility per month using randomly generated working days:

| Visit | Date Range |
|---|---|
| First visit | Random working day, days 1–10 of the month |
| Second visit | Random working day, days 11–20 of the month |

**Exclusions:**
- PNG public holidays (Admin-maintained list).
- School holiday periods (Admin-maintained, updated annually).

**Notification:** Clan Stewards receive a push notification (FCM) two days before each scheduled visit.

#### Roster Management

**First visit (baseline):**
- Steward records all staff names (health facilities) and teacher names plus student enrolment count (education facilities).
- This record becomes the baseline roster for the facility.

> **Note:** Student enrolment count is recorded for education facilities only. Health facility visits record staff attendance only — no student count field is shown or required for health facilities.

**Subsequent visits:**
- Steward compares against the baseline roster.
- Records: present / absent for each person on the roster.
- Adds new staff or students not on the baseline.
- Marks individuals who have departed.

#### Visit Time Constraint

Visits are only considered valid during the following windows:
- **Morning:** 9:00 am – 11:00 am
- **Afternoon:** 2:00 pm – 3:00 pm

Submissions outside these windows are saved and flagged in reporting. The Steward is not notified of the flag.

#### Failsafe Workflow

The system manages non-completion automatically through a tiered escalation process:

| Step | Trigger | Action |
|---|---|---|
| 1 | Steward misses scheduled visit | App automatically proposes a new date within the same month. Zone Staff are notified. |
| 2 | Steward misses rescheduled visit | Failsafe triggers automatically. The adjacent clan Steward is notified via push notification. Zone Staff are notified. |
| Ongoing | Repeated non-completion | Completion rates are tracked over time. Substitute visit requests are routed to the most consistently reliable Stewards. |

#### Attribution

Each facility visit record carries two distinct attribution fields:

| Field | Definition |
|---|---|
| Responsible Steward | The Steward accountable for completing the visit (may not be the person who attended) |
| Collecting Steward | The person who physically conducted the visit (may be a substitute) |

Non-completion is logged against the Responsible Steward's performance record regardless of whether a substitute completed the visit.

---

### 8.8 Observations

Clan Stewards record notable observations encountered during fieldwork. This module has no compliance or enforcement dimension — it is an observational record only.

**Who can record:** Clan Steward (General User tier planned for a future release).

#### Observation Types

Observation types are Admin-configurable. The base set is:

| # | Type | Notes |
|---|---|---|
| 1 | Cultural event | |
| 2 | Wildlife sighting | |
| 3 | Hunting event | Neutral — customary landowners manage their own resources |
| 4 | Non-compliance | |
| 5 | Social unrest | |
| 6 | Natural disaster | Sub-types: flood, garden damage, landslide, earthquake (Admin-configurable) |
| 7 | Forest fire | |

#### Data Captured

| Field | Required | Type |
|---|---|---|
| Observation type | Yes | Single select |
| GPS point | Yes | Point (auto) |
| Short text description | Yes | Free text |
| Photo | No | Image |
| Voice recording | No | Audio |
| Video | No | Video |
| Extended text description | No | Free text |
| Timestamp | Yes | Datetime (auto) |
| Submitting Steward | Yes | Linked to fingerprint-verified identity |

**Visibility:** Standard tier data visibility rules apply. No special alerts are generated for any observation type. The app does not replace emergency services.

---

### 8.9 Biodiversity Monitoring

This module is a placeholder pending formal protocol definition.

- **Current state:** Displays a "Coming Soon" screen.
- **Activation:** Admin can activate the module once the monitoring protocol has been defined.
- No data collection occurs until the module is activated.

---

### 8.10 MaFIA Tool (Managalas Forest Integrity Assessment)

The MaFIA Tool is a structured forest condition assessment conducted along a randomly generated 100-metre transect within the Steward's clan boundary. It is the most complex data collection module in the app.

#### Transect Structure

Each MaFIA assessment comprises:

| Component | Quantity | Scope |
|---|---|---|
| Transect Description | 1 | Whole transect |
| Sub-transects (Modules A–G) | 5 × 20m | Each sub-transect completed independently |
| Module H — Comments | 1 | Whole transect |

#### Transect Generation

The same algorithm used for Biodiversity Surveys (see [Section 8.2](#82-biodiversity-survey-line-transect)) is applied, with a fixed transect length of 100 metres. Both the start point and end point must fall within the Steward's clan boundary polygon.

#### Walking Methodology

The Steward walks the transect line three times:
1. **Enter:** Initial walk along the transect.
2. **Verify:** Second walk to confirm observations.
3. **Confirm:** Final walk to complete data entry.

#### GPS Gate

The MaFIA data entry form is locked until the Steward is within 30 metres of the transect start point (verified by device GPS). The app displays a compass bearing and walking distance to the start point while the Steward is en route. This gate cannot be bypassed.

#### UI Layout

The data entry interface uses a **landscape-mode matrix view**:
- Rows represent questions (A1 through G13).
- Columns represent sub-transects (ST1 through ST5).

Copy/paste of values between sub-transects is explicitly disabled to prevent data shortcuts that would compromise data integrity.

#### In-Field Fingerprint Verification

Fingerprint verification is required at the start of the transect (before data collection begins) in addition to the standard app login.

---

#### Transect Description (recorded once per transect)

| Field | Entry Method |
|---|---|
| Date | Auto |
| Time Started | Auto — when transect is initiated |
| Time Finished | Auto — when submitted |
| Clan Steward Name | Linked from fingerprint verification |
| Start Point GPS | Auto |
| End Point GPS | Auto |
| Transect Bearing | Auto from transect generation |
| Transect Length | Fixed at 100m (auto) |
| Cloud cover | Toggle: Cloudy / Sunny |
| Rain | Toggle: Rainy / Dry |
| Wind | Toggle: Windy / Calm |

---

#### Module A — Topography and Physical Setting

| Code | Question | Response Type |
|---|---|---|
| A1 | Dominant landform | Single select: Flat / Slight slope / Very steep |
| A2 | Rocky outcrops present | Yes / No |
| A3 | Caves or rock shelters present | Yes / No |
| A4 | Flowing waterway | Yes / No |
| A5 | Still waterway | Yes / No |
| A6 | Dried-up channel | Yes / No |

---

#### Module B — Water

**Conditional display:** Module B is shown only if A4, A5, or A6 is answered Yes.

| Code | Question | Response Type |
|---|---|---|
| B1 | Water clear | Yes / No |
| B2 | Rocky riverbed | Yes / No |
| B3 | Sandy riverbed | Yes / No |
| B4 | Silty riverbed | Yes / No |
| B5 | Muddy riverbed | Yes / No |
| B6 | Stream on bedrock | Yes / No |

---

#### Module C — Soil

| Code | Question | Response Type |
|---|---|---|
| C1 | Signs of ground instability | Yes / No |
| C2 | Soil soft | Yes / No |
| C3 | Leaf litter present | Yes / No |
| C4 | Bare soil visible | Yes / No |
| C5 | Fungi present | Yes / No |
| C6 | Soil moist | Yes / No |

---

#### Module D — Vegetation Structure / Forest Condition

**Note displayed to Steward:** "Trees include palms and pandanus. Exclude bananas."

| Code | Question | Response Type | Notes |
|---|---|---|---|
| D1 | Trees smaller than thumb width | Tally counter | Thin saplings / seedlings |
| D2 | Trees larger than thumb, smaller than hands around | Tally counter | Small stems |
| D3 | Trees larger than hands, smaller than arms around | Tally counter | Medium trees |
| D4 | Trees larger than arms can reach around | Tally counter | Very large trees |
| D5 | Canopy cover | Single select: Closed / Partially closed / Open | |
| D6 | Canopy composition | Single select: Mixed forest / Single-species forest | |
| D7 | Tree spacing | Single select: Regular / Irregular | |
| D8 | Signs of extreme weather damage | Yes / No | |
| D9 | Uprooted trees | Yes / No | Shown only if D8 = Yes |
| D10 | Broken branches or trunks | Yes / No | Shown only if D8 = Yes |
| D11 | Leaning trees in same direction | Yes / No | Shown only if D8 = Yes |
| D12 | Crop damage | Yes / No | Shown only if D8 = Yes |
| D13 | Canopy gaps | Yes / No | Shown only if D8 = Yes |
| D14 | Epiphytes or climbers | Yes / No | Orchids, ferns, vines |
| D15 | Fallen logs | Yes / No | Dead wood on ground |
| D16 | Dead standing trees or snags | Yes / No | |
| D17 | Invasive plants or weeds | Yes / No | Wild daka, aggressive weeds |
| D18 | Kunai grass patches | Yes / No | Open grassland |
| D19 | Bamboo patches | Yes / No | |
| D20 | Palms present | Yes / No | Sago, forest palms, coconut |
| D21 | Rattan / Kanda | Yes / No | Calamus spp. |
| D22 | Shrubs | Yes / No | Multi-stemmed understory plants |
| D23 | Herbs | Yes / No | Soft-stem plants, forest flowers, ground herbs |

---

#### Module E — Undergrowth and Cultivation

| Code | Question | Response Type |
|---|---|---|
| E1 | Garden crops present | Yes / No → if Yes: Maintained / Overgrown |
| E2 | Cash crops present | Yes / No → if Yes: Maintained / Overgrown |

---

#### Module F — Wildlife Indicators

Each indicator uses a **Present / Absent toggle**. When Present is selected, a tally counter becomes active to record the count.

| Code | Indicator | Examples |
|---|---|---|
| F1 | Mammals seen | Cuscus, wallaby, pig |
| F2 | Birds seen | |
| F3 | Bird calls | |
| F4 | Reptiles seen | Lizards, snakes |
| F5 | Frogs seen | |
| F6 | Frogs heard | |
| F7 | Insects seen | Butterflies, beetles |
| F8 | Insects heard | Buzzing, chirping |
| F9 | Leeches seen | On ground or on people |
| F10 | Bird feathers | Bird remains |
| F11 | Fur or skin | Animal hair, shed skin |
| F12 | Bones or carcasses | Dead animals |
| F13 | Nests, burrows, or insect houses | Bird nests, termite mounds, ant nests, animal burrows |
| F14 | Fruit eaten by animals | Chewed, pecked, or dropped fruit |
| F15 | Footprints or dung | Pig, cassowary |

---

#### Module G — Use

| Code | Question | Response Type | Notes |
|---|---|---|---|
| G1 | Animal traps, hunting platforms, corridors, or nets | Yes / No | |
| G2 | Burnt patches of land | Yes / No | |
| G3 | Signs of fire, campfires, ash, or charcoal | Yes / No | |
| G4 | Evidence of collection of forest foods | Yes / No | Nutshells, fruit peelings, sago |
| G5 | Trees cut or tree stumps | Yes / No | |
| G6 | Tally of stumps smaller than hands | Tally counter | Shown only if G5 = Yes |
| G7 | Tally of stumps larger than hands, smaller than arms | Tally counter | Shown only if G5 = Yes |
| G8 | Tally of stumps larger than arms (big trees) | Tally counter | Shown only if G5 = Yes |
| G9 | Old or abandoned garden | Yes / No | |
| G10 | Riverbank digging or gold panning | Yes / No | |
| G11 | Pruned or ring-barked trees | Yes / No | |
| G12 | Roads or tracks crossing transect | Yes / No | |
| G13 | Human voices or activity heard | Yes / No | Voices, boomboxes, vehicles |

---

#### Module H — Comments (Whole Transect)

Free text field, optional, covering the entire transect. Voice-to-text input is supported.

---

### 8.11 Performance Management (Active — V1)

This module tracks duty compliance across all tiers and provides visibility into the reliability and responsiveness of system participants.

#### Clan Steward — Personal Dashboard

The Performance Monitoring screen is accessible from the main dashboard. It displays metrics for the logged-in Steward and their zone committee.

**Personal Metrics:**

| Metric | Description |
|---|---|
| Task Completion Rate | Percentage of assigned tasks completed on time |
| GPS Compliance | Percentage of submissions with valid GPS coordinates within expected range |
| On-Time Rate | Percentage of visits and submissions made within valid time windows |
| SDM Visits This Month | Count of completed SDM visits against the monthly target (e.g. 2/2) |

**Zone Committee Metrics:**

| Metric | Description |
|---|---|
| Meetings Held (quarterly) | Count of committee meetings held against the scheduled target |
| Minutes Submitted | Count of meeting minutes submitted against the number of meetings held |
| Average Attendance | Average percentage attendance across committee meetings |

**Monthly Effort Report:**

A summary card lists all tasks completed by the Steward in the current month (patrols, SDM visits, MaFIA surveys, observations). A "Download Report" action is available to export the summary.

#### Metrics by Tier

| Tier | Tracked Metrics |
|---|---|
| Clan Steward | Completion rates, GPS integrity, timing compliance, SDM visit count |
| Zone Staff | Meeting scheduling frequency, response to escalations |
| Secretary | Agenda submission timeliness, minutes turnaround time |
| Chairman | Approval timeliness for agendas and minutes |
| MCF Staff | Oversight activity |
| Committees | Meeting frequency, quorum achievement, attendance rates, decision follow-through |

---

### 8.12 Map Module

The Map module provides a visual overview of the Managalas Conservation Area accessible from the bottom navigation bar on the main dashboard.

#### Features

- **MCA Boundary Layer:** Displays the outer boundary polygon of the Managalas Conservation Area.
- **Zones Layer:** Displays the 11 zone outlines within the MCA boundary, each with Admin-configurable fill and stroke colours.
- **Clans Layer:** Displays clan locations as labelled points within their respective zones.

#### Layer Toggles

The map screen provides pill-shaped toggle controls below the map to show or hide each layer independently:
- MCA Boundary
- Zones
- Clans

All layers are active by default. Tapping a toggle pill shows or hides the corresponding layer.

#### Legend

A legend card below the layer toggles identifies key map symbols:
- Fire alert markers (sourced from VIIRS / NASA FIRMS)
- Forest cover change markers (sourced from Global Forest Watch)

#### Map Technology

The live app uses `flutter_map` with pre-downloaded and cached offline tile sets (see Section 11 — Infrastructure). The prototype renders a stylised SVG representation for demonstration purposes.

#### Access

The Map screen is accessible from the bottom navigation bar on both the Home (Dashboard) and Map screens. It does not require a separate login step — the standard app authentication applies.

---

## 9. Acknowledgements

### European Union — Founding Donor (Version 1)

Version 1 of the MCA App was fully funded by the European Union. This acknowledgement is **permanent and hardwired** into both the mobile app and the web admin panel. It cannot be edited, hidden, or removed by any user at any tier, including Admin. This constraint must be preserved in all future versions of the application.

### Subsequent Donors

Admin users may add additional donors to the acknowledgements screen at any time. The donor list is append-only:
- No donor, once added, can ever be removed.
- No donor entry can be edited after submission.
- The EU entry always appears first and cannot be repositioned.

The Acknowledgements screen is accessible from both the mobile app and the web admin panel.

---

## 10. Admin Configuration

The following system parameters are configurable by Admin users only via the web admin panel.

| Configuration Item | Notes |
|---|---|
| MCA boundary polygon | GeoJSON polygon |
| Zone boundaries | 11 zones; geometry stored in PostGIS |
| Clan boundaries | Geometry + metadata |
| Zone colours | Fill colour, stroke colour, and label per zone |
| Species lists | Used in Biodiversity Survey module |
| Village and community names | |
| Clan names and Steward assignments | |
| Threat type list | Used in Threat / Incident Report module |
| Observation type and sub-type lists | Including natural disaster sub-types |
| Facility list | Name, type, GPS coordinates |
| PNG public holidays | Used in Service Delivery Monitoring scheduling |
| School holiday periods | Updated annually; used in scheduling |
| Acceptable GPS radius per activity type | Used in location validation / flagging |
| Jitsi server URL | Required for meetings module |
| Donor acknowledgements | Append-only; EU entry permanent |
| Biodiversity Monitoring module activation | Toggle to activate when protocol is defined |

---

## 11. Infrastructure

### Cloud Hosting

| Service | Provider | Region | Notes |
|---|---|---|---|
| Application infrastructure | DigitalOcean | Sydney, Australia | Testing phase (~$24/month) |
| Jitsi Meet server | DigitalOcean | Sydney, Australia | Self-hosted; server configuration TBD — prerequisite for meetings module |
| Supabase | Supabase managed cloud | — | Free tier to start; self-hosted option available |
| Firebase | Google Firebase | — | FCM push notifications only |

### Data Storage

| Layer | Technology | Purpose |
|---|---|---|
| On-device (mobile) | SQLite via Drift | Offline data collection and local cache |
| Cloud database | Supabase PostgreSQL + PostGIS | Primary data store; spatial queries |
| File storage | Supabase Storage | Photos, audio recordings, video |

### Offline Maps

- `flutter_map` package with support for pre-downloaded and cached tile sets.
- Tiles are cached on the device to enable full map functionality without network access.

### AI Transcription

| Option | Status |
|---|---|
| OpenAI Whisper (cloud API) | Preferred |
| On-device Whisper model | Fallback |

Whisper transcription is used for meeting audio. English accuracy is high. Tok Pisin accuracy is acknowledged as imperfect and requires Secretary review before minutes are finalised.

### Spatial Processing

On-device spatial operations are handled by `turf_dart`. Operations include:
- `booleanPointInPolygon` — point-in-polygon testing
- `destination` — calculating endpoint from origin, bearing, and distance
- Bounding box calculation
- Centroid calculation

---

## 12. Future Considerations

The following items are out of scope for Version 1 but are documented here to inform architectural decisions and ensure the codebase remains extensible.

| Feature | Notes |
|---|---|
| iOS version | The Flutter codebase supports iOS with minimal additional effort. Not scheduled for V1. |
| General User tier | A lower-permission tier for community members to submit observations only. Placeholder for future role in the Observations module. |
| Expanded Biodiversity Monitoring module | Awaiting formal protocol definition. The module shell and activation mechanism are included in V1. |
| Enhanced Performance Management dashboards | Full dashboards and reporting for the Performance Management module (see Section 8.11). |
| Multi-language support (Tok Pisin) | UI localisation into Tok Pisin. English is the sole UI language in V1. |
| Offline Whisper transcription | On-device Whisper model for meeting transcription without network access. Listed as a fallback in V1 infrastructure; full offline capability is a future goal. |

---

*End of Technical Specification*
