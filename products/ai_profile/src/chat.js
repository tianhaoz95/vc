/**
 * WebLLM-powered AI chat sidebar.
 *
 * Handles model initialisation, message rendering, and chat completions.
 * Depends on profile-data.js being loaded first.
 */

/* global PROFILE, buildSystemPrompt */

// ── Constants ──────────────────────────────────────────────────────────────

/** WebLLM CDN (ESM) */
const WEBLLM_CDN = "https://esm.run/@mlc-ai/web-llm";

/**
 * Default model for desktop/laptop browsers.
 * Phi-3.5-mini is small (~2 GB) and fast enough for a profile-assistant
 * use-case on hardware with a capable GPU.
 */
const DEFAULT_MODEL = "Phi-3.5-mini-instruct-q4f16_1-MLC";

/**
 * Lightweight model for mobile devices.
 * SmolLM2-1.7B is significantly smaller (~1 GB) and well-suited for the
 * weaker GPUs found on phones and tablets.
 */
const MOBILE_MODEL = "SmolLM2-1.7B-Instruct-q4f16_1-MLC";

// ── Device detection ───────────────────────────────────────────────────────

/**
 * Returns true when the page is running on a mobile (or tablet) device.
 *
 * Prefers the modern `navigator.userAgentData.mobile` hint when available;
 * falls back to a User-Agent string regex for older browsers.
 *
 * @returns {boolean}
 */
function isMobileDevice() {
  if (
    typeof navigator !== "undefined" &&
    navigator.userAgentData &&
    typeof navigator.userAgentData.mobile === "boolean"
  ) {
    return navigator.userAgentData.mobile;
  }
  if (typeof navigator !== "undefined" && navigator.userAgent) {
    return /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
  }
  return false;
}

// ── State ──────────────────────────────────────────────────────────────────

let engine = null;
let chatHistory = [];
let isGenerating = false;

// ── DOM helpers ────────────────────────────────────────────────────────────

/**
 * Appends a message bubble to the chat window.
 * @param {"user"|"assistant"|"system"} role
 * @param {string} text
 * @returns {HTMLElement} the message element (so callers can stream into it)
 */
function appendMessage(role, text) {
  const chatMessages = document.getElementById("chat-messages");

  const wrapper = document.createElement("div");
  wrapper.className = `message message-${role}`;

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  bubble.textContent = text;

  wrapper.appendChild(bubble);
  chatMessages.appendChild(wrapper);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return bubble;
}

/**
 * Updates the loading / status bar text.
 * @param {string} text
 * @param {"loading"|"ready"|"error"|"generating"} state
 */
function setStatus(text, state = "loading") {
  const bar = document.getElementById("model-status");
  if (!bar) return;
  bar.textContent = text;
  bar.className = `model-status model-status-${state}`;
}

/**
 * Enables or disables the send button and input field.
 * @param {boolean} enabled
 */
function setInputEnabled(enabled) {
  const input = document.getElementById("chat-input");
  const sendBtn = document.getElementById("send-btn");
  if (input) input.disabled = !enabled;
  if (sendBtn) sendBtn.disabled = !enabled;
}

// ── Model lifecycle ────────────────────────────────────────────────────────

/**
 * Dynamically imports WebLLM from CDN and initialises the engine.
 * Reports progress via the status bar.
 */
async function initEngine() {
  setStatus("Importing WebLLM…", "loading");
  setInputEnabled(false);

  const modelId = isMobileDevice() ? MOBILE_MODEL : DEFAULT_MODEL;

  try {
    const webllm = await import(WEBLLM_CDN);

    setStatus("Downloading model (first visit may take a few minutes)…", "loading");

    engine = await webllm.CreateMLCEngine(modelId, {
      initProgressCallback: (report) => {
        const pct = Math.round((report.progress || 0) * 100);
        setStatus(`Loading model… ${pct}%`, "loading");
      },
    });

    chatHistory = [{ role: "system", content: buildSystemPrompt() }];

    setStatus("AI ready — ask me anything about " + PROFILE.name + "!", "ready");
    setInputEnabled(true);
  } catch (err) {
    console.error("WebLLM init error:", err);
    const msg =
      err.message && err.message.includes("WebGPU")
        ? "WebGPU not supported in this browser. Try Chrome 113+ on a desktop."
        : `Failed to load model: ${err.message}`;
    setStatus(msg, "error");
  }
}

// ── Chat ───────────────────────────────────────────────────────────────────

/**
 * Sends the user's message and streams the assistant reply.
 * @param {string} userText
 */
async function sendMessage(userText) {
  if (!userText.trim() || !engine || isGenerating) return;

  isGenerating = true;
  setInputEnabled(false);

  chatHistory.push({ role: "user", content: userText });
  appendMessage("user", userText);

  const assistantBubble = appendMessage("assistant", "…");
  setStatus("Generating…", "generating");

  try {
    let fullResponse = "";

    const stream = await engine.chat.completions.create({
      messages: chatHistory,
      stream: true,
      temperature: 0.7,
      max_tokens: 512,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      fullResponse += delta;
      assistantBubble.textContent = fullResponse;

      // auto-scroll
      const chatMessages = document.getElementById("chat-messages");
      if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    chatHistory.push({ role: "assistant", content: fullResponse });
    setStatus("AI ready — ask me anything about " + PROFILE.name + "!", "ready");
  } catch (err) {
    console.error("Chat error:", err);
    assistantBubble.textContent = "Sorry, something went wrong. Please try again.";
    setStatus("Error during generation.", "error");
  } finally {
    isGenerating = false;
    setInputEnabled(true);
    document.getElementById("chat-input")?.focus();
  }
}

// ── Event wiring ───────────────────────────────────────────────────────────

/**
 * Wires up the send button and Enter-key handler.
 * Call this once the DOM is ready.
 */
function initChatUI() {
  const input = document.getElementById("chat-input");
  const sendBtn = document.getElementById("send-btn");
  const clearBtn = document.getElementById("clear-btn");

  if (sendBtn) {
    sendBtn.addEventListener("click", () => {
      const text = input.value.trim();
      if (text) {
        input.value = "";
        sendMessage(text);
      }
    });
  }

  if (input) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const text = input.value.trim();
        if (text) {
          input.value = "";
          sendMessage(text);
        }
      }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      const chatMessages = document.getElementById("chat-messages");
      if (chatMessages) chatMessages.innerHTML = "";
      chatHistory = [{ role: "system", content: buildSystemPrompt() }];
    });
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    appendMessage,
    setStatus,
    setInputEnabled,
    isMobileDevice,
    buildSystemPromptForChat: () => buildSystemPrompt(),
  };
}
