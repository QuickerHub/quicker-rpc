# qkrpc — refresh skills after CLI upgrade

When `qkrpc agent setup --check` reports an outdated CLI version, or after upgrading `qkrpc-win-x64-setup.exe`:

```powershell
qkrpc agent setup --upgrade
```

Verify:

```powershell
qkrpc agent setup --check
qkrpc ping --json
```

Then reload Cursor MCP (Settings → MCP). Reinstall or update this Cursor plugin if bundled skills/rules are older than your CLI.

Prerequisites: Quicker running with QuickerRpc plugin loaded. See plugin README for install links.
