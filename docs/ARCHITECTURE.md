# Architecture — initial decisions

## Product boundaries

Editor Offline is an original desktop application, not a distribution of VS Code. Its editor core is developed in this repository. Third-party tools may be integrated behind standard protocols where reimplementing compilers, parsers, or debuggers would add no product value.

## Current layers

1. **Desktop host — Tauri 2 / Rust**
   - Owns native dialogs and local filesystem operations, including safe create, rename, and delete operations.
   - Exposes a small command surface to the UI.
   - Does not send project content to a server.
2. **Workbench — React / TypeScript**
   - Owns layout, tabs, panels, commands, and view state.
   - Uses Hebrew for workbench chrome and LTR direction for source text.
3. **Editor core — TypeScript modules**
   - Uses an independently implemented transactional text buffer with bounded per-tab undo/redo history.
   - Maintains line-start indexes and maps UTF-16 offsets to line/column positions for the UI.
   - Applies range edits and incrementally updates line indexes rather than storing a full document snapshot per keystroke.
   - Remains separate from the React view.
   - The current input adapter is a native textarea layered under a project-owned syntax renderer.
   - Syntax spans and line numbers are virtualized to a visible viewport with overscan; tokenization still scans the full document.
   - A fully custom cursor/selection renderer, multi-cursor model, incremental tokenization, and large-file benchmarks remain planned work.
4. **Language and tooling adapters — planned**
   - LSP for language intelligence.
   - DAP for debugging.
   - A first local command runner executes user-entered shell commands in the workspace; interactive PTY sessions and configurable tasks remain planned.
5. **Local AI — planned**
   - Provider interface for local runtimes such as Ollama and llama.cpp-compatible endpoints.
   - Explicit approval before applying edits or running commands.
   - No cloud provider is required for normal operation.

## Non-goals

- Do not embed Monaco or CodeMirror as the primary editor.
- Do not fork or repackage Code-OSS.
- Do not implement compilers, language servers, or debuggers from scratch when open protocols and established local tools are available.
- Do not add telemetry, mandatory sign-in, or cloud-only features.

## Milestone order

- **0.1 Workbench:** Windows shell, local file operations, workspace tree, tabs, editing, save, find/replace, keyboard commands, CI.
- **0.2 Editor core:** replace the textarea adapter with a custom cursor/selection renderer, multi-cursor foundations, line virtualization, grammar-aware syntax highlighting, and large-file performance work.
- **0.3 Developer workflow:** integrated terminal, tasks, diagnostics, formatting, Git status and diff.
- **0.4 Language services:** configurable LSP adapters and project-level language detection.
- **0.5 Local AI:** local provider settings, project context index, read-only review, diff preview, user-approved application.
- **1.0 Release:** installer/portable packaging, recovery, accessibility, performance and security audits.

Milestones may be reordered when Windows integration or tests reveal a dependency.
