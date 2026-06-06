using System;
using System.Collections.Generic;

namespace QuickerRpc.Plugin.Services;

internal sealed class ActionSearchSortKeyComparer : IComparer<object?>
{
    public static ActionSearchSortKeyComparer Instance { get; } = new();

    public int Compare(object? x, object? y) => ActionSearchScriptEvaluator.CompareSortKeys(x, y);
}
