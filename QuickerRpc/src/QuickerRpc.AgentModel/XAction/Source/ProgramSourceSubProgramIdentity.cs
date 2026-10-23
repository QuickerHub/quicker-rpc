// Ported from Quicker Quicker.Ai.Workspace, revision 574556d76b0b10bd9a8a7951277435649650fab8.
using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;

namespace QuickerRpc.AgentModel.XAction.Source;

/// <summary>为省略 ID 的源码声明补齐身份，复用同一作用域中唯一同名的既有子程序。</summary>
internal static class ProgramSourceSubProgramIdentity
{
    public static void EnsureIds(JObject program, JObject? previousProgram = null)
    {
        // 设计器按 ID 搜索整棵树，先保留所有显式 ID，避免旧身份复用与后续子树冲突。
        var usedIds = new HashSet<string>(EnumerateSubPrograms(program).Select(ReadId)
            .Where(id => !string.IsNullOrWhiteSpace(id)), StringComparer.OrdinalIgnoreCase);
        var previousIdCounts = EnumerateSubPrograms(previousProgram).Select(ReadId)
            .Where(id => !string.IsNullOrWhiteSpace(id)).GroupBy(id => id, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.Count(), StringComparer.OrdinalIgnoreCase);
        EnsureIds(program, previousProgram, usedIds, previousIdCounts);
    }

    private static void EnsureIds(
        JObject program,
        JObject? previousProgram,
        HashSet<string> usedIds,
        IReadOnlyDictionary<string, int> previousIdCounts)
    {
        var subs = program["subPrograms"] as JArray ?? program["SubPrograms"] as JArray;
        if (subs is null) return;
        var previous = (previousProgram?["subPrograms"] as JArray ?? previousProgram?["SubPrograms"] as JArray)?
            .OfType<JObject>().ToArray() ?? [];
        var names = subs.OfType<JObject>().GroupBy(ReadName, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.Count(), StringComparer.Ordinal);

        foreach (var sub in subs.OfType<JObject>())
        {
            var idToken = sub["id"] ?? sub["Id"];
            var id = ReadId(sub);
            var name = ReadName(sub);
            JObject? old = null;
            if (!string.IsNullOrWhiteSpace(id))
            {
                old = Unique(previous.Where(candidate => string.Equals(ReadId(candidate), id, StringComparison.OrdinalIgnoreCase)));
            }
            else if (idToken is null || idToken.Type == JTokenType.Null)
            {
                // 重名、无名声明交给校验器纠正，不能靠数组位置猜测身份。
                if (!string.IsNullOrWhiteSpace(name) && names[name] == 1)
                {
                    old = Unique(previous.Where(candidate => string.Equals(ReadName(candidate), name, StringComparison.Ordinal)));
                    var oldId = old is null ? string.Empty : ReadId(old);
                    var oldIdUnique = !string.IsNullOrWhiteSpace(oldId)
                        && previousIdCounts.TryGetValue(oldId, out var count) && count == 1;
                    if (oldIdUnique && usedIds.Add(oldId))
                    {
                        id = oldId;
                    }
                    else
                    {
                        do { id = Guid.NewGuid().ToString("D"); } while (!usedIds.Add(id));
                        // 父身份没有复用时，子树也属于新增副本，不能继承旧子树的身份。
                        old = null;
                    }
                    sub["id"] = id;
                }
            }

            EnsureIds(sub, old, usedIds, previousIdCounts);
        }
    }

    private static IEnumerable<JObject> EnumerateSubPrograms(JObject? program)
    {
        var subs = program?["subPrograms"] as JArray ?? program?["SubPrograms"] as JArray;
        if (subs is null) yield break;
        foreach (var sub in subs.OfType<JObject>())
        {
            yield return sub;
            foreach (var nested in EnumerateSubPrograms(sub)) yield return nested;
        }
    }

    private static JObject? Unique(IEnumerable<JObject> candidates)
    {
        var matches = candidates.Take(2).ToArray();
        return matches.Length == 1 ? matches[0] : null;
    }

    private static string ReadName(JObject sub) => ReadString(sub["name"] ?? sub["Name"]);
    private static string ReadId(JObject sub) => ReadString(sub["id"] ?? sub["Id"]);
    private static string ReadString(JToken? token) => token?.Type == JTokenType.String ? token.Value<string>() ?? "" : "";
}
