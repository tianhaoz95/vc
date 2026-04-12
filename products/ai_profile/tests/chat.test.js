/**
 * Tests for chat.js helper functions.
 *
 * chat.js is designed to run in the browser and has DOM dependencies, so we
 * mock the DOM elements it touches and load the module in a JSDOM-like
 * fashion by requiring it after setting up the necessary globals.
 */

// ── Mocked globals that chat.js expects ────────────────────────────────────

const mockBubble = { textContent: "" };
const mockMessages = {
  appendChild: jest.fn(),
  scrollTop: 0,
  scrollHeight: 500,
  innerHTML: "",
};
const mockInput = { disabled: true, value: "", focus: jest.fn() };
const mockSendBtn = { disabled: true };
const mockStatusBar = { textContent: "", className: "" };

global.document = {
  getElementById: jest.fn((id) => {
    switch (id) {
      case "chat-messages": return mockMessages;
      case "chat-input": return mockInput;
      case "send-btn": return mockSendBtn;
      case "model-status": return mockStatusBar;
      default: return null;
    }
  }),
  createElement: jest.fn((tag) => {
    const el = { className: "", textContent: "", appendChild: jest.fn(), children: [] };
    return el;
  }),
};

global.PROFILE = { name: "Test Developer" };
global.buildSystemPrompt = () => "You are a test assistant.";

// ── Load the module under test ─────────────────────────────────────────────

const chat = require("../src/chat");

// ── Tests ──────────────────────────────────────────────────────────────────

describe("setStatus()", () => {
  beforeEach(() => {
    mockStatusBar.textContent = "";
    mockStatusBar.className = "";
  });

  test("updates the status bar text", () => {
    chat.setStatus("Loading model… 50%", "loading");
    expect(mockStatusBar.textContent).toBe("Loading model… 50%");
  });

  test("sets the correct CSS class for loading state", () => {
    chat.setStatus("Loading…", "loading");
    expect(mockStatusBar.className).toBe("model-status model-status-loading");
  });

  test("sets the correct CSS class for ready state", () => {
    chat.setStatus("Ready", "ready");
    expect(mockStatusBar.className).toBe("model-status model-status-ready");
  });

  test("sets the correct CSS class for error state", () => {
    chat.setStatus("Error!", "error");
    expect(mockStatusBar.className).toBe("model-status model-status-error");
  });

  test("sets the correct CSS class for generating state", () => {
    chat.setStatus("Generating…", "generating");
    expect(mockStatusBar.className).toBe("model-status model-status-generating");
  });

  test("defaults to loading state when no state provided", () => {
    chat.setStatus("Doing something");
    expect(mockStatusBar.className).toBe("model-status model-status-loading");
  });
});

describe("setInputEnabled()", () => {
  test("enables both input and send button", () => {
    chat.setInputEnabled(true);
    expect(mockInput.disabled).toBe(false);
    expect(mockSendBtn.disabled).toBe(false);
  });

  test("disables both input and send button", () => {
    chat.setInputEnabled(false);
    expect(mockInput.disabled).toBe(true);
    expect(mockSendBtn.disabled).toBe(true);
  });
});

describe("appendMessage()", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMessages.scrollTop = 0;
  });

  test("appends a message wrapper to chat-messages", () => {
    chat.appendMessage("user", "Hello!");
    expect(mockMessages.appendChild).toHaveBeenCalled();
  });

  test("scrolls the message list to the bottom", () => {
    chat.appendMessage("assistant", "Hi there!");
    expect(mockMessages.scrollTop).toBe(mockMessages.scrollHeight);
  });

  test("returns a bubble element", () => {
    const result = chat.appendMessage("assistant", "Test");
    expect(result).toBeDefined();
  });
});
