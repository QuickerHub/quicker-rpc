using System;
using System.IO;
using System.Linq;
using Google.Protobuf.WellKnownTypes;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.Proto.V1;
using QuickerRpc.AgentModel.XAction.Project;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class ActionProjectExtractWriterTests
{
    [TestMethod]
    public void Write_creates_data_json_after_resource_files()
    {
        var root = Path.Combine(Path.GetTempPath(), "qkrpc-extract-writer-" + Guid.NewGuid().ToString("N"));
        try
        {
            var data = new JObject
            {
                ["steps"] = new JArray(),
                ["variables"] = new JArray(),
            };
            var resources = new[]
            {
                new ActionProjectResourceFile
                {
                    RelativePath = "files/a.cs",
                    Content = "class A {}",
                },
                new ActionProjectResourceFile
                {
                    RelativePath = "files/b.cs",
                    Content = "class B {}",
                },
            };

            ActionProjectExtractWriter.Write(
                root,
                new ActionProjectInfo
                {
                    Id = Guid.NewGuid().ToString(),
                    Title = "Order",
                    EditVersion = 1,
                    ExportedUtc = Timestamp.FromDateTime(DateTime.UtcNow),
                },
                data,
                resources);

            var dataPath = QuickerProjectLayout.GetDataPath(root);
            var dataTime = File.GetLastWriteTimeUtc(dataPath);
            foreach (var rel in resources.Select(r => r.RelativePath))
            {
                var full = Path.Combine(root, rel.Replace('/', Path.DirectorySeparatorChar));
                Assert.IsTrue(File.Exists(full), $"missing {rel}");
                Assert.IsTrue(
                    dataTime >= File.GetLastWriteTimeUtc(full),
                    $"data.json should be written after {rel}");
            }

            Assert.IsTrue(File.Exists(QuickerProjectLayout.GetInfoPath(root)));
        }
        finally
        {
            if (Directory.Exists(root))
            {
                Directory.Delete(root, recursive: true);
            }
        }
    }
}
