# Architecture — initial decisions

## Product boundaries

Editor Offline is an original desktop application, not a distribution of VS Code. Its editor core is developed in this repository. Third-party tools may be integrated behind standard protocols where reimplementing compilers, parsers, or debuggers would add no product value.

## Current layers

1. **Desktop host — Tauri 2 / Rust**
   - Owns native dialogs and local filesystem operations, including safe create, rename, delete, and bounded project-search operations.
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
   - A tested multi-selection engine now supports normalized selections, vertical cursor creation, next-occurrence selection, multi-range edits, paired-bracket backspace, and undo/redo through the transactional buffer. The current textarea adapter still displays only its native primary caret; the custom renderer and full visual multi-cursor integration remain the next editor-core milestone.
4. **Language and tooling adapters — planned**
   - LSP for language intelligence.
   - DAP for debugging.
   - A first local command runner executes user-entered shell commands in the workspace; interactive PTY sessions and configurable tasks remain planned.
5. **Local AI — OpenAI-compatible adapter implemented**
   - Read-only chat through configurable OpenAI Chat Completions and Anthropic Messages endpoints, with model discovery through /v1/models where available.
   - Presets for Ollama, LM Studio, llama.cpp server, LocalAI, Jan, vLLM, text-generation-webui, and KoboldCpp, plus custom loopback endpoints.
   - The Rust backend rejects non-loopback hosts; provider, endpoint, model, and protocol preferences are stored locally; optional API keys are passed only to the validated local endpoint using the protocol-specific header and are not persisted.
   - Optional active-file context is sent only to the selected local server.
   - The assistant cannot edit files or run commands; native adapters for proprietary protocols and approved diff application remain planned.
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


The editor sends inference requests only to loopback. A local runtime may still be configured to proxy requests to remote services, so strict offline use also depends on the selected model and runtime configuration.
