# Chrome AI WebMCP Prototype

This repository contains a small static PWA prototype that explores browser-local AI and WebMCP patterns in Chrome. It is designed to run without a custom backend and can be deployed to GitHub Pages.

## Included

- Vanilla HTML, CSS, and JavaScript
- Service worker for PWA installability
- Manifest for standalone app experience
- IndexedDB-based local storage for app data
- Local preference storage and minimal UI state persistence
- Chrome Prompt API detection with graceful fallback behavior
- WebMCP-style browser action stubs for page interaction

## Local development

Open `index.html` directly in a browser, or serve the folder from a local static server:

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## GitHub Pages

A GitHub Actions workflow is included in `.github/workflows/pages.yml` for simple static deployment to GitHub Pages.

Expected deployment URL:

https://jpconstantineau.github.io/Chrome-AI-WebMCP-Prototype/

## Guidance files

- `agents.md` – agent instructions
- `intent.md` – product intent and prototype goals
- `design.md` – minimal UI guidance
