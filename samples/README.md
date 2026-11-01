# Test notices

Fictional notices for testing Noto. Open a file, copy all the text, and paste it on the teacher page
(http://localhost:3000/teacher). All schools, people and phone numbers are made up, and every
weekday has been checked against the calendar.

## Main tests

| File | "Who is this for?" | Students | What to check |
|---|---|---|---|
| `test-1-holiday-whole-school.txt` | **Whole school** | leave empty | Parents see "Whole school" in their language. Dates: 24 Dec, 1 Jan, 4 Jan, 21 Dec. The checklist says the bus restarts on 4 January and school timing changes to 8:30 AM–2:00 PM. Dashboard shows "X opened" with no "of". |
| `test-2-sports-day-classes-3-to-5.txt` | **Classes** → add `3A, 3B, 4A, 4B, 5A` (all at once, with commas) | `150` | 5 class boxes appear. ₹100 is kept exactly, and the deadline is Friday 4 December. Parents see "Classes 3A, 3B, 4A, 4B, 5A". Dashboard shows "X of 150 opened". |
| `test-3-fee-reminder-one-class.txt` | **Classes** → type `Class 8b`, press Enter | `42` | The box shows **8B** (tidied). ₹14,800 and ₹50 are kept exactly. The checklist warns that the report card is held back if fees are unpaid. |
| `test-4-exam-timetable-many-dates.txt` | **Classes** → `10A`, `10B`, `10C` (one at a time) | `120` | All 7 exam dates appear, each with a 9:30 AM start, plus the admit card date (21 Dec). "Add to calendar" works for each one. |
| `test-5-urgent-rain-closure.txt` | **Whole school** | leave empty | A very short notice still works. "School closed tomorrow" and "no buses" are clear. |
| `test-6-us-school-picture-day.txt` | **Classes** → `K, 1, 2` | leave empty | US dates (December 9, 2026) and dollars ($25, $40) are kept exactly. Check the Spanish and Vietnamese versions. "Retake Day in January" has no exact date, so it must **not** get a calendar button. |

## Should be refused (friendly error, no guessing)

| File | Expected message |
|---|---|
| `unclear-notice.txt` | "We couldn't read this notice clearly, so we did not guess…" |
| `not-a-notice.txt` | "This doesn't look like a school notice…" (the "ignore your instructions" trick is not obeyed) |

## Things to check in every language

1. Switch the editor between all 5 language buttons. **Every** label and button changes language.
2. The Hindi and Chinese texts contain no English words, except names (people, schools, places) and "WhatsApp".
3. Amounts (₹, $), times and dates are exactly as in the original.
4. Publish, then scan the QR code with your phone (start the server with `npm run dev:phone`).
5. On the phone, the notice opens in the phone's language. Try "Listen" and "Add to calendar".
6. The dashboard count goes up by 1 after the phone opens it, and **does not** go up when you open it again.

## Other samples

- `ptm-notice.txt`: the parent-teacher meeting notice used in Stage 2.
- Photo test: take a photo of any printed notice (or of one of these files on your screen) and use **📷 Add a photo**.
