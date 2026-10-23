using System.Collections.Generic;
using System.Runtime.Serialization;

namespace QuickerRpc.Contracts.Rpc;

/// <summary>Read-only identity and implemented action ports for one loaded host owner.</summary>
[DataContract]
public sealed class QuickerRpcHostSessionInfo
{
    [DataMember(Name = "service")]
    public string Service { get; set; } = "qkrpc";

    /// <summary>Version of this handshake shape, not the YAML bundle or program-body format.</summary>
    [DataMember(Name = "schemaVersion")]
    public int SchemaVersion { get; set; } = 1;

    [DataMember(Name = "protocolVersion")]
    public int ProtocolVersion { get; set; }

    /// <summary>Stable for this plugin bootstrap owner; reconnecting does not create a new identity.</summary>
    [DataMember(Name = "hostSessionId")]
    public string HostSessionId { get; set; } = string.Empty;

    [DataMember(Name = "host")]
    public QuickerRpcHostDescriptor Host { get; set; } = new();

    [DataMember(Name = "capabilities")]
    public IDictionary<string, bool> Capabilities { get; set; } = new Dictionary<string, bool>();
}

[DataContract]
public sealed class QuickerRpcHostDescriptor
{
    [DataMember(Name = "kind")]
    public string Kind { get; set; } = "unknown";

    [DataMember(Name = "quickerVersion")]
    public string QuickerVersion { get; set; } = string.Empty;

    [DataMember(Name = "adapterAssembly")]
    public string AdapterAssembly { get; set; } = string.Empty;
}

/// <summary>Only these declared operations are described; omitted capabilities remain unknown.</summary>
public static class QuickerRpcHostCapabilityNames
{
    public const string ActionSourceRead = "action.source.read";
    public const string ActionSourceWrite = "action.source.write";
    public const string ActionLegacyBodyRead = "action.legacyBody.read";
    public const string ActionLegacyBodyWrite = "action.legacyBody.write";
    public const string ActionLegacyBodyPatch = "action.legacyBody.patch";
    public const string ActionPresentationWrite = "action.presentation.write";
    public const string ActionWriteDesignerOpenGuard = "action.write.designerOpenGuard";
    public const string DesignerContextRead = "designer.context.read";
    public const string DesignerActionOpen = "designer.action.open";
    public const string DesignerSubProgramOpen = "designer.subprogram.open";
}
