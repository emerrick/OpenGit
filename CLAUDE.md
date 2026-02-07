# OpenGit - CLAUDE.md

## Project Vision

OpenGit is a fork of GitHub Desktop that strips all GitHub-specific functionality to create a **universal, open-source Git GUI client** for Windows (10/11). The goal is a clean, fast desktop Git client that works with **any** Git remote (Gitea, GitLab, Bitbucket, self-hosted, etc.) without requiring a GitHub account.

**Target platforms**: Windows 10 and Windows 11 (Squirrel.Windows updater, Git Credential Manager for Windows, PowerShell/CMD shell integration).

## Build & Test Commands

```bash
yarn                    # Install dependencies
yarn build:dev          # Full dev build (compile + package)
yarn compile:dev        # Compile only (faster)
yarn start              # Start in development mode
yarn test               # Run all tests
yarn test:unit          # Run unit tests only
npx tsc --noEmit        # TypeScript type-check (no output)
yarn lint               # Run linter
```

## Architecture Overview

This is an **Electron + React + TypeScript** application.

### Directory Structure

```
app/
  src/
    cli/              # Command-line interface entry point
    lib/              # Core business logic
      api.ts          # GitHub API client (TO BE HOLLOWED Phase 1)
      http.ts         # HTTP utilities (TO BE HOLLOWED Phase 1)
      stores/         # State management stores
        app-store.ts  # Central app state (270KB, heaviest file)
        github-user-store.ts    # (TO BE HOLLOWED Phase 2)
        issues-store.ts         # (TO BE HOLLOWED Phase 2)
        pull-request-store.ts   # (TO BE HOLLOWED Phase 2)
        ...
      databases/      # Dexie (IndexedDB) database layer
      stats/          # Telemetry (DISABLED in Phase 0)
      git/            # Git operations (KEEP - core functionality)
    main-process/     # Electron main process
      menu/           # Application menus
    models/           # Data models
      repository.ts   # Core repo model (links to GitHubRepository)
      account.ts      # User account model
      pull-request.ts # (TO DELETE Phase 3)
    ui/               # React UI components
      app.tsx          # Main render tree (~2000 lines)
      dispatcher/      # Action dispatcher (122KB)
      welcome/         # Welcome/onboarding flow
      about/           # About dialog
      publish-repository/  # (TO DELETE Phase 5)
      forks/               # (TO DELETE Phase 5)
      open-pull-request/   # (TO DELETE Phase 5)
      check-runs/          # (TO DELETE Phase 5)
      notifications/       # (TO DELETE Phase 5)
      ...
```

### Key Architecture Patterns

- **AppStore** (`app-store.ts`) is the central state container. All state flows through it.
- **Dispatcher** (`dispatcher.ts`) proxies UI actions to AppStore methods.
- **Models** are immutable data classes. `Repository` currently has an optional `gitHubRepository` field.
- **Stores** (issues, PRs, notifications, etc.) are instantiated in `ui/index.tsx` and injected into AppStore.

## Removal Strategy: Hollow, Then Remove

Rather than deleting files outright (causing thousands of compile errors), we:
1. **Hollow out** GitHub-specific code into no-ops (keep type exports, return empty data)
2. **Verify compilation** with `npx tsc --noEmit` after each phase
3. **Delete dead code** in later phases once all consumers are cleaned up

TypeScript's type system guides us to every broken reference.

---

## Phased Removal Plan & Progress

### Phase 0: Branding & First-Launch Bypass *(COMPLETE)*
> Make the app launchable without GitHub login. Rebrand to OpenGit.

- [x] `package.json` / `app/package.json` — Update branding to "OpenGit"
- [x] `app/src/lib/welcome.ts` — `hasShownWelcomeFlow()` returns `true`
- [x] `app/src/ui/welcome/` — Simplified: removed GitHub sign-in steps
- [x] `app/src/ui/about/about.tsx` — Updated branding
- [x] `app/src/main-process/menu/build-default-menu.ts` — "OpenGit" branding, updated help URLs
- [x] `app/src/lib/stats/stats-store.ts` — `reportStats()` is now a no-op

### Phase 1: Hollow Out the API Layer
> Stop all HTTP calls to GitHub while keeping exports for compilation.

- [ ] `app/src/lib/api.ts` (2,489 lines) — Keep type exports, make all API methods return empty/throw
- [ ] `app/src/lib/http.ts` — Keep `getUserAgent()`, gut HTTP functions

### Phase 2: Hollow Out GitHub-Specific Stores
> Make 10+ GitHub stores into no-ops while keeping class signatures.

- [ ] `lib/stores/github-user-store.ts` — Return empty maps
- [ ] `lib/stores/issues-store.ts` — Return empty arrays
- [ ] `lib/stores/pull-request-store.ts` — Return empty PR lists
- [ ] `lib/stores/pull-request-coordinator.ts` — Return empty
- [ ] `lib/stores/api-repositories-store.ts` — Return empty repo lists
- [ ] `lib/stores/notifications-store.ts` — No-op entirely
- [ ] `lib/stores/alive-store.ts` — No-op (kills WebSocket to GitHub)
- [ ] `lib/stores/notifications-debug-store.ts` — No-op
- [ ] `lib/stores/sign-in-store.ts` — Gut OAuth flow, keep type exports
- [ ] `lib/stores/commit-status-store.ts` — Gut CI status fetching
- [ ] `lib/stores/accounts-store.ts` — Remove `fetchUser` GitHub call
- [ ] `lib/databases/github-user-database.ts` — Gut, keep signature
- [ ] `lib/databases/issues-database.ts` — Gut, keep signature
- [ ] `lib/databases/pull-request-database.ts` — Gut, keep signature

