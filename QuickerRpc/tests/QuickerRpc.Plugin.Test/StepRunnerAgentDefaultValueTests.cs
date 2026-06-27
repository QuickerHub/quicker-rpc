using System;
using System.Collections.Generic;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.AgentModel.Catalog;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class StepRunnerAgentDefaultValueTests
{
    [TestMethod]
    public void FormatForAgent_Boolean_emits_json_bool_not_one_zero()
    {
        Assert.AreEqual(true, StepRunnerAgentDefaultValue.FormatForAgent(2, "1"));
        Assert.AreEqual(false, StepRunnerAgentDefaultValue.FormatForAgent(2, "0"));
        Assert.AreEqual(true, StepRunnerAgentDefaultValue.FormatForAgent(2, "true"));
        Assert.AreEqual(false, StepRunnerAgentDefaultValue.FormatForAgent(2, "false"));
    }

    [TestMethod]
    public void FormatForAgent_nonBoolean_keeps_string()
    {
        Assert.AreEqual("100", StepRunnerAgentDefaultValue.FormatForAgent(1, "100"));
        Assert.AreEqual("GET", StepRunnerAgentDefaultValue.FormatForAgent(9, "GET"));
    }

    [TestMethod]
    public void NormalizeCatalogDefault_Boolean_to_true_false_strings()
    {
        Assert.AreEqual("true", StepRunnerAgentDefaultValue.NormalizeCatalogDefault(2, "1"));
        Assert.AreEqual("false", StepRunnerAgentDefaultValue.NormalizeCatalogDefault(2, "0"));
    }

    [TestMethod]
    public void GetDetail_http_stopIfFail_default_serializes_as_json_boolean()
    {
        var catalog = new StepRunnerCatalog
        {
            Items = new List<StepRunnerDefinition>
            {
                new()
                {
                    Key = "sys:http",
                    Name = "HTTP",
                    InputParamDefs = new List<StepRunnerInputParamDef>
                    {
                        new()
                        {
                            Key = "stopIfFail",
                            VarType = 2,
                            DefaultValue = "1",
                        },
                        new()
                        {
                            Key = "skipCertVerify",
                            VarType = 2,
                            DefaultValue = "0",
                        },
                    },
                },
            },
        };

        var mapped = StepRunnerCatalogMapper.GetDetail(catalog, "sys:http");
        Assert.IsTrue(mapped.Success);

        var json = StepRunnerAgentSchemaJson.Serialize(mapped.Schema!);
        StringAssert.Contains(json, "\"key\":\"stopIfFail\"");
        StringAssert.Contains(json, "\"default\":true");
        StringAssert.Contains(json, "\"key\":\"skipCertVerify\"");
        StringAssert.Contains(json, "\"default\":false");
        Assert.IsTrue(json.IndexOf("\"default\":\"1\"", StringComparison.Ordinal) < 0);
        Assert.IsTrue(json.IndexOf("\"default\":\"0\"", StringComparison.Ordinal) < 0);
    }
}
