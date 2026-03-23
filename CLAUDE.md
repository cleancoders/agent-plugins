# Claude Code Agent Plugins

## Releasing a New Plugin Version

To release a new version of a plugin (e.g., `kanban-dashboard`):

1. Update `plugins/<plugin>/VERSION` with the new version number
2. Update `plugins/<plugin>/CHANGES` with a changelog entry
3. Commit and push to `master`

The CI workflow (`build-plugins.yml`) handles everything else automatically:
- Syncs the version from `VERSION` to `package.json`, `plugin.json`, `marketplace.json`, and `index.ts`
- Runs tests and builds the plugin bundle
- Commits the synced files
- Creates a git tag (`<plugin>/v<version>`)

**Do not** manually update `package.json`, `plugin.json`, `marketplace.json`, or `index.ts` version fields — the CI will do it.