### Phase 3: Clean Up the Model Layer
> Remove `GitHubRepository` as a concept.

- [ ] `models/repository.ts` — Remove `gitHubRepository` param, always null
- [ ] `models/account.ts` — Simplify to generic git auth
- [ ] `models/pull-request.ts` — Delete
- [ ] `models/owner.ts` — Delete
- [ ] `models/github-repository.ts` — Stub for now (delete Phase 7)
- [ ] `models/popup.ts` — Remove ~18 GitHub-specific popup types
- [ ] `models/clone-repository-tab.ts` — Remove DotCom/Enterprise tabs
- [ ] `models/menu-ids.ts` — Remove GitHub menu IDs
- [ ] Fix ~67 occurrences of `isRepositoryWithGitHubRepository()` across 23+ files

### Phase 4: Clean Up the Database Layer
> Remove GitHub-specific tables. Add migration.

- [ ] `lib/databases/repositories-database.ts` — Remove GitHub tables, add schema v10
- [ ] `lib/stores/repositories-store.ts` — Remove GitHub upsert methods
- [ ] Delete: `github-user-database.ts`, `issues-database.ts`, `pull-request-database.ts`

### Phase 5: Remove GitHub UI Components
> Delete GitHub-specific UI directories and clean up imports.

**Delete entirely** (14 directories):
- [ ] `ui/publish-repository/`, `ui/forks/`, `ui/open-pull-request/`
- [ ] `ui/check-runs/`, `ui/notifications/`, `ui/secret-scanning/`
- [ ] `ui/repository-rules/`, `ui/generate-commit-message/`
- [ ] `ui/test-notifications/`, `ui/invalidated-token/`
- [ ] `ui/saml-reauth-required/`, `ui/workflow-push-rejected/`
- [ ] `ui/choose-fork-settings/`, `ui/tutorial/`

**Heavily modify**:
- [ ] `ui/app.tsx` — Remove ~200+ lines of GitHub imports/handlers
- [ ] `ui/clone-repository/` — Keep URL clone only
- [ ] `ui/branches/` — Remove PR list, CI status
- [ ] `ui/changes/commit-message.tsx` — Remove Copilot
- [ ] `ui/preferences/accounts.tsx` — Redesign for generic credentials
- [ ] `ui/sign-in/` — Remove GitHub OAuth
- [ ] `ui/toolbar/push-pull-button.tsx` — Remove PR references

### Phase 6: Clean Up AppStore & Dispatcher
> Remove GitHub state and actions from central state management.

- [ ] `lib/stores/app-store.ts` — Remove ~1000+ lines of GitHub methods
- [ ] `ui/dispatcher/dispatcher.ts` — Remove proxy methods
- [ ] `ui/dispatcher/error-handlers.ts` — Remove GitHub error handlers
- [ ] `lib/app-state.ts` — Remove GitHub fields from IAppState
- [ ] `ui/index.tsx` — Remove deleted store instantiation
- [ ] Menu files — Remove GitHub menu items and events

### Phase 7: Final Cleanup — Delete Dead Code
> Remove all remaining stubs and dead files.

- [ ] Delete: `lib/api.ts`, `lib/http.ts`, `models/github-repository.ts`, `models/owner.ts`
- [ ] Delete all hollowed stores from Phase 2
- [ ] Delete: `lib/ci-checks/`, `lib/markdown-filters/`, `lib/copilot-error.ts`
- [ ] Delete: `lib/endpoint-capabilities.ts`, `lib/feature-flag.ts`
- [ ] Delete: `lib/commit-url.ts`, `lib/thank-you.ts`
- [ ] Clean up: `lib/text-token-parser.ts`, `ui/autocompletion/`

### Phase 8: Test Suite Cleanup
> Fix or remove tests that depend on GitHub features.

- [ ] Remove/update tests referencing GitHub models
- [ ] Remove test fixtures mocking GitHub API
- [ ] Run full test suite: `yarn test`

---

## Verification After Each Phase

1. `npx tsc --noEmit` — TypeScript compilation
2. `yarn build:dev` — Full dev build
3. Launch app and verify: add repo, clone URL, view changes, commit, branch, push/pull
4. No network calls to github.com (DevTools Network tab)

## Key Files by Impact

| File | Size | Impact |
|------|------|--------|
| `lib/stores/app-store.ts` | 270KB | Central state — most GitHub refs |
| `ui/dispatcher/dispatcher.ts` | 122KB | Action proxy — mirrors AppStore |
| `lib/api.ts` | 2,489 lines | Entire GitHub API |
| `ui/app.tsx` | ~2000 lines | Main render tree |
| `models/repository.ts` | Core model | Links to GitHubRepository |
| `ui/index.tsx` | Init wiring | All store instantiation |
