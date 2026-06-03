using System;
using System.Globalization;
using Google.Protobuf.WellKnownTypes;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.Proto.V1;

namespace QuickerRpc.AgentModel.XAction.Project;

/// <summary>Build <see cref="ActionProjectInfo"/> from RPC metadata or legacy JSON.</summary>
public static class ActionProjectInfoMapper
{
    public static ActionProjectInfo FromMetadataGet(
        string actionId,
        long editVersion,
        JObject? compressedMetadata)
    {
        var info = new ActionProjectInfo
        {
            Id = actionId.Trim(),
            EditVersion = editVersion,
            ExportedUtc = Timestamp.FromDateTime(DateTime.UtcNow),
        };

        if (compressedMetadata is null)
        {
            return info;
        }

        info.Title = compressedMetadata.Value<string>("title")
                     ?? compressedMetadata.Value<string>("Title")
                     ?? string.Empty;
        info.Description = compressedMetadata.Value<string>("description")
                           ?? compressedMetadata.Value<string>("Description")
                           ?? string.Empty;
        info.Icon = compressedMetadata.Value<string>("icon")
                    ?? compressedMetadata.Value<string>("Icon")
                    ?? string.Empty;

        return info;
    }

    public static ActionProjectInfo FromMetadataGetEnvelope(JObject root)
    {
        var actionId = root.Value<string>("actionId")
                       ?? root.Value<string>("ActionId")
                       ?? root.Value<string>("id")
                       ?? root.Value<string>("Id")
                       ?? string.Empty;
        var editVersion = root.Value<long?>("editVersion") ?? root.Value<long?>("EditVersion") ?? 0L;
        var compressed = root["compressed"] as JObject ?? root["Compressed"] as JObject;
        return FromMetadataGet(actionId, editVersion, compressed);
    }

    public static ActionProjectInfo FromLegacyPascal(JObject root)
    {
        var info = new ActionProjectInfo
        {
            Id = root.Value<string>("Id") ?? root.Value<string>("id") ?? string.Empty,
            Title = root.Value<string>("Title") ?? root.Value<string>("title") ?? string.Empty,
            Description = root.Value<string>("Description") ?? root.Value<string>("description") ?? string.Empty,
            Icon = root.Value<string>("Icon") ?? root.Value<string>("icon") ?? string.Empty,
            EditVersion = root.Value<long?>("EditVersion") ?? root.Value<long?>("editVersion") ?? 0L,
        };

        var exported = root.Value<string>("ExportedUtc") ?? root.Value<string>("exportedUtc");
        if (!string.IsNullOrWhiteSpace(exported)
            && DateTime.TryParse(
                exported,
                CultureInfo.InvariantCulture,
                DateTimeStyles.RoundtripKind,
                out var exportedDt))
        {
            info.ExportedUtc = Timestamp.FromDateTime(exportedDt.ToUniversalTime());
        }

        return info;
    }
}
