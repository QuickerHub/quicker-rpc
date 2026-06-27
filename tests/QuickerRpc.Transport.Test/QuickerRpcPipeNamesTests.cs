using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Transport;

namespace QuickerRpc.Transport.Test;

[TestClass]
public sealed class QuickerRpcPipeNamesTests
{
    [TestMethod]
    public void ServerPipe_is_stable()
    {
        Assert.AreEqual("QuickerRpc_Server_QRPC2026", QuickerRpcPipeNames.ServerPipe);
    }
}
