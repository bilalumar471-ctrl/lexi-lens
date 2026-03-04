# LexiLens Demo Video — Complete Director's Guide

> **Filming Date:** Day 20 — March 15, 2026  
> **Total Duration:** 4 minutes (4:00)  
> **AI Assistant:** Lexi — patient, warm, short sentences, never judgmental

---

## SECTION 1 — VIDEO OVERVIEW

### Duration & Pacing

| Segment | Time | Duration | Focus |
|---------|------|----------|-------|
| 1. Hook | 0:00–0:35 | 35s | Face to camera — emotional opening |
| 2. Privacy Notice | 0:35–0:40 | 5s | Privacy modal demo |
| 3. Document Upload + Highlighting | 0:40–1:20 | 40s | Upload + word-by-word highlight |
| 4. Live Camera Reading + Barge-In | 1:20–1:55 | 35s | Hold legal form to camera |
| 5. Screen Reader Mode | 1:55–2:25 | 30s | Wikipedia tab sharing |
| 6. Dictation Mode | 2:25–2:55 | 30s | Voice-to-clean-text |
| 7. Architecture Overview | 2:55–3:25 | 30s | Tech stack narration |
| 8. Closing Statement | 3:25–4:00 | 35s | Face to camera — human impact |

### Who Does What

| Person | Role | Responsibilities |
|--------|------|-----------------|
| **Person 1** | Backend Operator | Runs the backend server, triggers features behind the scenes, monitors terminal for errors, manages Gemini API connection, narrates the architecture segment |
| **Person 2** | Frontend Operator | Clicks buttons on screen, uploads documents, switches modes, shares browser tab, types in dictation — everything the viewer sees on screen |
| **Person 3 (You)** | On-Camera Presenter & Director | Speaks all scripted lines face to camera, directs Person 1 and Person 2 with verbal cues, controls pacing |

### Physical Props Needed

