# Agent harness

Repository-wide architecture rules: [`docs/agent-architecture.md`](../../../docs/agent-architecture.md).

The chat endpoint uses the AI SDK `ToolLoopAgent` as its agent loop. Quicker's
product-specific behavior stays in small adapters around that loop instead of
being folded into the HTTP route or reimplemented as a second agent framework.

```text
app/api/chat/route.ts
  -> agent-service/chat-handler.ts   shared standard HTTP/preview/error adapter
  -> run-turn.server.ts              concrete server bindings
     -> turn-runner.ts               request orchestration and cancellation owner
     -> turn-request.server.ts       normalize UI/request input
     -> turn-runtime.server.ts       scope, static/MCP tools, policy, prompt, context budget
     -> stream-loop.server.ts        persistence/compaction bindings
        -> stream-loop.ts            ToolLoopAgent + reactive compact retry
        -> AI SDK                    model/tool loop and UI message stream
```

The experimental `service/main.ts` Node entry uses the same HTTP handler and
runner. It adds loopback HTTP/backpressure/stop ownership, not another Agent loop.
The current desktop UI still runs through Next. Service composition and migration
gates are documented in the canonical architecture document above.

## Ownership rules

| Layer | Owns | Does not own |
| --- | --- | --- |
| Route | decode request, release preview, pass request signal | model/tool policy |
| Turn runner | ordered phases, per-turn cancellation and runtime disposal | user config, DB or host adapters |
| Turn request | modes, slash expansion, repaired/model messages, LLM selection | model calls |
| Turn runtime | designer scope, static/MCP tool loading, turn plan, call limits, system prompt, initial compaction | model/tool loop |
| Stream loop | `ToolLoopAgent`, per-step microcompaction, usage metadata, reactive retry | request parsing |
| Tool execution context | explicit per-turn fields mirrored into ALS for compatibility | policy inference |

`turn-lifecycle.ts` owns one turn's signal and cleanup. The final SSE response body
propagates consumer cancellation to the producer. Runtime cleanup also runs when
production finishes, without discarding buffered messages. Late resources acquired
after cancellation are released; nested tool contexts retain the same parent signal.

`turn-execution-state.ts` creates one mutable facts object per root turn. Nested
tools and subagents share that reference. Program/connectivity flags never use a
thread-keyed global map; lifecycle disposal clears and closes the owner, and late
callbacks cannot revive it. Thread ids remain persistence/display identifiers.

`stream-loop.ts` still uses the single AI SDK `ToolLoopAgent`. Its injected usage
and compaction ports allow real SDK tests with synthetic models, without accessing
account data. `turn-runner.test.ts` tests the same production orchestration via
isolated adapters. Run `pnpm check:agent-offline` from `agent-gui`.

When adding behavior, prefer extending the narrowest owning layer. Keep
`runAgentChatTurn` as a readable phase sequence rather than adding another
policy branch there.
