# Utsav demo script (3 minutes)

## Before you present

1. Check `.env.local` contains `DEMO_MODE=true`. The demo then needs no API key.
2. Run `pnpm dev`, then open http://localhost:3000. Open it once before presenting: the first load of each page is slow in dev.
3. Click **Try the demo wedding** once as a check. Every click makes a fresh copy, so nothing you rehearse carries over.

Events live in the server's memory, so restarting the server clears them. Just click the button again.

Use a phone-width window if you can. The app is designed for phones first.

## The pitch (15 seconds)

> "Checklists tell you what to do. Utsav understands how your decisions affect each other, and your family."

## 1. A plan from a short chat (30 seconds)

Click **Plan a celebration** and answer: Wedding, Bengali Hindu, Kolkata, 14 Feb 2027, 250, ₹15L.

**Say:** "Six questions and we have a full plan: rituals, budget and timeline. AI picks the structure, and code does all the maths."

Then go back to the home page and click **Try the demo wedding**. It's the same wedding with a family, a booked 300-seat hall and a quote already added. Continue on this copy, because the chat-built event has no hall size and won't show the venue conflict.

## 2. Rituals with sources (20 seconds)

Open **Timeline**. Show the ritual cards from Aashirbaad to Bou Bhaat, the item checklists, and the source under a card.

**Say:** "Cultural details come from a knowledge base, with sources. If we can't back something up, Utsav says so and suggests checking with the family priest."

## 3. Mom adds 100 guests (45 seconds): the main moment

On **Overview**, change the guest count to 350 and press **Update**.

**Show:** the cost goes up by ₹2.1L, the plan is ₹1.5L over budget, and the Biye has 350 guests for 300 seats. Open conflicts goes from 0 to 2.

**Say:** "One number changed, and Utsav shows every effect and why, with fixes priced by actually running each one."

Click **Apply** on **Choose budget-friendly attire**. The overrun drops to ₹54.2K.

> Use the attire fix here, not "Keep the guest list at 300". That one makes the Council's 300 option in the next step do nothing.

## 4. Family Council (40 seconds)

Open **Family**. Three people want three things: 150, 350 and 250 guests. Click **Hold the council**.

**Show:** where they differ, then the three compromises with their real cost.

Click **Choose this** on **Intimate wedding, big Bou Bhaat**. The plan drops by ₹1.8L and there are no conflicts left.

**Say:** "Utsav doesn't pick a winner. It shows the family what each compromise costs and who gives a little."

## 5. Quote X-Ray (30 seconds)

Open **Vendors**. The sample caterer quote is already checked, so show that card instead of uploading it again, which would add a second copy.

**Show:** the flagged costs, such as live counters "as per actuals" and GST charged extra, then the per-plate rate compared with typical prices.

Click the copy button on the drafted message.

**Say:** "Paste it into WhatsApp and the family has a polite, specific reply to the caterer."

## If something goes wrong

| Problem | What to do |
|---|---|
| "Couldn't generate that" | Check `DEMO_MODE=true` is in `.env.local`, then restart the server. |
| "We couldn't find that event" | The server restarted. Go home and click **Try the demo wedding**. |
| The Council says its options are out of date | The plan changed after the Council was held. Click **Hold the council again**. |
| You made a wrong change | Click **Undo** in the What changed panel. |

## Say this honestly if asked

- In demo mode the AI answers are saved samples, and event pages say so. The numbers are still calculated live.
- Saved samples exist only for the Bengali wedding and a birthday. Other traditions need an API key.
- Prices are indicative estimates, not real vendor quotes.
- Live-day mode (the bonus step in `CLAUDE.md`) isn't built, so leave it out.
