# PrivaSearch — Design Brief

## 1. What it is

**PrivaSearch** is a privacy-first AI search engine that runs entirely on the
user's own machine. It combines a metasearch backend (SearXNG) with a local
LLM (Ollama) to return **AI-synthesized answers with clickable source
citations**, alongside the raw web results. No query, result, or answer ever
leaves the device; there is no cloud AI, no accounts, no tracking.

**Tone:** trustworthy, calm, technical-but-approachable, privacy-forward.
Think "a search engine that respects you." Dark-mode-first.

> ⚠️ **Hard design constraint (privacy):** the page may load **no external
> assets at runtime** — no Google Fonts / web fonts, no icon CDNs, no remote
> images, no analytics scripts. Everything must be self-contained (system
> fonts, inline SVG icons, emoji, locally-served assets). Any redesign must
> respect this.

---

## 2. Global elements (present on every view)

- **Brand header** — lock emoji + "PrivaSearch" wordmark (currently a
  blue→purple gradient). Collapses to a compact size once the user searches or
  enters chat.
- **Mode switcher** — a centered segmented control with two options:
  **🔎 Search** and **💬 Chat**.
- **Privacy badge (fixed, top-right)** — a pill that reflects the user's live
  privacy posture (see §5). Expands into a detailed panel on click.
- **Footer** — "No tracking · No query logging · 100% self-hosted".

---

## 3. Search experience

### 3.1 Search bar
- Magnifier icon, placeholder "Ask anything…", large rounded input.
- **Clear (×) button** appears when there's text.
- **"/" keyboard shortcut** focuses the field (a `/` hint chip sits in the input).
- Submit button shows a spinner while working.

### 3.2 Categories & filters (appear once searching)
- **Category tabs:** All, Images, Videos, News, Science, Music, IT, Files, Map.
- **Filter dropdowns:**
  - Time range — Any / Past day / week / month / year
  - SafeSearch — Moderate / Off / Strict
  - Language — Any / English / French / Spanish / German / Arabic
- Changing any category or filter **re-runs the search immediately**.

### 3.3 AI answer card (text categories only: All, News, Science, IT)
- Header "✦ AI answer" + loading spinner while generating.
- **Streamed answer** rendered token-by-token with a blinking cursor.
- **Inline citations** `[1]`, `[2]` rendered as small clickable chips that link
  to the matching source and highlight it.
- **Copy button** (copies the answer text).
- **Skeleton loader** (shimmer lines) before the first token arrives.
- **Source-count control** (below the answer):
  - Label "AI considered **N** of **M** sources"
  - A stepper: `−  N  +`
  - A **↻ Regenerate** button — re-runs the answer using the chosen number of
    sources, instantly (no new search).

### 3.4 Web results list (paginated)
Rendered differently per category:

- **Text results** (default): numbered chip, title (link), URL (monospace,
  truncated), snippet, source engine label, optional published date, a
  **"★ in answer"** badge on results the AI cited, and a **"✨ Summarize"**
  button.
- **Images:** responsive grid of square thumbnails with hover-zoom; caption
  overlay shows title + resolution. Click opens the source page.
- **Videos:** horizontal cards — thumbnail (with duration badge), title,
  author, snippet.
- **Per-source "Summarize with AI":** streams a short AI summary of that single
  result inline, in an expandable box under the card.
- **Pagination:** ← Prev / Next → with a page indicator.
- **Skeleton loaders** while a page loads.

---

## 4. Chat experience

A plain, private multi-turn conversation with the local AI (no search, no RAG).

- **Empty state:** 💬 icon, "Chat privately with your local AI", and a short
  reassurance that nothing leaves the machine and the conversation is wiped on
  reload.
- **Message bubbles:** user messages right-aligned (accent/blue), assistant
  left-aligned (elevated surface). Assistant replies stream with a live cursor.
- **Composer:** auto-growing textarea (Enter to send, Shift+Enter for newline),
  **Send** button; while generating it becomes a **Stop** button; a **Clear**
  button wipes the conversation.
- Auto-scrolls to the newest message. History is in-memory only.

---

## 5. Privacy badge & panel (signature element)

A persistent, reassuring status indicator — arguably the product's identity.

### Collapsed pill
- Shows a location/flag + a short label + a **mode chip**:
  - **Direct** (amber) — real location shown, e.g. "🇫🇷 Vitré, France".
  - **via Tor** / **via VPN** (green) — when routed through the tunnel; in Tor
    mode it shows the **actual Tor exit** (e.g. "🇩🇪 Exit: Haßfurt").

### Expanded panel ("Your privacy posture")
- Tagline: "As close to anonymous as a self-hosted search gets."
- **Exit identity card:** flag, city/country, exit IP, and how search traffic
  exits (Direct / via Tor / via VPN), with a one-line explanation.
- **Feature list** (each an icon + bold lead + sentence):
  - 🧠 The AI runs on your machine
  - 🕵️ No logs, ever
  - 🔒 Nothing is exposed
  - 🚫 Zero tracking
  - 🧅 Hide even from the engines (Tor/VPN)
  - 🖼️ Images can't track you (proxied thumbnails)
  - 📄 You stay in control (opt-in page fetch)
  - 🧾 Grounded, not guessing (cited answers)
- **Honest footer:** a candid note about real limits (ISP visibility, one geo
  lookup) — the honesty is part of the trust-building tone.

---

## 6. States to design

- **Loading:** answer skeleton, results skeleton cards, streaming cursors,
  button spinners.
- **Empty:** first load (hero + search), chat empty state, "no results".
- **Degraded:** AI unavailable → show raw results with a notice; Tor exit
  blocked → "no results" notice.
- **Error:** inline notices (amber) for search/LLM failures.

---

## 7. Current visual language (baseline — open to reinvention)

- **Theme:** dark-first. Deep navy-black backgrounds with a subtle ambient
  radial blue/purple glow behind the hero.
- **Accents:** blue `#5ea2ff` (primary), purple `#9d7bff` (secondary/AI),
  green (secure), amber (warning). Gradient blue→purple on the wordmark and
  primary buttons.
- **Type:** system UI font for body; monospace for URLs, numbers, code-like
  chips.
- **Shape:** generously rounded corners (9–16px), pill shapes for tabs/badges,
  soft shadows, 1px subtle borders.
- **Motion:** gentle fade-up on new content, hover lifts on cards, shimmer
  skeletons, blinking stream cursor. Respects `prefers-reduced-motion`.
- **Layout:** single centered column, ~820px max width, fully responsive
  (image grid reflows, video cards stack, badge label hides on mobile).

---

## 8. What a redesign should preserve
- The **two-mode** model (Search / Chat).
- The **privacy badge** as a trust centerpiece (mode-aware, with the exit info).
- **Streaming** answers/chat with a visible "thinking/typing" feel.
- **Citations** as first-class, clickable, and tied to the results list.
- The **source-count control** and **per-source summarize** affordances.
- Category/filter richness for the results.
- The **no-external-assets** constraint (system fonts, inline SVG/emoji only).
