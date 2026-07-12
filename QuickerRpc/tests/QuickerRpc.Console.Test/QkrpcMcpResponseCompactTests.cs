using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Console.Mcp;

namespace QuickerRpc.Console.Test;

[TestClass]
public sealed class QkrpcMcpResponseCompactTests
{
    [TestCleanup]
    public void Cleanup() => Environment.SetEnvironmentVariable("QKRPC_MCP_VERBOSE", null);

    [TestMethod]
    public void Compact_FlattensServeEnvelopeAndTrimsBoilerplate()
    {
        const string input = """
            {
              "ok": true,
              "data": {
                "ok": true,
                "action": "get",
                "payload": {
                  "success": true,
                  "actionId": "abc",
                  "editVersion": 3,
                  "readOnly": false,
                  "patchAllowed": true,
                  "omitDefaultLiteralInputsApplied": true,
                  "subProgramCount": 0,
                  "returnMode": "structure",
                  "readSource": "catalog",
                  "compressed": { "steps": [] }
                }
              }
            }
            """;

        var output = QkrpcMcpResponseCompact.Compact(input);

        Assert.IsTrue(output.Contains("\"action\":\"get\"", StringComparison.Ordinal));
        Assert.IsTrue(output.Contains("\"actionId\":\"abc\"", StringComparison.Ordinal));
        Assert.IsFalse(output.Contains("\"data\":", StringComparison.Ordinal));
        Assert.IsFalse(output.Contains("\"payload\":", StringComparison.Ordinal));
        Assert.IsFalse(output.Contains("omitDefaultLiteralInputsApplied", StringComparison.Ordinal));
        Assert.IsFalse(output.Contains("returnMode", StringComparison.Ordinal));
        Assert.IsFalse(output.Contains("readSource", StringComparison.Ordinal));
    }

    [TestMethod]
    public void Compact_KeepsActionDesignerReadSource()
    {
        const string input = """
            {
              "ok": true,
              "data": {
                "ok": true,
                "action": "get",
                "payload": {
                  "success": true,
                  "actionId": "abc",
                  "readSource": "action-designer",
                  "compressed": { "steps": [] }
                }
              }
            }
            """;

        var output = QkrpcMcpResponseCompact.Compact(input);
        Assert.IsTrue(output.Contains("action-designer", StringComparison.Ordinal));
    }

    [TestMethod]
    public void Compact_WorkspaceSyncKeepsProjectDirOnly()
    {
        const string sync = """
            {
              "ok": true,
              "data": {
                "ok": true,
                "action": "action-extract",
                "payload": {
                  "success": true,
                  "projectDirectory": ".quicker/actions/foo",
                  "projectDirectoryAbsolute": "D:/repo/.quicker/actions/foo",
                  "actionId": "foo",
                  "editVersion": 9,
                  "writtenFiles": ["data.json"],
                  "warnings": []
                }
              }
            }
            """;

        var node = System.Text.Json.Nodes.JsonNode.Parse(sync);
        var compact = QkrpcMcpResponseCompact.CompactWorkspaceSyncNode(node)!.ToJsonString();

        Assert.IsTrue(compact.Contains(".quicker/actions/foo", StringComparison.Ordinal));
        Assert.IsFalse(compact.Contains("writtenFiles", StringComparison.Ordinal));
        Assert.IsFalse(compact.Contains("projectDirectoryAbsolute", StringComparison.Ordinal));
    }

    [TestMethod]
    public void Compact_VerboseEnvPreservesLegacyEnvelope()
    {
        Environment.SetEnvironmentVariable("QKRPC_MCP_VERBOSE", "1");
        const string input = """{"ok":true,"data":{"ok":true,"action":"get","payload":{"success":true}}}""";

        var output = QkrpcMcpResponseCompact.Compact(input);
        Assert.AreEqual(input, output);
    }
}
