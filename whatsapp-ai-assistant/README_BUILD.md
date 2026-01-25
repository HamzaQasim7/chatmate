# Reple - Source Code Build Instructions

## Overview
This is the source code for the **Reple** Firefox extension. Use these instructions to build the extension from source.

## Environment Requirements
- **Operating System:** Windows, macOS, or Linux (Verified on Windows 11)
- **Node.js:** v18.18.0 or higher (Verified with v20.x)
- **NPM:** v9.x or higher

## Build Steps

### 1. Extract Source Code
Unzip the provided source code archive (`source-code.zip`) to a clean directory.

### 2. Install Dependencies
Open a terminal in the root directory where `package.json` is located and run:
```bash
npm install
```
This will install all necessary build dependencies defined in `package.json` and `package-lock.json`.

### 3. Build the Extension
To build the extension specifically for Firefox (Manifest V2), run:
```bash
npm run build:firefox
```
This command uses `wxt` (Web Extension Framework) to bundle the application.

## Output
Upon successful completion, the build artifacts will be generated in:
`./.output/firefox-mv2/`

- **Loadable Extension:** The content of this directory can be loaded into Firefox via `about:debugging` -> "This Firefox" -> "Load Temporary Add-on...".
- **Manifest:** `manifest.json` is generated in this directory.

## Project Structure
- `entrypoints/`: specific entry points for the extension (background scripts, content scripts, popup).
- `lib/`: Shared utilities and logic.
- `components/`: React components.
- `public/`: Static assets.
- `wxt.config.ts`: Configuration file for the WXT build tool.
