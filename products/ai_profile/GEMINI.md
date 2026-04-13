# AI Developer Profile — Development Guide

A serverless developer profile site with a WebLLM-powered on-device AI sidebar.

## Project Overview

- **Core Purpose:** Give developers a portfolio page where visitors can chat
  with a local AI agent to learn about the developer's background, skills,
  and projects — entirely in the browser, with no backend.
- **Technologies:**
    - **Frontend:** Vanilla HTML5, CSS3, JavaScript (ES6+)
    - **AI Inference:** [WebLLM](https://webllm.mlc.ai/) (`@mlc-ai/web-llm`) loaded from CDN via ESM
    - **Default Model:** `Phi-3.5-mini-instruct-q4f16_1-MLC` (~2 GB, cached in browser, used on desktop)
    - **Mobile Model:** `SmolLM2-1.7B-Instruct-q4f16_1-MLC` (~1 GB, automatically selected on mobile/tablet)
    - **Testing:** Jest
    - **Deployment:** Firebase Hosting (or any static host)

## Project Structure

```
ai_profile/
├── index.html            # Main entry point: profile UI + AI sidebar
├── src/
│   ├── profile-data.js   # PROFILE config object + buildSystemPrompt()
│   └── chat.js           # WebLLM engine init, streaming, DOM helpers
├── tests/
│   ├── profile-data.test.js
│   └── chat.test.js
├── firebase.json         # Firebase Hosting config
├── package.json
├── README.md
└── GEMINI.md             # This file
```

## Architecture

### Profile Data (`src/profile-data.js`)
- Exports a `PROFILE` object (name, title, bio, skills, projects, experience, links).
- Exports `buildSystemPrompt()` which serialises the profile into a structured
  LLM system prompt used as the AI agent's grounding context.
- Edit `PROFILE` to customise the site for a different developer.

### Chat (`src/chat.js`)
- Dynamically imports `@mlc-ai/web-llm` from `esm.run` CDN at runtime.
- Calls `webllm.CreateMLCEngine(modelId, { initProgressCallback })` to download
  and initialise the model in the browser.
- Maintains `chatHistory` (system + user + assistant turns) and streams
  responses token-by-token using `engine.chat.completions.create({ stream: true })`.
- Exposes `initEngine()` and `initChatUI()` as global functions called from
  the main `<script type="module">` block in `index.html`.

### UI Layout (`index.html`)
- Two-column flex layout: left profile panel (scrollable) + right AI sidebar (fixed).
- Profile HTML is rendered from `PROFILE` data via an inline `<script>` block.
- The sidebar contains a status bar, chat message log, suggestion chips, and
  a textarea input with auto-resize.
- Responsive: stacks vertically on screens narrower than 768 px.

## Building and Running

### Prerequisites
- Node.js ≥ 18 (for Jest)
- Chrome 113+ with WebGPU enabled (for the AI chat)

### Local Development

```bash
cd products/ai_profile
npm install
npm test          # run Jest unit tests with coverage
# serve index.html with any static server, e.g.:
npx serve .
```

### Running Tests

```bash
npm test
# or in watch mode:
npm run test:watch
```

## Deployment

### Firebase Hosting

```bash
cd products/ai_profile
npx -y firebase-tools@latest deploy --only hosting:vc-ai-profile --token $FIREBASE_TOKEN --project vc-project-platform
```

### Any Static Host
Upload `index.html` and the `src/` directory. No build step is required.

## Customisation

| What to change | Where |
|---|---|
| Developer name, bio, links | `PROFILE` object in `src/profile-data.js` |
| Skills / projects / experience | `PROFILE` object in `src/profile-data.js` |
| AI model (desktop) | `DEFAULT_MODEL` constant in `src/chat.js` |
| AI model (mobile/tablet) | `MOBILE_MODEL` constant in `src/chat.js` |
| Colour scheme | CSS custom properties in `index.html` `:root` block |
| Sidebar width | `--sidebar-w` CSS variable in `index.html` |

## Browser Compatibility

WebLLM requires **WebGPU**, which is available in:
- Chrome / Edge 113+
- Firefox Nightly (behind a flag)
- Safari Technology Preview 185+

If WebGPU is unavailable, the status bar shows an informative error message
and the input remains disabled; the rest of the profile page continues to work.
