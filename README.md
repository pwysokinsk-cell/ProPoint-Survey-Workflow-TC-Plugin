# Survey Workflow Tracker

A starter React + TypeScript app for tracking Trimble Connect surveying workflows.

## What it includes

- Building element status workflow
- Operator assignment on each update
- History timeline for every change
- Notes attached to each task update
- Local persistence for the starter prototype
- Trimble Connect Workspace API integration shell

## Status flow

Data Prepared -> Data Updated -> Assignment: Stake out -> Staked out -> Assignment: GMK -> Geometrical Control -> Assignment: SMB -> As-built performed -> Documentation Closed

## Trimble integration

The app now targets the current `trimble-connect-workspace-api` package.
It connects to Trimble Connect Web when embedded there and falls back to a local development mode outside Trimble.

The example manifest for a Trimble extension is in [trimble-extension-manifest.example.json](trimble-extension-manifest.example.json).

## Local development

This workspace is scaffolded as a Vite app, but Node.js is not available in the current terminal environment.
To run it locally, install Node.js 20+ and then use:

```bash
npm install
npm run dev
```

## Next steps

1. Replace the local prototype state with Trimble Connect data.
2. Add backend persistence for history and audit data.
3. Connect authentication to your actual operator list.
4. Host the extension manifest and app URL on a CORS-enabled endpoint for Trimble Connect Web.
