using System;
using Newtonsoft.Json.Linq;
using Quicker.Common.Vm;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Extracts XAction JSON from <see cref="SharedActionDto"/> (Data may be split across Data2/Data3).
/// </summary>
internal static class SharedActionBodyResolver
{
    public static string? TryGetBodyJson(SharedActionDto? dto)
    {
        if (dto is null)
        {
            return null;
        }

        if (ActionProgramContent.HasProgramContent(dto.Data))
        {
            return dto.Data;
        }

        var merged = MergeDataParts(dto.Data, dto.Data2, dto.Data3);
        if (ActionProgramContent.HasProgramContent(merged))
        {
            return merged;
        }

        return null;
    }

    private static string? MergeDataParts(string? data, string? data2, string? data3)
    {
        if (string.IsNullOrEmpty(data))
        {
            return null;
        }

        if (string.IsNullOrEmpty(data2) && string.IsNullOrEmpty(data3))
        {
            return data;
        }

        return data + (data2 ?? string.Empty) + (data3 ?? string.Empty);
    }
}
