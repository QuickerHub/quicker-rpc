/** Map qkrpc CLI argv (without --json) to HTTP serve op + args. */

export type QkrpcInvoke = {
  op: string;
  args: Record<string, unknown>;
};

function parseFlags(argv: string[]): {
  positional: string[];
  flags: Record<string, string | boolean>;
} {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") continue;
    if (a === "--yes") {
      flags.yes = true;
      continue;
    }
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i += 1;
      } else {
        flags[key] = true;
      }
      continue;
    }
    positional.push(a);
  }

  return { positional, flags };
}

function flagStr(flags: Record<string, string | boolean>, name: string): string | undefined {
  const v = flags[name];
  if (typeof v === "string") return v;
  return undefined;
}

function flagInt(flags: Record<string, string | boolean>, name: string): number | undefined {
  const v = flags[name];
  if (typeof v === "string") {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function flagBool(flags: Record<string, string | boolean>, name: string): boolean {
  return flags[name] === true;
}

export function argvToInvoke(argv: string[]): QkrpcInvoke | null {
  const filtered = argv.filter((a) => a !== "--json");
  const { positional, flags } = parseFlags(filtered);

  if (positional.length === 0) return null;

  if (positional[0] === "ping") {
    return {
      op: "ping",
      args: { timeout: flagInt(flags, "timeout") },
    };
  }

  if (positional[0] === "guide") {
    const verb = positional[1];
    if (verb === "get") {
      return { op: "guide.get", args: { topic: flagStr(flags, "topic") } };
    }
    if (verb === "search") {
      return {
        op: "guide.search",
        args: { query: flagStr(flags, "query"), limit: flagInt(flags, "limit") },
      };
    }
    return null;
  }

  if (positional[0] === "action") {
    const verb = positional[1];
    if (verb === "list") {
      return {
        op: "action.list",
        args: {
          query: flagStr(flags, "query"),
          scope: flagStr(flags, "scope"),
          limit: flagInt(flags, "limit"),
          sort: flagStr(flags, "sort"),
        },
      };
    }
    if (verb === "search") {
      return {
        op: "action.search",
        args: {
          query: flagStr(flags, "query"),
          scope: flagStr(flags, "scope"),
          limit: flagInt(flags, "limit"),
        },
      };
    }
    if (verb === "get") {
      return {
        op: "action.get",
        args: {
          id: flagStr(flags, "id"),
          returnMode: flagStr(flags, "return-mode") ?? flagStr(flags, "returnMode"),
        },
      };
    }
    if (verb === "create") {
      return {
        op: "action.create",
        args: {
          title: flagStr(flags, "title"),
          description: flagStr(flags, "description"),
          icon: flagStr(flags, "icon"),
          profileId: flagStr(flags, "profile-id"),
        },
      };
    }
    if (verb === "replace") {
      return {
        op: "action.replace",
        args: {
          id: flagStr(flags, "id"),
          expectedEditVersion: flagInt(flags, "expected-edit-version"),
          force: flagBool(flags, "force"),
        },
      };
    }
    if (verb === "update") {
      return {
        op: "action.update",
        args: {
          id: flagStr(flags, "id"),
          changelog: flagStr(flags, "changelog"),
        },
      };
    }
    if (verb === "float") {
      return {
        op: "action.float",
        args: { id: flagStr(flags, "id") },
      };
    }
    if (verb === "edit") {
      return {
        op: "action.edit",
        args: { id: flagStr(flags, "id") },
      };
    }
    if (verb === "edit-var") {
      return {
        op: "action.edit-var",
        args: {
          id: flagStr(flags, "id"),
          var: flagStr(flags, "var"),
          value: flagStr(flags, "value"),
        },
      };
    }
    if (verb === "patch") {
      return {
        op: "action.patch",
        args: {
          id: flagStr(flags, "id"),
          expectedEditVersion: flagInt(flags, "expected-edit-version"),
          force: flagBool(flags, "force"),
        },
      };
    }
    if (verb === "set-metadata") {
      return {
        op: "action.set-metadata",
        args: {
          id: flagStr(flags, "id"),
          title: flagStr(flags, "title"),
          description: flagStr(flags, "description"),
          icon: flagStr(flags, "icon"),
          expectedEditVersion: flagInt(flags, "expected-edit-version"),
          force: flagBool(flags, "force"),
        },
      };
    }
    if (verb === "delete") {
      return { op: "action.delete", args: { id: flagStr(flags, "id") } };
    }
    if (verb === "run") {
      return {
        op: "action.run",
        args: {
          id: flagStr(flags, "id"),
          param: flagStr(flags, "param"),
          wait: flagBool(flags, "wait"),
          debug: flagBool(flags, "debug"),
        },
      };
    }
    return null;
  }

  if (positional[0] === "subprogram") {
    const verb = positional[1];
    if (verb === "search") {
      return {
        op: "subprogram.search",
        args: { query: flagStr(flags, "query"), limit: flagInt(flags, "limit") },
      };
    }
    if (verb === "list") {
      return {
        op: "subprogram.list",
        args: { query: flagStr(flags, "query"), limit: flagInt(flags, "limit") },
      };
    }
    if (verb === "create") {
      return {
        op: "subprogram.create",
        args: {
          name: flagStr(flags, "name"),
          description: flagStr(flags, "description"),
          icon: flagStr(flags, "icon"),
        },
      };
    }
    if (verb === "get") {
      return {
        op: "subprogram.get",
        args: {
          id: flagStr(flags, "id"),
          returnMode: flagStr(flags, "return-mode") ?? flagStr(flags, "returnMode"),
        },
      };
    }
    if (verb === "patch") {
      return {
        op: "subprogram.patch",
        args: {
          id: flagStr(flags, "id"),
          expectedEditVersion: flagInt(flags, "expected-edit-version"),
          force: flagBool(flags, "force"),
        },
      };
    }
    if (verb === "replace") {
      return {
        op: "subprogram.replace",
        args: {
          id: flagStr(flags, "id"),
          expectedEditVersion: flagInt(flags, "expected-edit-version"),
          force: flagBool(flags, "force"),
        },
      };
    }
    if (verb === "edit") {
      return {
        op: "subprogram.edit",
        args: { id: flagStr(flags, "id") },
      };
    }
    if (verb === "edit-var") {
      return {
        op: "subprogram.edit-var",
        args: {
          id: flagStr(flags, "id"),
          var: flagStr(flags, "var"),
          value: flagStr(flags, "value"),
        },
      };
    }
    if (verb === "delete") {
      return { op: "subprogram.delete", args: { id: flagStr(flags, "id") } };
    }
    return null;
  }

  if (positional[0] === "step-runner") {
    const verb = positional[1];
    if (verb === "search") {
      return {
        op: "step-runner.search",
        args: { query: flagStr(flags, "query"), limit: flagInt(flags, "limit") },
      };
    }
    if (verb === "get") {
      return {
        op: "step-runner.get",
        args: {
          key: flagStr(flags, "key"),
          controlField: flagStr(flags, "control-field"),
        },
      };
    }
    return null;
  }

  if (positional[0] === "fa") {
    const verb = positional[1];
    if (verb === "search") {
      return {
        op: "fa.search",
        args: {
          query: flagStr(flags, "query"),
          limit: flagInt(flags, "limit"),
          expand: flagBool(flags, "expand") || flagBool(flags, "all-styles"),
        },
      };
    }
    if (verb === "resolve") {
      const specsRaw = flagStr(flags, "specs");
      let specs: string[] | undefined;
      if (specsRaw) {
        try {
          const parsed = JSON.parse(specsRaw) as unknown;
          if (Array.isArray(parsed)) {
            specs = parsed.filter((x): x is string => typeof x === "string");
          }
        } catch {
          specs = undefined;
        }
      }
      const spec = flagStr(flags, "spec");
      return {
        op: "fa.resolve",
        args: {
          specs: specs ?? (spec ? [spec] : undefined),
        },
      };
    }
    return null;
  }

  return null;
}
