# LexiLens — Security Test Cases

> **Who is this for?** Anyone on the team — you do **not** need a security background.
> Follow each step exactly as written. If anything behaves differently from the
> "Expected Result", mark the test as **FAIL** and add a note.

---

## TEST 1 — Malicious File Upload

| | |
|---|---|
| **Phase** | Phase 2 |
| **What I am testing** | The app should reject files that are pretending to be a PDF but are actually a different file type. |

### Steps

1. Find any `.docx` or `.mp3` file on your computer.
2. Make a copy of it so you don't lose the original.
3. Rename the copy so it ends with `.pdf` — for example, rename `song.mp3` to `document.pdf`.
4. Open LexiLens in your browser.
5. Go to the document upload area and upload the renamed file.
6. Watch the screen for a response.

### Expected Result

The app **rejects** the file and shows an inline error message that says **"file type not allowed"** (or similar wording). The file is not processed.

### Fail Condition

The file is accepted and the app begins processing it as if it were a real PDF.

- [ ] PASS · [ ] FAIL

**Notes:** _______________________________________________________________

---

## TEST 2 — Oversized File Upload

| | |
|---|---|
| **Phase** | Phase 2 |
| **What I am testing** | The app should block uploads that are larger than the 50 MB size limit. |

### Steps

1. Find or create a file that is **larger than 50 MB**. *(Tip: a short video file or a large zip archive usually works.)*
2. If needed, rename it to end with `.pdf` so the app doesn't reject it for the wrong reason.
3. Open LexiLens in your browser.
4. Go to the document upload area and try to upload the oversized file.
5. Watch the screen for a response.

### Expected Result

The app **rejects** the file and shows an inline error message that says **"file too large"** (or similar wording). The upload does not proceed.

### Fail Condition

The upload starts or completes successfully.

- [ ] PASS · [ ] FAIL

**Notes:** _______________________________________________________________

---

## TEST 3 — No Session Token

| | |
|---|---|
| **Phase** | Phase 2 |
| **What I am testing** | The backend should refuse a WebSocket connection that does not include a valid session token (a session token is a small piece of data that proves you started a real session). |

### Steps

1. Open Google Chrome.
2. Open **DevTools** — press `F12` on your keyboard (or right-click anywhere on the page and choose **Inspect**).
3. Click the **Console** tab at the top of the DevTools panel.
4. Click inside the console area (the blank space with the `>` prompt).
5. Paste the following code **exactly** and press **Enter**:

```js
const ws = new WebSocket('ws://localhost:8080/ws/session');
ws.onopen = () => { ws.send(JSON.stringify({type:'audio_chunk', data:'test'})); };
ws.onclose = (e) => { alert('Closed: ' + e.code + ' ' + e.reason); };
```

6. Wait a few seconds. A popup alert should appear.
7. Read the close code shown in the popup.

### Expected Result

The connection is **closed** and the popup shows close code **4001**. No session begins.

### Fail Condition

The connection stays open, or a session starts and responds to audio data.

- [ ] PASS · [ ] FAIL

**Notes:** _______________________________________________________________

---

## TEST 4 — Rate Limiting

| | |
|---|---|
| **Phase** | Phase 2 |
| **What I am testing** | The app should stop accepting new connections after 10 are already open, to prevent overload. |

### Steps

1. Open Google Chrome.
2. Open LexiLens in a tab and start a session.
3. Open a **new tab** (`Ctrl + T`) and go to the same LexiLens URL. Start a session.
4. Repeat step 3 until you have **12 tabs** total, all pointing to LexiLens.
5. Try to start a session in the **11th** and **12th** tabs.
6. Watch what happens in those last two tabs.

### Expected Result

The first 10 tabs connect normally. The **11th and 12th tabs** show a **429 error** (which means "too many requests") and do not connect.

### Fail Condition

All 12 tabs connect and work without any error.

- [ ] PASS · [ ] FAIL

**Notes:** _______________________________________________________________

---

## TEST 5 — Malformed WebSocket Message

