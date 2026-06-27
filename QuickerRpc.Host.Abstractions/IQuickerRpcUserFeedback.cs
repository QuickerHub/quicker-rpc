namespace QuickerRpc.Host;

/// <summary>Optional user-visible success/error toasts after mutating RPCs (V1 popup; V2 may no-op).</summary>
public interface IQuickerRpcUserFeedback
{
    void Success(string message);

    void Error(string message);
}
