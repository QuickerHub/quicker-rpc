/** Map qkrpc CLI argv (without --json) to HTTP serve op + args. */

export type QkrpcInvoke = {
  op: string;
  args: Record<string, unknown>;
};

function parseFlags(argv: string[], inlineValueFlags?: ReadonlySet<string>): {
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
      const equals = a.indexOf("=");
      if (equals > 2 && inlineValueFlags?.has(a.slice(2, equals))) {
        flags[a.slice(2, equals)] = a.slice(equals + 1);
        continue;
      }
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

function flagEditVersion(flags: Record<string, string | boolean>): number | string | undefined {
  const raw = flagStr(flags, "expected-edit-version")?.trim();
  if (raw && /^[+-]?\d+$/.test(raw) && !Number.isSafeInteger(Number(raw))) return raw;
  return flagInt(flags, "expected-edit-version");
}

function parseJsonFlag(
  flags: Record<string, string | boolean>,
  name: string,
): unknown | undefined {
  const raw = flagStr(flags, name);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

export function argvToInvoke(argv: string[]): QkrpcInvoke | null {
  const filtered = argv.filter((a) => a !== "--json");
  const literalContract = argv[0] === "step-runner" && ["input-contract", "get", "get-ui"].includes(argv[1]);
  const { positional, flags } = parseFlags(filtered, literalContract ? new Set(["key", "control-field", "control-field-json"]) : undefined);

  if (positional.length === 0) return null;

  if ((positional[0] === "action" || positional[0] === "subprogram") && positional[1] === "catalog-page") {
    return { op: "resource.catalog.page", args: {
      kind: positional[0] === "action" ? "action" : "global_subprogram", scope: flagStr(flags, "scope") ?? "runtimeCatalog",
      query: flagStr(flags, "query") ?? "", skip: flagInt(flags, "skip") ?? 0, take: flagInt(flags, "take") ?? 500,
      expectedSnapshotId: flagStr(flags, "snapshot-id") ?? null,
    } };
  }

  if (positional[0] === "ping") {
    return {
      op: "ping",
      args: { timeout: flagInt(flags, "timeout") },
    };
  }

  if (positional[0] === "wait") {
    return {
      op: "wait",
      args: {
        timeoutSeconds: flagInt(flags, "timeout") ?? 120,
        intervalSeconds: flagInt(flags, "interval") ?? 2,
        noBootstrap: flags["no-bootstrap"] === true,
      },
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
    if (verb === "list" || verb === "search") {
      return {
        op: "action.list",
        args: {
          query: flagStr(flags, "query"),
          scope: flagStr(flags, "scope"),
          limit: flagInt(flags, "limit"),
          sort: flagStr(flags, "sort"),
          fields: flagStr(flags, "fields"),
        },
      };
    }
    if (verb === "mention-search") {
      return {
        op: "action.mention-search",
        args: {
          query: flagStr(flags, "query") ?? flagStr(flags, "q"),
          limit: flagInt(flags, "limit"),
        },
      };
    }
    if (verb === "library" && positional[2] === "search") {
      return {
        op: "action.library.search",
        args: {
          keyword:
            flagStr(flags, "keyword") ?? flagStr(flags, "query") ?? flagStr(flags, "q"),
          page: flagInt(flags, "page"),
          days: flagInt(flags, "days"),
          limit: flagInt(flags, "limit"),
        },
      };
    }
    if (verb === "shared" && positional[2] === "get") {
      return {
        op: "action.shared.get",
        args: {
          id: flagStr(flags, "id") ?? flagStr(flags, "code"),
          returnMode: flagStr(flags, "return-mode"),
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
    if (verb === "open") {
      return {
        op: "action.open",
        args: {
          id: flagStr(flags, "id") ?? flagStr(flags, "code"),
          dir: flagStr(flags, "dir"),
          minLines: flagInt(flags, "min-lines"),
          noAutoFiles: flagBool(flags, "no-auto-files") || undefined,
        },
      };
    }
    if (verb === "save") {
      return {
        op: "action.save",
        args: {
          dir: flagStr(flags, "dir"),
          dryRun: flagBool(flags, "dry-run"),
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
          expectedEditVersion: flagEditVersion(flags),
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
    if (verb === "publish") {
      return {
        op: "action.publish",
        args: {
          id: flagStr(flags, "id"),
          title: flagStr(flags, "title"),
          description: flagStr(flags, "description"),
          html: flagStr(flags, "html"),
          htmlFile: flagStr(flags, "html-file"),
          tags: flagStr(flags, "tags"),
          keywords: flagStr(flags, "keywords"),
          changelog: flagStr(flags, "changelog"),
          private: flagBool(flags, "private") || undefined,
          noSubmitReview: flagBool(flags, "no-submit-review") || undefined,
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
          expectedEditVersion: flagEditVersion(flags),
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
          expectedEditVersion: flagEditVersion(flags),
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
          trace: flagBool(flags, "trace"),
        },
      };
    }
    if (verb === "move") {
      const onNoEmptySlot = flagStr(flags, "on-no-empty-slot");
      const onOccupiedSlot = flagStr(flags, "on-occupied-slot");
      return {
        op: "action.move",
        args: {
          id: flagStr(flags, "id"),
          profile: flagStr(flags, "profile"),
          row: flagInt(flags, "row"),
          col: flagInt(flags, "col"),
          swap: flagBool(flags, "swap"),
          onNoEmptySlot: onNoEmptySlot
            ? onNoEmptySlot.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
            : undefined,
          onOccupiedSlot: onOccupiedSlot
            ? onOccupiedSlot.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
            : undefined,
        },
      };
    }
    if (verb === "extract") {
      return {
        op: "action.extract",
        args: {
          id: flagStr(flags, "id"),
          dir: flagStr(flags, "dir"),
          minLines: flagInt(flags, "min-lines"),
          noAutoFiles: flagBool(flags, "no-auto-files") || undefined,
        },
      };
    }
    if (verb === "validate") {
      return {
        op: "action.validate",
        args: {
          id: flagStr(flags, "id"),
          dir: flagStr(flags, "dir"),
        },
      };
    }
    if (verb === "apply") {
      return {
        op: "action.apply",
        args: {
          id: flagStr(flags, "id"),
          dir: flagStr(flags, "dir"),
          expectedEditVersion: flagEditVersion(flags),
          force: flagBool(flags, "force") || undefined,
        },
      };
    }
    if (verb === "shared-info-get") {
      return {
        op: "action.shared-info.get",
        args: {
          id: flagStr(flags, "id") ?? flagStr(flags, "code"),
        },
      };
    }
    if (verb === "shared-info-set") {
      return {
        op: "action.shared-info.set",
        args: {
          id: flagStr(flags, "id") ?? flagStr(flags, "code"),
          html: flagStr(flags, "html"),
          htmlFile: flagStr(flags, "html-file"),
        },
      };
    }
    return null;
  }

  if (positional[0] === "profile") {
    const verb = positional[1];
    if (verb === "create") {
      return {
        op: "profile.create",
        args: {
          scope: flagStr(flags, "scope"),
          count: flagInt(flags, "count"),
          afterFirst: flagBool(flags, "after-first"),
        },
      };
    }
    if (verb === "delete") {
      const idsRaw = flagStr(flags, "ids");
      const profileIds = idsRaw
        ? idsRaw.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined;
      const singleId = flagStr(flags, "id");
      return {
        op: "profile.delete",
        args: {
          id: singleId,
          profileIds:
            profileIds ?? (singleId ? [singleId] : undefined),
        },
      };
    }
    if (verb === "reorder") {
      const idsRaw = flagStr(flags, "ids");
      const profileIds = idsRaw
        ? idsRaw.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined;
      const singleId = flagStr(flags, "id");
      return {
        op: "profile.reorder",
        args: {
          scope: flagStr(flags, "scope"),
          afterFirst: flagBool(flags, "after-first"),
          profileIds:
            profileIds ?? (singleId ? [singleId] : undefined),
        },
      };
    }
    return null;
  }

  if (positional[0] === "process") {
    const verb = positional[1];
    if (verb === "ensure") {
      const moveActions =
        flagBool(flags, "move-actions") || flagBool(flags, "moveActions");
      return {
        op: "process.ensure",
        args: {
          exeFile: flagStr(flags, "exe"),
          displayName: flagStr(flags, "name"),
          profileNamePrefix: flagStr(flags, "profile-prefix"),
          collectSubProgramName: flagStr(flags, "collect-subprogram"),
          moveActions: moveActions || undefined,
          moveAny:
            flagBool(flags, "move-any") || flagBool(flags, "moveAny") || undefined,
        },
      };
    }
    return null;
  }

  if (positional[0] === "subprogram") {
    const verb = positional[1];
    if (verb === "list" || verb === "search") {
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
          expectedEditVersion: flagEditVersion(flags),
          force: flagBool(flags, "force"),
        },
      };
    }
    if (verb === "replace") {
      return {
        op: "subprogram.replace",
        args: {
          id: flagStr(flags, "id"),
          expectedEditVersion: flagEditVersion(flags),
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
    if (verb === "export") {
      return {
        op: "subprogram.export",
        args: {
          id: flagStr(flags, "id") ?? flagStr(flags, "code"),
          dir: flagStr(flags, "dir"),
        },
      };
    }
    if (verb === "import" || verb === "apply") {
      return {
        op: "subprogram.import",
        args: {
          dir: flagStr(flags, "dir"),
          expectedEditVersion: flagEditVersion(flags),
          force: flagBool(flags, "force"),
        },
      };
    }
    if (verb === "validate") {
      return {
        op: "subprogram.validate",
        args: { dir: flagStr(flags, "dir") },
      };
    }
    return null;
  }

  if (positional[0] === "step-runner") {
    const verb = positional[1];
    if (verb === "list") {
      return { op: "step-runner.list", args: { limit: flagInt(flags, "limit") } };
    }
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
    if (verb === "input-contract") {
      if (typeof flags.key !== "string" || !flags.key.trim()
        || (flags["control-field"] !== undefined && typeof flags["control-field"] !== "string")
        || (flags["control-field-json"] !== undefined && typeof flags["control-field-json"] !== "string")
        || (flags["control-field"] !== undefined && flags["control-field-json"] !== undefined)) return null;
      const controlField = flags["control-field-json"] === undefined ? flagStr(flags, "control-field") : parseJsonFlag(flags, "control-field-json");
      if (flags["control-field-json"] !== undefined && typeof controlField !== "string") return null;
      return { op: "step-runner.input-contract", args: {
        key: flagStr(flags, "key"), controlField,
      } };
    }
    if (verb === "get-ui") {
      return {
        op: "step-runner.getUi",
        args: {
          key: flagStr(flags, "key"),
          controlField: flagStr(flags, "control-field"),
        },
      };
    }
    if (verb === "summaries") {
      return {
        op: "step-runner.summaries",
        args: {
          requestFile: flagStr(flags, "request-file"),
        },
      };
    }
    return null;
  }

  if (positional[0] === "settings") {
    const verb = positional[1];
    if (verb === "search" || verb === "list") {
      return {
        op: "settings.list",
        args: {
          query: flagStr(flags, "query"),
          scope: flagStr(flags, "scope"),
          maxResults: flagInt(flags, "limit"),
        },
      };
    }
    if (verb === "get") {
      return {
        op: "settings.get",
        args: { key: flagStr(flags, "key") },
      };
    }
    if (verb === "set") {
      return {
        op: "settings.set",
        args: {
          key: flagStr(flags, "key"),
          value: flagStr(flags, "value"),
        },
      };
    }
    if (verb === "apply") {
      const parsed = parseJsonFlag(flags, "changes");
      if (Array.isArray(parsed)) {
        return { op: "settings.apply", args: { changes: parsed } };
      }
      if (parsed && typeof parsed === "object") {
        return { op: "settings.apply", args: { patch: parsed } };
      }
      return { op: "settings.apply", args: {} };
    }
    if (verb === "pages") {
      return { op: "settings.pages", args: {} };
    }
    if (verb === "links") {
      return { op: "settings.links", args: {} };
    }
    if (verb === "open") {
      return {
        op: "settings.open",
        args: {
          preset: flagStr(flags, "preset") ?? flagStr(flags, "link"),
          page:
            flagStr(flags, "page")
            ?? flagStr(flags, "target")
            ?? flagStr(flags, "page-id"),
          query: flagStr(flags, "query"),
          key: flagStr(flags, "key"),
          searchText: flagStr(flags, "search-text"),
          exe: flagStr(flags, "exe") ?? flagStr(flags, "exe-file"),
        },
      };
    }
    return null;
  }

  if (positional[0] === "chrome") {
    const verb = positional[1];
    if (verb === "tabs") {
      return { op: "chrome.tabs", args: {} };
    }
    if (verb === "run") {
      const paramsRaw = flagStr(flags, "params");
      let parameters: unknown;
      if (paramsRaw) {
        try {
          parameters = JSON.parse(paramsRaw) as unknown;
        } catch {
          parameters = undefined;
        }
      }
      return {
        op: "chrome.run",
        args: {
          operation: flagStr(flags, "operation"),
          parametersJson: paramsRaw,
          parameters,
          sessionId: flagStr(flags, "session"),
        },
      };
    }
    return null;
  }

  if (positional[0] === "trigger") {
    const verb = positional[1];
    if (verb === "list") {
      return {
        op: "trigger.list",
        args: {
          query: flagStr(flags, "query") ?? flagStr(flags, "q"),
          eventType: flagStr(flags, "event"),
        },
      };
    }
    if (verb === "events") {
      return {
        op: "trigger.events",
        args: { eventType: flagStr(flags, "event") },
      };
    }
    if (verb === "add" || verb === "update") {
      return {
        op: "trigger.save",
        args: {
          id: verb === "update" ? flagStr(flags, "id") : undefined,
          eventType: flagStr(flags, "event"),
          action: flagStr(flags, "action"),
          actionParam: flagStr(flags, "action-param"),
          paramsJson: flagStr(flags, "params"),
          note: flagStr(flags, "note"),
          filter: flagStr(flags, "filter"),
          machines: flagStr(flags, "machines"),
          debounceMs: flagInt(flags, "debounce"),
          throttleMs: flagInt(flags, "throttle"),
          delayMs: flagInt(flags, "delay"),
          skipFurtherTasks: flagBool(flags, "skip-further") || undefined,
          enabled: flagBool(flags, "disabled")
            ? false
            : flagBool(flags, "enabled")
              ? true
              : undefined,
        },
      };
    }
    if (verb === "delete") {
      return { op: "trigger.delete", args: { id: flagStr(flags, "id") } };
    }
    if (verb === "enable" || verb === "disable") {
      return {
        op: verb === "enable" ? "trigger.enable" : "trigger.disable",
        args: { id: flagStr(flags, "id") },
      };
    }
    return null;
  }

  if (positional[0] === "fa") {
    const verb = positional[1];
    if (verb === "page") {
      const invalidInteger = ["skip", "take"].some((name) => flags[name] !== undefined
        && (typeof flags[name] !== "string" || !/^[+-]?\d+$/.test(flags[name] as string)
          || Number(flags[name]) < -2_147_483_648 || Number(flags[name]) > 2_147_483_647));
      if (invalidInteger || ["query", "style"].some((name) => flags[name] !== undefined && typeof flags[name] !== "string")) return null;
      return { op: "fa.page", args: { query: flagStr(flags, "query"), style: flagStr(flags, "style"),
        skip: flagInt(flags, "skip"), take: flagInt(flags, "take") } };
    }
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
