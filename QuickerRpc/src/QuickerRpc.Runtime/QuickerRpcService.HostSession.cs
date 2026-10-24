using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;

namespace QuickerRpc.Runtime;

public sealed partial class QuickerRpcService
{
    public Task<QuickerRpcHostSessionInfo> GetHostSessionAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var info = _host.Info;
        var programs = _host.ActionPrograms;
        var hasPrograms = programs is not null;
        var hasSource = programs is IQuickerRpcActionProgramSourceHost
            && (programs is not IQuickerRpcActionProgramSourceAvailability availability || availability.IsProgramSourceAvailable);
        var declared = _host.Capabilities;
        var hasDesigner = _host.Designer is not null && declared.DesignerUi;
        var designerReads = _host.Designer as IQuickerRpcDesignerReadAvailability;
        var legacyV1DesignerReads = info.Kind == QuickerHostKind.V1 && hasDesigner;
        return Task.FromResult(new QuickerRpcHostSessionInfo
        {
            ProtocolVersion = CurrentProtocolVersion,
            HostSessionId = _hostSessionScope.Id,
            HostInstanceId = _hostSessionScope.InstanceId,
            Endpoint = _hostSessionScope.Endpoint,
            Host = new QuickerRpcHostDescriptor
            {
                Kind = info.Kind switch { QuickerHostKind.V1 => "v1", QuickerHostKind.V2 => "v2", _ => "unknown" },
                QuickerVersion = info.QuickerVersion,
                AdapterAssembly = info.AdapterAssembly,
            },
            Capabilities = new Dictionary<string, bool>
            {
                [QuickerRpcHostCapabilityNames.ActionSourceRead] = hasSource,
                [QuickerRpcHostCapabilityNames.ActionSourceWrite] = hasSource,
                [QuickerRpcHostCapabilityNames.ActionLegacyBodyRead] = hasPrograms,
                [QuickerRpcHostCapabilityNames.ActionLegacyBodyWrite] = hasPrograms,
                [QuickerRpcHostCapabilityNames.ActionLegacyBodyPatch] = hasPrograms,
                [QuickerRpcHostCapabilityNames.ActionPresentationWrite] = hasPrograms,
                [QuickerRpcHostCapabilityNames.ActionWriteDesignerOpenGuard] = hasPrograms && declared.EnforcesDesignerOpenGuard,
                [QuickerRpcHostCapabilityNames.DesignerContextRead] = hasDesigner,
                [QuickerRpcHostCapabilityNames.DesignerActionOpen] = hasDesigner,
                [QuickerRpcHostCapabilityNames.DesignerSubProgramOpen] = hasDesigner,
                [QuickerRpcHostCapabilityNames.DesignerQuickInsertRead] = designerReads?.IsStepQuickInsertAvailable ?? legacyV1DesignerReads,
                [QuickerRpcHostCapabilityNames.DesignerToolboxRead] = designerReads?.IsToolboxModulesAvailable ?? legacyV1DesignerReads,
                [QuickerRpcHostCapabilityNames.DesignerFontAwesomeResolve] = designerReads?.IsFontAwesomeGeometryAvailable ?? legacyV1DesignerReads,
                [QuickerRpcHostCapabilityNames.DesignerFontAwesomePageRead] = (_host.Designer as IQuickerRpcDesignerFontAwesomePageHost)?.IsFontAwesomePageAvailable ?? false,
            },
        });
    }
}
