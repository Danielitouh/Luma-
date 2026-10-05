# Codex pet and agent

This ZIP preserves Codex from Luma as source components and assets. It contains no running site or app. The agent starts asleep; opening or extracting the archive does not activate it.

For Codex: upload this ZIP to a coding session, or extract its folder into a repository that Codex can access. No original Luma deployment is needed to read or reuse the code.

## Contents

- `components/luma-pet.tsx`: pet rendering, centered pixel eyes, all expression frames, animation timing, mobile keyboard behavior, and thought-bubble controls.
- `public/pet/luma-companion.png`: the exact production animation image. The blank face is intentional: the component draws and animates the eyes over it.
- `pet-animations.css`: all pet movement, limb, expression placement, thought-bubble, mobile, dark-theme, and reduced-motion styles.
- `agent-interface.css`: the animated Codex menu button and AI connection interface styles.
- `lib/luma-agent.ts`: dormant agent, simulated emotions, reflection, conversation state, cancellation, and page planning.
- `lib/codex-page.ts` and `lib/page-initiative.ts`: plan parsing, page edits, and bounded self-directed work.
- `integration/page-agent.tsx.fragment`: exact callbacks and relevant declarations/JSX extracted from the old editor, including page-only commits, duplicate-request protection, waking, sleeping, undo, provider wiring, and the Codex button. This is a source fragment, not an independent React component.
- `components/ai-connection.tsx`, `components/puter-ai.tsx`, related `lib`, `db`, and `app/api/ai` files: Puter and personal OpenAI connection implementations, encrypted key handling, and server routes.
- `tests`: the existing agent, initiative, provider, session, and server-route tests. They use mocks and do not call a live AI.
- `artwork`: original high-resolution pet artwork and animation references.
- `history/index.json` and `history/blobs`: deduplicated earlier pet/agent revisions and their dependencies. The top-level files are the latest version.
- `reference`: original dependency manifest and lockfile, theme tokens, runtime types, and source-excerpt locations.
- `PRESERVATION.json` and `SHA256SUMS`: source inventory and file-integrity checks.

## Integration contracts

The pet is a React component with no automatic model request. Its props supply the current page title, work status, feedback, undo availability, and callbacks for freedom, pause, undo, and settings. It reads the exported `lumaAgent` state for its expressions. It expects the image at `/pet/luma-companion.png` and `pet-animations.css` to be loaded.

The preserved editor callbacks originally lived inside a React component. Their host provides `data`/`setData`, `current.current` (the current workspace), `loaded`, `view`/`pageId`, `mutate`, and AI menu state. `prepareAI` also references the former editor's ordinary `runAI` handler; only its Codex branch is agent behavior. These names and relationships are retained rather than silently changing the original behavior.

The host commit callback checks that the active page still matches the saved snapshot before writing. Undo restores only the unchanged result of that operation. Moving away from the page or choosing sleep cancels further work. A session performs at most three page-local passes. No background service, schedule, or autonomous entry point is included.

The optional AI settings controls use Tailwind/Radix UI components. Original theme tokens are in `reference/theme-tokens.css`; `--brand` and the Codex color variables came from the host's selected accent. Dark pet styles use `data-luma-theme="dark"`.

The OpenAI routes retain their original Cloudflare D1 and trusted authenticated-user-header contract. They need a new host's authentication adapter, database binding, and encryption secret before use. Puter uses its browser SDK. No API keys, saved sign-ins, runtime secrets, private pages, or site access credentials are included.

`lib/workspace.ts` and database support files remain because agent code imports their original types/contracts. They are source dependencies, not an exported personal workspace or a retained website.

## Local checks

With Node 24 or newer, install the package dependencies and run `npm test`. This checks the preserved logic with mocks. The package has no `dev`, `start`, or deployment command.

`SHA256SUMS` covers every other file in this directory, including historical blobs and source art. `PRESERVATION.json` records which top-level files match the original source byte for byte.
