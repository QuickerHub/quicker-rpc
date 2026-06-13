namespace QuickerRpc.Host;

/// <summary>Quicker process storage/runtime generation. V1 and V2 never coexist in one process.</summary>
public enum QuickerHostKind
{
    V1 = 1,
    V2 = 2,
}