- Laptop with LexiLens frontend open (Person 2's machine — the one being screen-recorded)
- Second laptop or monitor for backend terminal (Person 1's machine — not shown on screen)
- Printed legal form (e.g. a tenancy agreement or NHS registration form — real, not fake)
- Printed children's book page (e.g. a page from *Charlotte's Web* or *The BFG*)
- Smartphone or webcam for face-to-camera segments
- Ring light or desk lamp with diffuser for even face lighting
- Tripod or stable phone mount
- Quiet room with no background noise
- Headphones for Person 1 (to monitor audio without feedback)
- Glass of water (for Person 3, in case of dry throat)

### What Needs to Be Open on Screen Before Filming Starts

- [ ] Chrome browser with LexiLens frontend loaded at `localhost:3000` (or deployed URL)
- [ ] Tab 1: LexiLens app — **Book mode** selected, fresh state, no previous uploads
- [ ] Tab 2: Wikipedia article on "Photosynthesis" (pre-loaded, ready to share)
- [ ] OBS Studio open with two scenes configured: **Webcam** and **Screen Capture**
- [ ] Backend terminal running with no errors visible
- [ ] Microphone tested and levels set (not peaking, not too quiet)
- [ ] All notifications on the laptop turned off (Do Not Disturb mode)
- [ ] Browser bookmarks bar hidden
- [ ] Desktop clean — no personal files visible

### Camera and Lighting Setup Tips

- **Face segments:** Position the camera at eye level. Look directly into the lens, not at the screen. Place the ring light directly behind the camera so it illuminates your face evenly with no harsh shadows.
- **Screen segments:** Use OBS "Display Capture" or "Window Capture" at 1920×1080. Hide the mouse cursor when not clicking.
- **Lighting:** Avoid overhead fluorescent lights — they create dark eye sockets. Use a warm-toned ring light or a desk lamp bounced off a white wall. Close curtains to block inconsistent sunlight.
- **Audio:** Use a lapel mic or headset mic, not the laptop's built-in microphone. Record audio and video together, not separately, to keep them in sync.

---

## SECTION 2 — SHOT BY SHOT BREAKDOWN

---

### Segment 1: Hook (0:00–0:35)

**View:** Person 3 face to camera  
**On screen:** Nothing — this is a talking-head shot  
**Person 1:** Standing by, backend running, doing nothing yet  
**Person 2:** Standing by, hands off the keyboard

#### Script (Person 3 speaks):

> "Imagine you're holding a letter from your doctor. It says something important — maybe about your medication, maybe about a test result. But when you look at the words, they swim. They blur. They rearrange themselves on the page. That's what reading looks like for over 700 million people worldwide who live with dyslexia.
>
> Now imagine you had a friend — someone patient, someone kind — who could sit beside you, read that letter out loud, highlight every word as they go, and then explain it to you in plain English. No judgment. No rushing.
>
> That's Lexi. And that's what we built. Let me show you."

**Timing note:** This is 35 seconds. Practise reading this at a calm, steady pace. Do not rush. Pause after "That's Lexi."

---

### Segment 2: Privacy Notice (0:35–0:40)

**View:** Screen recording — LexiLens app in browser  
**On screen:** Privacy notice modal appears on the LexiLens homepage  
**Person 1:** Backend is already running, no action needed  
**Person 2:** Waits for Person 3's cue, then clicks "I Consent" on the modal

#### Script (Person 3 speaks — voiceover):

> "First, Lexi asks for your consent. Your data stays private. Nothing is stored."

#### Actions:

| Time | Who | Action |
|------|-----|--------|
| 0:35 | Person 2 | Refreshes the page so the privacy modal appears |
| 0:37 | Person 3 | Speaks the voiceover line |
| 0:39 | Person 2 | Clicks "I Consent" button |
| 0:40 | — | Modal closes, app is ready — transition to next segment |

---

### Segment 3: Document Upload + Word Highlighting (0:40–1:20)

**View:** Screen recording — LexiLens app  
**On screen:** Person 2 uploads a document; Lexi begins reading aloud with word-by-word yellow highlighting  
**Person 1:** Monitors backend, ensures Gemini connection is stable  
**Person 2:** Uploads the document and lets Lexi read

#### Script (Person 3 speaks — voiceover):

> "Let's upload a page from a children's book. Watch what happens."

*(Pause 3 seconds while Person 2 drags the file in.)*

> "Lexi reads every word out loud. And see that yellow highlight? It follows along word by word, perfectly synced to her voice. If you're someone who loses their place on the page, this changes everything."

*(Lexi is reading the passage aloud during this. Let her voice be audible in the background.)*

> "Now I'm going to interrupt her — I'll just start talking."

*(Person 3 speaks over Lexi to trigger barge-in — Lexi stops immediately.)*

> "See that? She stopped. No awkward overlap. That's barge-in — Lexi listens the moment you speak."

> "Now let me ask her something. Lexi, can you explain this in simpler words?"

*(Lexi responds with a plain-language summary. Let Lexi's response play for 5–6 seconds.)*

> "Simple. Clear. No jargon."

#### Actions:

| Time | Who | Action |
|------|-----|--------|
| 0:40 | Person 2 | Selects "Book" mode if not already selected |
| 0:42 | Person 2 | Drags and drops the children's book page image into the upload area |
| 0:45 | — | Lexi begins reading aloud with word-by-word yellow highlighting |
| 0:55 | Person 3 | Speaks over Lexi to demonstrate barge-in — says "Hey Lexi" or any interruption |
| 0:56 | — | Lexi stops reading immediately |
| 1:00 | Person 3 | Asks "Lexi, can you explain this in simpler words?" |
| 1:02 | — | Lexi delivers a plain-language simplification |
| 1:08 | Person 3 | Delivers the "Simple. Clear. No jargon." line |
| 1:10 | Person 3 | Says "Now let's try something different." |
| 1:20 | — | Transition to next segment |

---

### Segment 4: Live Camera Reading + Barge-In (1:20–1:55)

**View:** Screen recording — LexiLens app showing live camera feed  
**On screen:** Person 2 holds a printed legal form up to the webcam; Lexi reads it aloud  
**Person 1:** Monitors backend, ready to troubleshoot  
**Person 2:** Holds the legal form steady in front of the camera

#### Script (Person 3 speaks — voiceover):

> "What if you don't have a digital file? What if it's a paper form — like this tenancy agreement?"

*(Person 2 holds the form up to the camera.)*

> "Lexi sees it through your camera and starts reading."

*(Lexi begins reading the legal form. Let her read for about 8 seconds.)*

> "This is a real legal form. Dense. Full of jargon. But Lexi reads it calmly, line by line."

*(Person 3 interrupts Lexi mid-sentence.)*

> "Lexi, what does this part mean in plain English?"

*(Lexi stops and gives a simplified explanation. Let Lexi talk for 5 seconds.)*

> "That's real understanding — not just reading."

#### Actions:

| Time | Who | Action |
|------|-----|--------|
| 1:20 | Person 2 | Switches to live camera mode in the app |
| 1:22 | Person 2 | Holds the printed tenancy agreement up to the webcam, keeping it steady and well-lit |
| 1:24 | — | Lexi begins reading the legal form aloud |
| 1:32 | Person 3 | Interrupts Lexi — "Lexi, what does this part mean in plain English?" |
| 1:33 | — | Lexi stops and delivers a simplified explanation |
| 1:38 | Person 3 | Says "That's real understanding — not just reading." |
| 1:55 | — | Transition to next segment |

---

### Segment 5: Screen Reader Mode (1:55–2:25)

**View:** Screen recording — Chrome browser showing a Wikipedia article  
**On screen:** Person 2 shares a browser tab; Lexi reads the Wikipedia page and answers a question  
**Person 1:** Monitors backend  
**Person 2:** Shares the Wikipedia tab and interacts with Lexi

#### Script (Person 3 speaks — voiceover):

> "Now let's say you're browsing the web. You've landed on a Wikipedia article about photosynthesis. The page is long. The text is small. Lexi can help."

*(Person 2 clicks "Screen Reader Mode" and shares the Wikipedia tab.)*

> "Lexi scans the page and starts reading."

*(Lexi reads the opening paragraph of the Wikipedia article. Let her read for 6 seconds.)*

> "But what if you just want the key points? Watch."

*(Person 3 says:)* "Lexi, what are the three main takeaways from this article?"

*(Lexi responds with a short bullet-point-style spoken summary, approximately 8 seconds.)*

> "You didn't have to read a single word."

#### Actions:

| Time | Who | Action |
|------|-----|--------|
| 1:55 | Person 2 | Clicks "Screen Reader" mode in LexiLens |
| 1:57 | Person 2 | Shares the pre-loaded Wikipedia "Photosynthesis" tab |
| 1:59 | — | Lexi begins reading the page aloud |
| 2:05 | Person 3 | Asks "Lexi, what are the three main takeaways from this article?" |
| 2:07 | — | Lexi responds with a concise spoken summary |
| 2:15 | Person 3 | Says "You didn't have to read a single word." |
| 2:25 | — | Transition to next segment |

---

### Segment 6: Dictation Mode (2:25–2:55)

**View:** Screen recording — LexiLens app in dictation mode  
**On screen:** Person 3 speaks messy sentences; Lexi converts them into clean, grammatically correct text  
**Person 1:** Monitors backend  
**Person 2:** Selects "Write" mode and activates dictation

#### Script (Person 3 speaks — voiceover then live):

> "But Lexi doesn't just read for you. She writes for you too."

*(Person 2 switches to Write mode and starts dictation.)*

> "I'll speak as if I'm trying to write an email — messy, unstructured, the way thoughts actually come out."

*(Person 3 speaks directly into the mic, deliberately messy:)*

> "Uh hey so I need to tell my landlord that the the heater is broken again and like it's been two weeks and nobody came to fix it and I'm really cold can they please send someone."

*(Lexi processes and displays clean text on screen, something like: "Dear Landlord, I am writing to inform you that the heater in my flat has been broken for two weeks. Despite reporting the issue, no one has come to repair it. Could you please arrange for someone to fix it as soon as possible? Thank you.")*

> "Look at that. My messy thoughts became a professional email. Spelling, grammar, structure — all handled."

#### Actions:

| Time | Who | Action |
|------|-----|--------|
| 2:25 | Person 2 | Switches to "Write" subject mode |
| 2:27 | Person 2 | Activates dictation mode |
| 2:30 | Person 3 | Speaks the messy landlord email sentence into the mic |
| 2:40 | — | Lexi displays the cleaned-up text on screen |
| 2:43 | Person 3 | Reads the voiceover line about the transformation |
| 2:55 | — | Transition to next segment |

---

### Segment 7: Architecture Overview (2:55–3:25)

**View:** Screen recording — architecture diagram or slide  
**On screen:** A simple architecture diagram showing: Frontend → WebSocket → FastAPI → Gemini Live API  
**Person 1:** Narrates the tech stack (Person 1 speaks for the first time)  
**Person 2:** Slowly scrolls or clicks through the diagram  
**Person 3:** Silent during this segment

#### Script (Person 1 speaks):

> "Under the hood, LexiLens runs on FastAPI connected to Google's Gemini Live API through a WebSocket. The frontend sends audio and images in real time. Gemini processes them and streams Lexi's voice back instantly.
>
> Highlighting is synced by tracking token timestamps from the API response. Barge-in works because the WebSocket is full-duplex — Lexi is always listening, even while she's speaking.
>
> We use Google Cloud Secret Manager for API keys and Cloud Logging for monitoring. The whole system is stateless — no user data is stored. Ever."

#### Actions:

| Time | Who | Action |
|------|-----|--------|
| 2:55 | Person 2 | Opens the architecture diagram (a pre-made image or slide) fullscreen |
| 2:56 | Person 1 | Begins narrating the tech stack |
| 3:10 | Person 2 | Scrolls or advances to show the highlighting/barge-in explanation visually |
| 3:20 | Person 1 | Finishes with the privacy/stateless line |
| 3:25 | — | Transition to closing segment |

**Preparation note:** Create the architecture diagram before filming day. Use a clean, minimal design — white background, coloured boxes with labels, arrows showing data flow. Tools: Excalidraw, Figma, or Google Slides.

---

### Segment 8: Closing Statement (3:25–4:00)

**View:** Person 3 face to camera  
**On screen:** Nothing — talking-head shot  
**Person 1:** Standing by, done  
**Person 2:** Standing by, done

#### Script (Person 3 speaks):

> "Dyslexia doesn't mean you're not smart. It means the tools weren't built for you. Until now.
>
> Lexi doesn't replace your ability to read. She stands beside you while you learn. She reads when you can't. She simplifies when you're confused. She writes when the words won't come out right.
>
> Seven hundred million people deserve a friend like that.
>
> This is LexiLens. Thank you for watching."

*(Hold eye contact with the camera for 2 seconds after finishing. Do not look away. Let the emotion land.)*

**Timing note:** This is 35 seconds. Speak slowly. Pause after "Until now." Pause again after "a friend like that." These pauses create emotional weight.

---

## SECTION 3 — PROPS AND PREPARATION LIST

### Physical Items

- [ ] Laptop for frontend (Person 2) — charged, plugged in, notifications off
- [ ] Laptop or monitor for backend terminal (Person 1) — not visible on camera
- [ ] Printed tenancy agreement or legal form (at least A4 size, clear black text on white paper)
- [ ] Printed children's book page (e.g. a page from *Charlotte's Web*, *The BFG*, or *Matilda*)
- [ ] Ring light (warm tone, positioned behind camera at eye level)
- [ ] Tripod or stable phone mount for face-to-camera segments
- [ ] Smartphone or webcam for recording Person 3's face
- [ ] Lapel microphone or headset microphone (not the laptop mic)
- [ ] Headphones for Person 1 (to monitor audio without causing feedback)
- [ ] Glass of water for Person 3
- [ ] Printed copy of this demo outline for Person 3 to reference between takes

### Digital Preparation

- [ ] LexiLens backend running and tested — no errors in terminal
- [ ] LexiLens frontend loaded at the correct URL, privacy modal ready to appear on refresh
- [ ] Gemini API key active and not rate-limited — test with a short phrase first
- [ ] "Book" mode selected in the app
- [ ] Children's book page image saved on desktop, ready to drag-and-drop
- [ ] Wikipedia "Photosynthesis" article open in a second Chrome tab
- [ ] Architecture diagram image or slide created, saved, and ready to open
- [ ] OBS Studio installed and configured with two scenes:
  - **Scene 1: Webcam** — for Person 3 face-to-camera segments
  - **Scene 2: Screen Capture** — for all app demo segments
- [ ] OBS recording settings: 1920×1080, 30fps, `.mkv` format (remux to `.mp4` after)
- [ ] Audio input in OBS set to the lapel/headset mic, not built-in mic
- [ ] Test recording — record 10 seconds, play it back, check audio levels and screen clarity
- [ ] Browser bookmarks bar hidden (right-click bookmarks bar → uncheck "Show bookmarks bar")
- [ ] All browser extensions with visible icons disabled or hidden
- [ ] Desktop wallpaper set to a plain dark colour (no personal photos)
- [ ] Do Not Disturb mode enabled on the filming laptop
- [ ] Phone on silent (all three people)

### Pre-Filming Test Run

- [ ] Do a full dry run of all 8 segments without recording — time it
- [ ] Confirm barge-in works reliably (test 3 times)
- [ ] Confirm word-by-word highlighting syncs with Lexi's voice
- [ ] Confirm screen reader mode can read the Wikipedia page
- [ ] Confirm dictation mode produces clean output
- [ ] Confirm the privacy modal appears on page refresh
- [ ] Check lighting — no harsh shadows on Person 3's face
- [ ] Check audio — crisp, no echo, no background hum

---

## SECTION 4 — FILMING TIPS

### Camera Setup for Face Segments

- Place the camera at **eye level** — not looking up at you, not looking down. Eye level makes you appear natural and relatable.
- Position the camera about **60–80 cm** from your face (roughly arm's length).
- Look directly **into the camera lens**, not at the screen or at the people around you. This creates the feeling that you are speaking directly to the viewer.
- Frame yourself from the **chest up** — head, shoulders, and a little space above your head. Do not cut off the top of your head.
- Use **portrait orientation** only if this is a vertical-format video. For YouTube, use **landscape (horizontal)**.

### Avoiding Bad Lighting

- **Do:** Place your main light source (ring light or desk lamp) directly behind and above the camera, pointing at your face.
- **Do:** Use a white wall or white poster board to your side to bounce light and fill in shadows.
- **Do:** Close the curtains. Natural light changes constantly and will make your video look inconsistent.
- **Don't:** Sit with a window behind you — you'll appear as a dark silhouette.
- **Don't:** Use overhead ceiling lights as your only light — they create dark shadows under your eyes and nose.
- **Don't:** Mix warm and cool light sources — pick one colour temperature.

### Recording Screen with OBS

1. Open OBS Studio.
2. Create **Scene 1** called "Webcam" — add a "Video Capture Device" source and select your camera.
3. Create **Scene 2** called "Screen Capture" — add a "Window Capture" source and select the Chrome window with LexiLens.
4. Set output resolution to **1920×1080** and frame rate to **30fps**.
5. Under Settings → Output → Recording, set format to **MKV** (this prevents file corruption if OBS crashes). You will remux to MP4 after filming.
6. Set the audio input to your lapel/headset mic under Settings → Audio → Mic/Auxiliary Audio.
7. Use the **Studio Mode** toggle so you can preview scenes before switching live.
8. Switch between Scene 1 and Scene 2 by clicking them in the Scenes panel. Person 2 or Person 1 can handle scene switching while Person 3 presents.

### Adding Captions After Filming

- Upload the final video to a free captioning tool like **CapCut (desktop)** or **DaVinci Resolve** (free version).
- Use the auto-caption feature to generate subtitles, then manually review and fix errors.
- Use a **bold, sans-serif font** (e.g. Montserrat or Open Sans) in white with a black outline or semi-transparent background.
- Position captions at the **bottom centre** of the screen.
- Keep each caption line to a **maximum of two lines** and **10 words per line**.
- Export captions as **burned-in** (baked into the video) for YouTube — this ensures they appear even if the viewer doesn't enable CC.

### What to Do If Something Goes Wrong Mid-Take

- **Lexi stops responding:** Person 1 checks the terminal for errors. If the WebSocket dropped, Person 1 restarts the backend. Person 2 refreshes the browser. Start the segment again from the beginning of that segment, not the beginning of the entire video. You will edit the clips together later.
- **Audio is bad:** Stop. Check your mic connection. Record a 5-second test clip. Play it back. If it sounds good, restart the segment.
- **Person 3 stumbles on a line:** Keep going. Do not stop and restart mid-sentence. Finish the take, then do another take of the same segment. Pick the best one during editing.
- **Highlighting falls out of sync:** Person 1 restarts the backend. Person 2 re-uploads the document. Retry the segment.
- **OBS crashes:** This is why you record in MKV format — whatever was recorded before the crash is safe. Reopen OBS, reconfigure if needed, and continue from the segment you were on.
- **General rule:** Film each segment as an independent clip. You are editing them together later. If one segment fails, only redo that segment.

---

## SECTION 5 — EDITING CHECKLIST

### Step 1: Organise Footage

- [ ] Copy all recorded files from OBS to a dedicated folder called `LexiLens_Demo_Raw`
- [ ] If you recorded in MKV, remux each file to MP4: OBS → File → Remux Recordings → select the MKV file → click Remux
- [ ] Rename each clip by segment: `01_hook.mp4`, `02_privacy.mp4`, `03_upload.mp4`, etc.
- [ ] Back up the raw files to a USB drive or cloud folder before you start editing

### Step 2: Assemble the Edit

- [ ] Open your editing software (CapCut Desktop, DaVinci Resolve, or Premiere Pro)
- [ ] Import all 8 clips onto the timeline in order
- [ ] Trim the start and end of each clip to remove dead air, false starts, and "ready?" moments
- [ ] Add a **1-second crossfade** transition between each segment for smooth flow
- [ ] Verify total duration is between 3:50 and 4:10 — adjust pacing if needed

### Step 3: Audio

- [ ] Normalise audio levels across all clips so the volume is consistent (-14 LUFS is the YouTube standard)
- [ ] Remove any background hums, clicks, or pops using noise reduction (DaVinci Resolve has this built in)
- [ ] Ensure Lexi's voice and Person 3's voice are both clearly audible — neither should overpower the other
- [ ] Add subtle background music (optional) — use royalty-free music at very low volume (10–15% of voice level). Suggestions: YouTube Audio Library, Pixabay Music, or Artlist free tier

### Step 4: Captions

- [ ] Auto-generate captions using CapCut or DaVinci Resolve
- [ ] Manually review every single caption for accuracy — auto-captions will get technical terms wrong
- [ ] Fix the spelling of "Lexi", "LexiLens", "Gemini", "FastAPI", and "WebSocket"
- [ ] Burn captions into the video (hardcode them so they always appear)

### Step 5: Colour Correction

- [ ] Match the colour temperature across all clips so face segments and screen segments don't look jarring
- [ ] Slightly increase contrast and saturation on face-to-camera segments to look vibrant
- [ ] Do **not** colour-correct the screen recording segments — they should look exactly as the app appears

### Step 6: Final Review

- [ ] Watch the entire video from start to finish without pausing
- [ ] Check: Are all transitions smooth? Is the audio consistent? Are captions accurate?
- [ ] Check: Does the total runtime hit 4:00 (plus or minus 10 seconds)?
- [ ] Show the video to at least one other person and ask: "Was anything confusing? Did anything feel too fast?"

### Step 7: Export

- [ ] Export at **1920×1080, 30fps, H.264 codec, high bitrate (15–20 Mbps)**
- [ ] File format: **.mp4**
- [ ] Filename: `LexiLens_Demo_Final_v1.mp4`
- [ ] File size should be under 500 MB for easy uploading

### Step 8: YouTube Upload Settings

- [ ] Title: `LexiLens — AI Reading Companion for Dyslexia`
- [ ] Description: Include a brief summary, team credits, and links to the GitHub repo or project page
- [ ] Tags: `dyslexia`, `accessibility`, `AI`, `reading assistant`, `LexiLens`, `assistive technology`, `Gemini API`
- [ ] Thumbnail: Create a custom thumbnail — use a high-quality still from the face-to-camera segment with the text "LexiLens" overlaid
- [ ] Visibility: Set to **Unlisted** first for team review, then switch to **Public** when ready
- [ ] Captions: Upload the `.srt` file as well (even though captions are burned in) for accessibility compliance
- [ ] Category: **Science & Technology** or **Education**

---

*This document is the complete director's guide for filming day. Print a copy for each team member. Do the dry run the night before. Trust the script. You've got this.*
