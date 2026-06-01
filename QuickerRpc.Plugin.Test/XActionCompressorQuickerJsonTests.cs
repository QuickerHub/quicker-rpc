using System.Linq;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.AgentModel.XAction.Compression;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class XActionCompressorQuickerJsonTests
{
    [TestMethod]
    public void Compress_QuickerPascalCase_steps_omit_null_param_wrappers()
    {
        var steps = new JArray
        {
            JObject.Parse(
                """
                {
                  "StepRunnerKey": "sys:subprogram",
                  "InputParams": {
                    "subProgram": { "VarKey": null, "Value": "%%44e8b90d-9a97-4525-8bcc-96f10d1a9c7e" },
                    "stopIfFail": { "VarKey": null, "Value": "1" }
                  },
                  "Disabled": false,
                  "DelayMs": 0,
                  "Note": ""
                }
                """),
        };

        var catalog = new StepRunnerCatalog { Items = new System.Collections.Generic.List<StepRunnerDefinition>() };
        var compressed = XActionCompressor.Compress(steps, new JArray(), catalog, omitDefaultLiteralInputs: true);

        var step = (JObject)compressed["steps"]![0]!;
        Assert.AreEqual("sys:subprogram", step["stepRunnerKey"]?.ToString());
        Assert.IsNull(step["StepRunnerKey"], "PascalCase runner key should be normalized away");

        var subProgram = step["inputParams"]?["subProgram"] as JObject;
        Assert.IsNotNull(subProgram);
        Assert.AreEqual("%%44e8b90d-9a97-4525-8bcc-96f10d1a9c7e", subProgram!["value"]?.ToString());
        Assert.IsNull(subProgram!["VarKey"]);
        Assert.IsNull(subProgram!["varKey"]);
        Assert.IsFalse(step.Properties().Any(p => p.Name == "disabled"));
        Assert.IsFalse(step.Properties().Any(p => p.Name == "Disabled"));
    }
}
