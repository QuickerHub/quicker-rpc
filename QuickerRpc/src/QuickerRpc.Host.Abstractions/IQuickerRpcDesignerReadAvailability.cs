namespace QuickerRpc.Host;

/// <summary>Optional availability for independent readonly Designer operations.</summary>
public interface IQuickerRpcDesignerReadAvailability
{
    bool IsStepQuickInsertAvailable { get; }
    bool IsToolboxModulesAvailable { get; }
    bool IsFontAwesomeGeometryAvailable { get; }
}
