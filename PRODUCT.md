# EKDK.DK
## Platform
web
## Stack
Next.js, explicitly requested. VATSIM OAuth required for workspace access.
## Users and purpose
VATSIM controllers in Copenhagen FIR need rapid access to airport information, charts, weather and procedure references during preparation and active sessions.
## Requirements
Persistent global search and navigation; airport aliases and runway/procedure queries; airport overviews; internal viewers; session pins; preserved document position and zoom; keyboard and touch access; explicit sources and unavailable states.
## Brand commitments
The user-supplied Copenhagen FIR airport overview.svg is the 1:1 authority for the overview layout. The six screenshots guide the other workspace views.
## Implementation assumptions and open decisions
Official charts are resolved with naviair-charts and displayed internally. Runway schematics derive from published threshold coordinates cross-checked against ADC, with lengths/surfaces from AD 2; reviewed source snapshots require maintenance. Weather uses the VATSIM METAR service, with observation ages, stale/cached warnings and raw reports. ILS course, frequency and identifier are extracted automatically from current official chart text, retaining per-chart provenance and handling ambiguity explicitly. Do not fabricate missing values or approved reference content. VATSIM credentials must be configured by the owner. All authenticated VATSIM members may enter; no rating or division restriction was requested. No concept labels or AIRAC labels on overview diagrams; retain source attribution and document verification access.
