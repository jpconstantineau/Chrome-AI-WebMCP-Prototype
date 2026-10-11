# Design

Keep the visual design intentionally simple, flexible, and prototype-friendly. This app should feel like a clean browser control panel rather than a polished consumer application.

Requirements:
- Use a minimal single-page layout with a top bar, a prompt editor panel, and a results/output panel.
- Favor clear card sections and enough spacing to keep the UI readable on both desktop and mobile.
- Maintain a restrained neutral palette with a single accent color for actions and status states.
- Support both light and dark themes using CSS variables, with the dark theme tuned for comfortable night viewing.
- Keep the interface adaptable so the maintainer can later refine typography, layout density, and branding without rewriting the app structure.
- Emphasize browser-native behavior and plain HTML/CSS/JS so the prototype remains easy to run locally and on GitHub Pages.

The goal is to keep the app minimal enough for experimentation with local AI and WebMCP workflows while still presenting a clear, usable interface for testing ideas.
