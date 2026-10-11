const DB_NAME = 'chrome-ai-webmcp-prototype';
const DB_VERSION = 1;
const STORE_NAMES = {
  preferences: 'preferences',
  history: 'history'
};

const state = {
  db: null,
  theme: 'light'
};

const elements = {
  themeToggle: document.getElementById('themeToggle'),
  promptInput: document.getElementById('promptInput'),
  modelPreference: document.getElementById('modelPreference'),
  runPromptBtn: document.getElementById('runPromptBtn'),
  highlightBtn: document.getElementById('highlightBtn'),
  savePrefsBtn: document.getElementById('savePrefsBtn'),
  clearHistoryBtn: document.getElementById('clearHistoryBtn'),
  highlightSelectorInput: document.getElementById('highlightSelectorInput'),
  status: document.getElementById('status'),
  responseOutput: document.getElementById('responseOutput'),
  aiStatus: document.getElementById('aiStatus')
};

function setStatus(message, isReady = false) {
  elements.status.textContent = message;
  elements.status.style.color = isReady ? '#10b981' : 'var(--muted)';
}

function setAiStatus(text, stateName = 'neutral') {
  elements.aiStatus.textContent = text;
  elements.aiStatus.className = `chip ${stateName}`;
}

function applyTheme(themeName) {
  const isDark = themeName === 'dark';
  document.body.classList.toggle('dark', isDark);
  state.theme = themeName;
  elements.themeToggle.textContent = isDark ? 'Light mode' : 'Dark mode';
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB is not supported in this browser.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(STORE_NAMES.preferences)) {
        db.createObjectStore(STORE_NAMES.preferences, { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains(STORE_NAMES.history)) {
        db.createObjectStore(STORE_NAMES.history, { keyPath: 'id', autoIncrement: true });
      }
    };

    request.onsuccess = () => {
      state.db = request.result;
      resolve(request.result);
    };

    request.onerror = () => reject(request.error);
  });
}