| | |
|---|---|
| **Phase** | Phase 2 |
| **What I am testing** | The server should safely handle bad or unexpected messages without crashing or running harmful code. |

### Steps

1. Open LexiLens in Chrome and start a normal session (camera on, Lexi active).
2. Open **DevTools** (`F12`) → **Console** tab.
3. You need to get a reference to the WebSocket. Look in the **Network** tab, filter by **WS** (WebSocket), and click the active connection. *(If you can't find it, ask a developer to help you grab the `ws` variable.)*
4. Once you have the WebSocket variable (we'll call it `ws`), paste each of these lines **one at a time** into the Console and press **Enter** after each:

```js
ws.send(JSON.stringify({type:'hack', payload:'<script>alert(1)</script>'}))
```

```js
ws.send(JSON.stringify({notavalidfield: true}))
```

```js
ws.send(JSON.stringify({}))
```

5. After each message, watch two things:
   - Does a popup alert appear on screen?
   - Does the app crash or stop working?

### Expected Result

- The server returns an **error response** for each bad message.
- **No popup alert** ever appears on screen.
- The app **continues working** normally after all three messages.

### Fail Condition

The server crashes, the app becomes unresponsive, **or** a popup saying "1" appears on screen.

- [ ] PASS · [ ] FAIL

**Notes:** _______________________________________________________________

---

## TEST 6 — CORS Cross-Origin Request

| | |
|---|---|
| **Phase** | Phase 3 |
| **What I am testing** | The backend should block requests that come from websites other than LexiLens itself. This is called CORS (Cross-Origin Resource Sharing) — it stops random websites from talking to our server. |

### Steps

1. Open Google Chrome.
2. Open a **blank tab** by typing `about:blank` in the address bar and pressing **Enter**.
3. Open **DevTools** (`F12`) → **Console** tab.
4. Paste the following code into the Console. **Replace `[BACKEND-URL]`** with the real backend address (ask a developer if you don't know it — it looks like `http://localhost:8080` or similar):

```js
fetch('http://[BACKEND-URL]/health').then(r => r.json()).then(console.log).catch(console.error)
```

5. Press **Enter** and watch the Console output.

### Expected Result

The Console shows a **CORS error** — a red message that says something like *"has been blocked by CORS policy"*. No useful data is returned.

### Fail Condition

The Console prints a successful response (for example `{status: "ok"}`).

- [ ] PASS · [ ] FAIL

**Notes:** _______________________________________________________________

---

## TEST 7 — Privacy Consent Bypass

| | |
|---|---|
| **Phase** | Phase 3 |
| **What I am testing** | Even if someone hides the privacy consent popup using code tricks, the app should still not work until consent is given properly by clicking the button. |

### Steps

1. Open LexiLens in Chrome. The privacy consent modal (popup) should appear.
2. **Do NOT click "I Understand".**
3. Open **DevTools** (`F12`) → **Console** tab.
4. Paste this code and press **Enter** — it hides the popup from view:

```js
document.getElementById('privacy-modal').style.display = 'none'
```

5. The popup should disappear from the screen.
6. Now try to do each of these:
   - Try to use the **camera**.
   - Try to **speak to Lexi**.
   - Try to **upload a document**.
7. See if any of those features actually work.

### Expected Result

**Nothing works.** The camera stays off, Lexi does not respond, and uploads are blocked. The session has not started because consent was never properly given.

### Fail Condition

**Any** feature works — camera turns on, Lexi responds, or a document uploads.

- [ ] PASS · [ ] FAIL

**Notes:** _______________________________________________________________

---

## TEST 8 — Firestore Direct Access

| | |
|---|---|
| **Phase** | Phase 4 |
| **What I am testing** | Session data stored in the database (Firestore) should only be accessible to the session that created it — not to other sessions or users. |

### Steps

1. Open LexiLens and complete a short session. Write down or copy the **session ID** (ask a developer where to find it if you're unsure).
2. Open the **Firebase Console** (or **Google Cloud Console**) in your browser.
3. Navigate to **Firestore Database**.
4. Find the collection that stores session data.
5. Look for a document that has a **different session ID** than the one you wrote down.
6. Try to **read** that document (click on it to view its contents).
7. Try to **edit** a field in that document (click a field and change its value).

### Expected Result

You get a **"Permission denied"** error for both reading and editing. You cannot see or change data from another session.

### Fail Condition

You can read the data or edit any field successfully.

- [ ] PASS · [ ] FAIL

**Notes:** _______________________________________________________________

---

## TEST 9 — PII in Logs

| | |
|---|---|
| **Phase** | Phase 4 |
| **What I am testing** | Nothing you say, upload, or dictate should ever appear in the system logs. Logs should only contain technical information, not personal content. PII stands for Personally Identifiable Information. |

### Steps

1. Open LexiLens and start a session.
2. During the session, do **all** of the following:
   - **Speak** at least 10 different sentences to Lexi. Include some unique, memorable phrases (e.g., *"My dog's name is Biscuit and he lives on Maple Street"*).
   - **Upload a document** that contains text you will remember.
   - Use the **dictation** feature and say a few sentences.
   - Use the **screen reader** feature on some text.
3. Continue the session for at least **5 minutes**, then end it.
4. Open the **Google Cloud Console** in your browser.
5. Go to **Logging** (also called **Cloud Logging** or **Logs Explorer**).
6. In the search bar, search for some of the exact words you spoke — for example, search for `Biscuit` or `Maple Street`.
7. Also search for any words from the document you uploaded.
8. Check if any log entries contain your spoken words or document content.

### Expected Result

**Zero results.** None of the words you spoke, dictated, or uploaded appear in any log entry.

### Fail Condition

**Any** spoken word, dictated text, or document content appears in the logs.

- [ ] PASS · [ ] FAIL

**Notes:** _______________________________________________________________

---

## TEST 10 — Path Traversal Filename

| | |
|---|---|
| **Phase** | Phase 4 |
| **What I am testing** | The app should clean up dangerous filenames so attackers cannot use file names to access system files or run code. "Path traversal" means using special characters like `../` to escape out of the upload folder. |

### Steps

1. Create a blank PDF file. *(Tip: open any text editor, print to PDF, or use an online "blank PDF" generator.)*
2. Make **two copies** of this PDF.
3. Rename the first copy to exactly:
   ```
   ../../../etc/passwd.pdf
   ```
   *(Your operating system may not allow the `/` characters in a filename — if so, note that in the results and skip to the next file.)*
4. Rename the second copy to exactly:
   ```
   <script>alert(1)</script>.pdf
   ```
5. Open LexiLens and upload **each file separately**.
6. After each upload, ask a developer (Person 1) to check what filename was actually stored on the backend server.

### Expected Result

The filename stored on the backend is **sanitised** — it has been cleaned up to a safe string. There should be **no path separators** (`/` or `\`) and **no HTML code** (`<script>`) in the stored filename.

### Fail Condition

The original dangerous filename is stored as-is anywhere on the backend.

- [ ] PASS · [ ] FAIL

**Notes:** _______________________________________________________________

---

## Summary Table

| Test # | Test Name | Phase | Result |
|--------|-----------|-------|--------|
| 1 | Malicious File Upload | Phase 2 | ☐ |
| 2 | Oversized File Upload | Phase 2 | ☐ |
| 3 | No Session Token | Phase 2 | ☐ |
| 4 | Rate Limiting | Phase 2 | ☐ |
| 5 | Malformed WebSocket Message | Phase 2 | ☐ |
| 6 | CORS Cross-Origin Request | Phase 3 | ☐ |
| 7 | Privacy Consent Bypass | Phase 3 | ☐ |
| 8 | Firestore Direct Access | Phase 4 | ☐ |
| 9 | PII in Logs | Phase 4 | ☐ |
| 10 | Path Traversal Filename | Phase 4 | ☐ |
