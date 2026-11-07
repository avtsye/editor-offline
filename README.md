# Editor Offline

**A lightweight, independent, offline-first IDE for Windows 11.**

Editor Offline is being built from scratch around an original editing engine. It is not a fork of VS Code and does not embed Monaco. The goal is a fast, understandable development environment that keeps projects, tools, and AI assistance on the user's machine.

> Status: early development — the first usable Windows workbench is under construction.

## Milestone 0.1

- [x] Tauri 2 desktop shell for Windows
- [x] Hebrew-first workbench with an LTR code-editing surface
- [x] Open files and folders, browse a workspace, edit and save text files
- [x] Create files and folders directly in the selected workspace directory
- [x] Rename workspace files and folders from the explorer context menu
- [x] Delete files and empty folders with confirmation and unsaved-tab checks
- [x] Local workspace command runner with bounded output and asynchronous execution
- [x] Tabs, dirty-state indicators, keyboard shortcuts, find/replace
- [x] Independent transactional text buffer with per-tab undo/redo and unit tests
- [x] Line/column mapping, CRLF handling, and incremental line indexing
- [x] Indentation, paired brackets, find-next/previous, and replace operations
- [x] In-house syntax tokenization and layered highlighting for common source formats
- [x] Virtualized syntax and line-number viewport with overscan for long files
- [x] Project-wide text search with line-number navigation and bounded traversal
- [x] Windows CI for TypeScript, frontend build, Rust checks, tests, and installer artifacts
- [ ] Verify MSI/NSIS installers on a Windows machine
- [ ] Replace the initial textarea input adapter with the custom virtualized editor surface
- [ ] Grammar-aware parsing, semantic highlighting, and language-aware editing
- [ ] Interactive PTY terminal and configurable task runner
- [x] Read-only local AI chat through OpenAI-compatible local APIs, with optional active-file context
- [ ] Approved AI diff application, streaming responses, and native adapters for non-OpenAI local protocols

## Technology

- **Desktop:** Tauri 2 + Rust
- **UI:** React + TypeScript + Vite
- **Editor core:** original TypeScript text-buffer implementation; no Monaco or CodeMirror
- **Native operations:** Rust commands for local file and directory access
- **Local AI:** configurable OpenAI-compatible API over loopback only; presets for Ollama, LM Studio, llama.cpp, LocalAI, Jan, vLLM, text-generation-webui, and KoboldCpp; custom local endpoint and optional in-memory bearer token; no cloud endpoint
- **Tests:** Vitest and Windows CI

## Development

Requirements: Windows 11, Node.js 22+, and the stable Rust toolchain with the MSVC target. Tauri's Windows prerequisites (Microsoft C++ Build Tools and WebView2 Runtime) are also required.

```powershell
npm install
npm run tauri dev
```

Run frontend checks:

```powershell
npm run check
npm test -- --run
npm run build
```

Build Windows installers:

```powershell
npm run tauri build
```

The installer targets are configured for **MSI** and **NSIS**. Successful CI builds upload both installers as the `editor-offline-windows-0.1.0` workflow artifact.

The current editing surface is an intentionally small native textarea adapter backed by the project-owned text buffer. It is not Monaco or CodeMirror; the custom renderer, viewport virtualization, and richer cursor/selection layer are a later editor-core milestone.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| Ctrl+N | New file |
| Ctrl+O | Open file |
| Ctrl+Shift+O | Open folder |
| Ctrl+S | Save |
| Ctrl+F | Find |
| Ctrl+H | Find and replace |
| F3 / Shift+F3 | Next / previous match |
| Ctrl+G | Go to line |
| Ctrl+Shift+F | Search the workspace |
| Ctrl+Shift+P | Command palette |
| Ctrl+` | Toggle command runner |
| Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z | Undo / redo |

## Principles

1. Offline by default: no account, telemetry, or required cloud service.
2. Local-first: project files and future AI models stay on the device.
3. Real functionality before decorative controls.
4. Small, testable modules and explicit boundaries between UI and native operations.
5. Use open protocols such as LSP and DAP instead of rewriting compilers and debuggers.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## License

MIT. See [LICENSE](LICENSE).


## Local model servers

The AI panel speaks the standard OpenAI-compatible /v1/models and /v1/chat/completions endpoints. Presets are provided for Ollama, LM Studio, llama.cpp server, LocalAI, Jan, and vLLM; other local servers can be added with a custom base URL when they implement the same protocol. Use a base URL such as http://127.0.0.1:1234/v1, not the full chat-completions URL.

For privacy, the native backend accepts only localhost, 127.0.0.1, and ::1 hosts; LAN and public hosts are rejected. Provider, base URL, and model selection are saved locally; an optional bearer token is held in application memory for the current session and is not saved. Providers with proprietary APIs (for example, non-OpenAI-compatible endpoints) still need a dedicated adapter.
