# Editor Offline

**A lightweight, independent, offline-first IDE for Windows 11.**

Editor Offline is being built from scratch around an original editing engine. It is not a fork of VS Code and does not embed Monaco. The goal is a fast, understandable development environment that keeps projects, tools, and AI assistance on the user's machine.

> Status: early development — the first usable Windows workbench is under construction.

## Milestone 0.1

- [x] Tauri 2 desktop shell for Windows
- [x] Hebrew-first workbench with an LTR code-editing surface
- [x] Open files and folders, browse a workspace, edit and save text files
- [x] Tabs, dirty-state indicators, keyboard shortcuts, find/replace
- [x] Independent text-buffer module with bounded undo/redo and unit tests
- [x] Windows CI for TypeScript, frontend build, Rust checks, and tests
- [ ] Verify MSI/NSIS installers on a Windows machine
- [ ] Syntax highlighting and language-aware editing
- [ ] Integrated terminal and task runner
- [ ] Local AI provider adapters

## Technology

- **Desktop:** Tauri 2 + Rust
- **UI:** React + TypeScript + Vite
- **Editor core:** original TypeScript text-buffer implementation; no Monaco or CodeMirror
- **Native operations:** Rust commands for local file and directory access
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

The installer targets are configured for **MSI** and **NSIS**.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| Ctrl+N | New file |
| Ctrl+O | Open file |
| Ctrl+Shift+O | Open folder |
| Ctrl+S | Save |
| Ctrl+F | Find |
| Ctrl+H | Find and replace |
| Ctrl+Shift+P | Command palette |
| Ctrl+Z / Ctrl+Y | Undo / redo |

## Principles

1. Offline by default: no account, telemetry, or required cloud service.
2. Local-first: project files and future AI models stay on the device.
3. Real functionality before decorative controls.
4. Small, testable modules and explicit boundaries between UI and native operations.
5. Use open protocols such as LSP and DAP instead of rewriting compilers and debuggers.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## License

MIT. See [LICENSE](LICENSE).
