using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Runtime.Serialization;

namespace QuickerRpc.Contracts.Rpc;

/// <summary>A verified destination. Reconnecting must preserve all three identity fields.</summary>
[DataContract]
public sealed class QuickerRpcHostBinding
{
    public QuickerRpcHostBinding(string hostInstanceId, string hostSessionId, string endpoint,
        int protocolVersion, int schemaVersion, string hostKind, string quickerVersion,
        IDictionary<string, bool> capabilities)
    {
        HostInstanceId = hostInstanceId ?? throw new ArgumentNullException(nameof(hostInstanceId));
        HostSessionId = hostSessionId ?? throw new ArgumentNullException(nameof(hostSessionId));
        Endpoint = endpoint ?? throw new ArgumentNullException(nameof(endpoint));
        ProtocolVersion = protocolVersion;
        SchemaVersion = schemaVersion;
        HostKind = hostKind;
        QuickerVersion = quickerVersion;
        Capabilities = new ReadOnlyDictionary<string, bool>(new Dictionary<string, bool>(capabilities, StringComparer.Ordinal));
    }

    [DataMember(Name = "hostInstanceId")] public string HostInstanceId { get; }
    [DataMember(Name = "hostSessionId")] public string HostSessionId { get; }
    [DataMember(Name = "endpoint")] public string Endpoint { get; }
    [DataMember(Name = "protocolVersion")] public int ProtocolVersion { get; }
    [DataMember(Name = "schemaVersion")] public int SchemaVersion { get; }
    [DataMember(Name = "hostKind")] public string HostKind { get; }
    [DataMember(Name = "quickerVersion")] public string QuickerVersion { get; }
    [DataMember(Name = "capabilities")] public IReadOnlyDictionary<string, bool> Capabilities { get; }

    public bool Supports(string capability) => Capabilities.TryGetValue(capability, out var supported) && supported;

    public bool SameDestination(QuickerRpcHostBinding other) => other is not null
        && HostInstanceId == other.HostInstanceId && HostSessionId == other.HostSessionId && Endpoint == other.Endpoint;
}

/// <summary>Stable machine-readable failures; callers must not retry writes for any binding failure.</summary>
public static class QuickerRpcBindingErrors
{
    public const string Required = "HOST_BINDING_REQUIRED";
    public const string Ambiguous = "HOST_SELECTION_REQUIRED";
    public const string Unavailable = "HOST_UNAVAILABLE";
    public const string Mismatch = "HOST_BINDING_MISMATCH";
    public const string Unsupported = "HOST_CAPABILITY_UNSUPPORTED";
    public const string UnknownWriteResult = "WRITE_RESULT_UNKNOWN";
    public const string InvalidHandshake = "HOST_HANDSHAKE_INVALID";
}
