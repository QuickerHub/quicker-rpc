# getquicker User/Actions fixtures

Frozen HTML for QuickerBench `user-action-likes-total`. **CI must not fetch live pages.**

## Oracle script (source of truth)

```powershell
# Fixture mode (CI / default)
node ./scripts/quickerbench/oracle-user-action-likes-total.mjs

# Live probe (maintainers)
node ./scripts/quickerbench/oracle-user-action-likes-total.mjs --live

# Sync quickerbench-tasks.json outputVars
node ./scripts/quickerbench/oracle-user-action-likes-total.mjs --sync
```

Shared parser: `scripts/quickerbench/lib/user-actions-likes.mjs`

## Refresh fixtures

```powershell
node ./scripts/quickerbench-fetch-fixtures.mjs
node ./scripts/quickerbench-sync-oracle.mjs
```

## Cached oracle (113342-Cea)

See `manifest.json`: `totalLikes`, `actionCount` (117 actions, 5 pages).

Mock profile: `agent-gui/benchmarks/mock-profiles/user-action-likes-total.json`
