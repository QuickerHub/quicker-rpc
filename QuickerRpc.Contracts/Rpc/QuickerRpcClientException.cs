using System;
using System.Collections.Generic;

namespace QuickerRpc.Contracts.Rpc;

/// <summary>Failed to connect to the QuickerRpc plugin named pipe.</summary>
public sealed class QuickerRpcClientException : Exception
{
    public QuickerRpcClientException(string errorCode, string message, IReadOnlyList<string>? hints = null)
        : base(message)
    {
        ErrorCode = errorCode;
        Hints = hints ?? Array.Empty<string>();
    }

    public string ErrorCode { get; }

    public IReadOnlyList<string> Hints { get; }
}
