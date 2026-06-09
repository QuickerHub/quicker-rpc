using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.AgentModel.Mcp;

namespace QuickerRpc.Test;

[TestClass]
public sealed class McpToolCatalogTests
{
    [TestMethod]
    public void AuthoringToolIds_includes_workspace_program_and_split_action_tools()
    {
        var ids = QkrpcMcpToolCatalog.AuthoringToolIds;
        CollectionAssert.Contains(ids, "workspace_program");
        CollectionAssert.DoesNotContain(ids, "workspace_file");
        CollectionAssert.Contains(ids, "qkrpc_action_query");
        CollectionAssert.Contains(ids, "qkrpc_action_run");
        CollectionAssert.Contains(ids, "qkrpc_action_debug");
        CollectionAssert.Contains(ids, "qkrpc_subprogram_query");
        CollectionAssert.Contains(ids, "docs");
        CollectionAssert.DoesNotContain(ids, "qkrpc_action");
        CollectionAssert.DoesNotContain(ids, "qkrpc_sync");
    }
}
