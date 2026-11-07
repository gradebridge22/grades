# OnTrack Grades Sync — browser extension (prototype 0.1)

**How it works.** The parent signs in to Canvas or Skyward Family Access *themselves*, in their own browser.
When they press **Read this page**, the extension reads what that page shows, displays the counts,
and only after **Send to OnTrack Grades** posts grades/assignments to the family's OnTrack Grades account.

- No school username or password is ever typed into, stored by, or sent to OnTrack Grades.
- Runs only on the tab you click, only when you click (`activeTab`; no background access to any site).
- Read-only: Canvas data comes from Canvas's own API via GET requests on an allowlist; quiz/test endpoints are blocked.
  Skyward data is read from the visible page. Nothing is clicked or submitted.
- Pairing uses a one-time 8-character code (10-minute expiry). The extension keeps a token; the server stores only its hash.
  Parents can revoke a paired browser any time under Connections.

## Install (developer mode)
1. Start OnTrack Grades (`npm run dev`), sign in as a parent → **Connections → Browser extension → Get pairing code**.
2. Chrome → `chrome://extensions` → turn on **Developer mode** → **Load unpacked** → choose this `extension/` folder.
3. Click the OnTrack Grades icon, enter the OnTrack Grades address and the code → **Pair**.
4. In a tab, sign in to Canvas (observer account) or Skyward Family Access → open the grades/gradebook page → **Read this page** → **Send**.

## Status
| Reader | State |
|---|---|
| Canvas (observer or student session) | Implemented against the documented Canvas REST API; **not yet tested on a live district** |
| Skyward Family Access gradebook | **Prototype heuristics.** District pages differ; use **Copy page outline** (structure only, no names or grades) to tune it |
| Skyward assignment details | Not yet read (they open in pop-ups on most districts) — next step after tuning |

## Before charging customers
Have a lawyer review Instructure's Canvas API Policy and Skyward's terms for parent-initiated automated reading,
and publish a clear privacy notice in the Chrome Web Store listing.
