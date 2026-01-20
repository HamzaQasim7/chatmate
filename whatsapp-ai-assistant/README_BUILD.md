# Reple - Source Code Build Instructions

## Environment Requirements
- **OS:** Windows, macOS, or Linux (Built on Windows 11)
- **Node.js:** v18.x or higher
- **NPM:** v9.x or higher

## Build Steps
1.  Unzip this source code archive.
2.  Open a terminal in the root directory.
3.  Install dependencies:
    ```bash
    npm install
    ```
4.  Build for Firefox:
    ```bash
    npm run build:firefox
    ```

## Output
The built extension will be located in the `.output/firefox-mv2` directory.

## Notes
- This project uses **WXT** (Web Extension Framework) + **React** + **Vite**.
- The `wxt.config.ts` handles the build configuration and manifest generation.
- Source code is in `entrypoints/`, `components/`, and `lib/`.
