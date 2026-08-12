# Copilot Instructions

- This workspace is a React + TypeScript starter for a Trimble Connect surveying workflow tool.
- Target the current `trimble-connect-workspace-api` package, not the legacy project workspace API.
- Keep element updates immutable so current status and history stay in sync.
- Store workflow status keys in `src/types.ts` and use labels only for display.
- Preserve history on every status change, including operator name, timestamp, and note.
- Keep the UI concise and field-friendly rather than generic dashboard boilerplate.
- If backend work is added later, keep validation for allowed transitions server-side as well.
- Use ASCII-only source text unless a file already requires special characters.
- Node.js is required to run the Vite app locally; the current terminal session does not have `node` or `npm` available.