function readFromStore(storeName, key = null) {
  return new Promise((resolve, reject) => {
    if (!state.db) {
      reject(new Error('Database is not ready.'));
      return;
    }

    const transaction = state.db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = key === null ? store.getAll() : store.get(key);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function writeToStore(storeName, value) {
  return new Promise((resolve, reject) => {
    if (!state.db) {
      reject(new Error('Database is not ready.'));
      return;
    }

    const transaction = state.db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.put(value);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function clearStore(storeName) {
  return new Promise((resolve, reject) => {
    if (!state.db) {
      reject(new Error('Database is not ready.'));
      return;
    }

    const transaction = state.db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function loadPreferences() {
  const directPrefs = JSON.parse(localStorage.getItem('chrome-ai-webmcp-preferences') || '{}');

  try {
    const savedPreferences = await readFromStore(STORE_NAMES.preferences, 'settings');
    const merged = { ...directPrefs, ...(savedPreferences || {}) };

    if (merged.theme) {
      applyTheme(merged.theme);
    }

    if (merged.modelPreference) {
      elements.modelPreference.value = merged.modelPreference;
    }

    if (merged.promptInput) {
      elements.promptInput.value = merged.promptInput;
    }

    if (merged.highlightSelectorInput) {
      elements.highlightSelectorInput.value = merged.highlightSelectorInput;
    }

    return merged;
  } catch (error) {
    if (directPrefs.theme) {
      applyTheme(directPrefs.theme);
    }
    if (directPrefs.modelPreference) {
      elements.modelPreference.value = directPrefs.modelPreference;
    }
    if (directPrefs.promptInput) {
      elements.promptInput.value = directPrefs.promptInput;
    }
    if (directPrefs.highlightSelectorInput) {
      elements.highlightSelectorInput.value = directPrefs.highlightSelectorInput;
    }
    return directPrefs;
  }
}

async function savePreferences() {
  const preferences = {
    id: 'settings',
    theme: state.theme,
    modelPreference: elements.modelPreference.value,
    promptInput: elements.promptInput.value,
    highlightSelectorInput: elements.highlightSelectorInput.value
  };

  try {
    localStorage.setItem('chrome-ai-webmcp-preferences', JSON.stringify(preferences));
    await writeToStore(STORE_NAMES.preferences, preferences);
    setStatus('Preferences saved locally.', true);
  } catch (error) {
    setStatus(`Unable to save preferences: ${error.message || 'unknown storage error'}`);
  }
}

async function loadHistory() {
  try {
    const history = await readFromStore(STORE_NAMES.history);
    return Array.isArray(history) ? history : [];
  } catch (error) {
    return [];
  }
}

async function appendHistory(prompt, response) {
  const entry = {
    prompt,
    response,
    createdAt: new Date().toISOString()
  };

  await writeToStore(STORE_NAMES.history, entry);
}

function detectPromptApi() {
  const candidates = [
    navigator.languageModel,
    window.ai
  ];
  const supported = candidates.find(Boolean);
  return supported || null;
}

async function invokePromptApi(promptText) {
  const promptApi = detectPromptApi();

  if (!promptApi) {
    return {
      ok: false,
      message: 'The Chrome Prompt API is not available in this browser or in an insecure context.'
    };
  }

  try {
    const sessionFactory = promptApi.create || promptApi.createTextSession || promptApi.createSession;

    if (typeof sessionFactory === 'function') {
      const session = await sessionFactory.call(promptApi, { systemPrompt: 'You are a local AI assistant helping test a WebMCP prototype in Chrome.' });
      if (session && typeof session.prompt === 'function') {
        const result = await session.prompt(promptText);
        return { ok: true, message: result?.text || result || 'Prompt completed successfully.' };
      }
    }

    if (typeof promptApi.prompt === 'function') {
      const result = await promptApi.prompt(promptText);
      return { ok: true, message: result?.text || result || 'Prompt completed successfully.' };
    }

    if (typeof promptApi.generateText === 'function') {
      const result = await promptApi.generateText(promptText);
      return { ok: true, message: result?.text || result || 'Prompt completed successfully.' };
    }
  } catch (error) {
    return {
      ok: false,
      message: `Prompt API call failed: ${error.message || 'Unknown error'}`
    };
  }

  return {
    ok: false,
    message: 'The browser exposes an AI object but not the Prompt API shape expected by this prototype.'
  };
}

async function readPageSelection() {
  if (!window.getSelection) {
    return '';
  }

  const selection = window.getSelection();
  return selection && selection.toString ? selection.toString().trim() : '';
}

async function runWebMCPAction(toolName, args = {}) {
  const webMcp = window.WebMCP || window.webMCP || window.webmcp;

  if (webMcp && typeof webMcp.execute === 'function') {
    return webMcp.execute(toolName, args);
  }

  const actions = {
    summarizePage: async () => {
      const selection = await readPageSelection();
      const bodyText = document.body.innerText || document.body.textContent || '';
      return `Page title: ${document.title}\nRelevant text length: ${bodyText.length}\nSelection: ${selection || 'No selection'}\nRequested action: ${args.prompt || 'Summarize the page.'}`;
    },
    highlightSelector: async () => {
      const selector = args.selector || 'body';
      const target = document.querySelector(selector) || document.body;
      const previousOutline = target.style.outline;
      const previousOutlineOffset = target.style.outlineOffset;
      target.style.outline = '3px solid #10b981';
      target.style.outlineOffset = '4px';
      setTimeout(() => {
        target.style.outline = previousOutline;
        target.style.outlineOffset = previousOutlineOffset;
      }, 1600);
      return `Highlighted ${selector}.`;
    },
    readSelection: async () => {
      const selection = await readPageSelection();
      return selection || 'No text selected on the page.';
    }
  };

  if (actions[toolName]) {
    return actions[toolName]();
  }

  throw new Error(`Unknown tool: ${toolName}`);
}

async function handlePromptSubmission() {
  const prompt = elements.promptInput.value.trim();
  if (!prompt) {
    setStatus('Enter a prompt before running the action.');
    return;
  }

  setStatus('Running prompt…');
  elements.responseOutput.textContent = 'Working…';

  const selectedModel = elements.modelPreference.value;
  const promptResult = selectedModel === 'demo'
    ? { ok: true, message: `Demo mode: I checked the document and your request was: “${prompt}”` }
    : await invokePromptApi(prompt);

  let assistantOutput = promptResult.message;

  if (promptResult.ok && selectedModel !== 'demo') {
    try {
      const toolOutput = await runWebMCPAction('summarizePage', { prompt, selection: await readPageSelection() });
      assistantOutput = `${promptResult.message}\n\nWebMCP result:\n${toolOutput}`;
    } catch (error) {
      assistantOutput = `${promptResult.message}\n\nWebMCP fallback: ${error.message}`;
    }
  }

  elements.responseOutput.textContent = assistantOutput;
  await appendHistory(prompt, assistantOutput);
  setStatus('Prompt completed successfully.', true);
}

async function handleHighlightAction() {
  const selector = (elements.highlightSelectorInput.value || 'body').trim();
  try {
    const result = await runWebMCPAction('highlightSelector', { selector: selector || 'body' });
    elements.responseOutput.textContent = result;
    setStatus('Highlight action executed.', true);
  } catch (error) {
    elements.responseOutput.textContent = `Highlight failed: ${error.message}`;
    setStatus('Highlight action failed.');
  }
}

async function clearHistory() {
  await clearStore(STORE_NAMES.history);
  elements.responseOutput.textContent = 'Stored history has been cleared.';
  setStatus('History cleared.', true);
}

async function initialize() {
  try {
    await openDatabase();
  } catch (error) {
    console.warn('IndexedDB unavailable, continuing in degraded mode:', error);
    setStatus('IndexedDB unavailable; app will use localStorage only.');
  }

  const prefs = await loadPreferences();

  const promptApi = detectPromptApi();
  if (promptApi) {
    setAiStatus('Prompt API ready', 'ready');
  } else {
    setAiStatus('Prompt API unavailable', 'neutral');
  }

  if (!prefs.theme) {
    applyTheme('light');
  }

  elements.themeToggle.addEventListener('click', () => {
    const nextTheme = state.theme === 'light' ? 'dark' : 'light';
    applyTheme(nextTheme);
    savePreferences();
  });

  elements.runPromptBtn.addEventListener('click', handlePromptSubmission);
  elements.highlightBtn.addEventListener('click', handleHighlightAction);
  elements.savePrefsBtn.addEventListener('click', savePreferences);
  elements.clearHistoryBtn.addEventListener('click', clearHistory);

  const history = await loadHistory();
  if (history.length > 0) {
    const last = history[history.length - 1];
    elements.responseOutput.textContent = `Most recent saved interaction:\n\n${last.response}`;
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch((error) => {
      console.warn('Service worker registration failed:', error);
    });
  }
}

initialize().catch((error) => {
  console.error('Initialization failed:', error);
  setStatus('The application could not initialize. Check browser support.');
  setAiStatus('Prototype unavailable', 'neutral');
});
