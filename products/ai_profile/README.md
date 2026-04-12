# AI Developer Profile

A serverless developer profile site with a built-in AI assistant powered by
[WebLLM](https://webllm.mlc.ai/). The AI runs **entirely in the visitor's
browser** using WebGPU — no data is ever sent to a server.

## Features

- 🧑‍💻 Clean, customisable developer profile (bio, skills, projects, experience, links)
- 🤖 Sidebar AI chat that answers questions about the developer
- ⚡ On-device inference via WebLLM (Phi-3.5-mini by default)
- 🔒 100% private — model download and inference happen locally
- 🚀 Zero-infrastructure deployment (static hosting)

## Customising Your Profile

Edit `src/profile-data.js` and update the `PROFILE` object with your own
information. The AI agent's knowledge is automatically derived from this data.

## Requirements

The AI sidebar requires:

- **Chrome 113+** or another browser with WebGPU support
- On first load the model (~2 GB) is downloaded and cached in the browser

## Getting Started

```bash
cd products/ai_profile
npm install
npm test            # run Jest tests
# open index.html in Chrome 113+ to run locally
```

## Deployment

The site is a static HTML file and can be served from any CDN or static host.
See `firebase.json` for Firebase Hosting configuration.
