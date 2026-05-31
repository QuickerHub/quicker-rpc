using System;
using System.Threading.Tasks;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Test;

internal static class QuickerRpcTestHelper
{
    public static async Task<QuickerRpcClientSession> ConnectOrInconclusiveAsync(TestContext context)
    {
        try
        {
            var session = await QuickerRpcClient.ConnectAsync(
                QuickerRpcTestSettings.ConnectTimeoutSeconds,
                QuickerRpcTestSettings.TryBootstrap).ConfigureAwait(false);
            context.WriteLine("Connected pipe: " + QuickerRpcPipeNames.ServerPipe);
            return session;
        }
        catch (QuickerRpcClientException ex)
        {
            context.WriteLine(ex.Message);
            foreach (var hint in ex.Hints)
            {
                context.WriteLine("  - " + hint);
            }

            Assert.Inconclusive(
                "QuickerRpc plugin unavailable (" + ex.ErrorCode + "). Start Quicker, load plugin, or set QUICKER_RPC_NO_BOOTSTRAP=0.");
            throw;
        }
    }
}
