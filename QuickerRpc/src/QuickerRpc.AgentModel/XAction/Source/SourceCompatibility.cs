using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.CompilerServices;
using Newtonsoft.Json.Linq;

namespace QuickerRpc.AgentModel.XAction.Source;

// Keep the upstream codec usable by the V1 net472 host and netstandard CLI contract.
internal static class SourceCompatibility
{
    public static bool StartsWith(this string value, char character) => value.Length > 0 && value[0] == character;
    public static bool EndsWith(this string value, char character) => value.Length > 0 && value[value.Length - 1] == character;
    public static bool Contains(this string value, char character) => value.IndexOf(character) >= 0;
    public static bool Contains(this string value, char character, StringComparison comparison) => value.IndexOf(character) >= 0;
    public static string Replace(this string value, string oldValue, string newValue, StringComparison comparison)
    {
        if (comparison != StringComparison.Ordinal) throw new ArgumentException("Only ordinal replacement is supported.", nameof(comparison));
        return value.Replace(oldValue, newValue);
    }
    public static HashSet<T> ToHashSet<T>(this IEnumerable<T> items, IEqualityComparer<T> comparer) => new(items, comparer);
}

internal sealed class SourceReferenceEqualityComparer : IEqualityComparer<JToken>
{
    public static readonly SourceReferenceEqualityComparer Instance = new();
    public bool Equals(JToken? x, JToken? y) => ReferenceEquals(x, y);
    public int GetHashCode(JToken obj) => RuntimeHelpers.GetHashCode(obj);
}
