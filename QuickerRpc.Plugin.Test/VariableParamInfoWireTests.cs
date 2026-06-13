using System.Linq;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.AgentModel.XAction.Compression;

namespace QuickerRpc.Plugin.Test;

/// <summary>
/// Subprogram IO advanced params (inputParamInfo / outputParamInfo) must survive the
/// wire (camelCase data.json) → native proto parse → compressed agent wire round trip.
/// </summary>
[TestClass]
public sealed class VariableParamInfoWireTests
{
    [TestMethod]
    public void CompressVariables_camelCase_inputParamInfo_keeps_advanced_fields()
    {
        var variables = new JArray
        {
            JObject.Parse(
                """
                {
                  "key": "tpl",
                  "isInput": true,
                  "paramName": "模板",
                  "inputParamInfo": {
                    "multiLine": true,
                    "isRequired": true,
                    "isAdvanced": true,
                    "skipEval": true,
                    "visibleExpression": "{mode}==1",
                    "selectionItems": "a|A\nb|B",
                    "onlyUseSelect": true,
                    "validationPattern": "^.+$",
                    "inputMethod": 2,
                    "variableMode": 1,
                    "textTools": "OpenFile",
                    "replaceMode": 1,
                    "allowInput": true
                  }
                }
                """),
        };

        var compressed = XActionCompressor.CompressVariables(variables);
        var info = (compressed[0] as JObject)?["inputParamInfo"] as JObject;

        Assert.IsNotNull(info, "inputParamInfo should survive wire round trip");
        Assert.AreEqual(true, info!["skipEval"]?.Value<bool>(), "skipEval must round-trip");
        Assert.AreEqual(true, info["isAdvanced"]?.Value<bool>());
        Assert.AreEqual(true, info["multiLine"]?.Value<bool>());
        Assert.AreEqual(true, info["isRequired"]?.Value<bool>());
        Assert.AreEqual(true, info["onlyUseSelect"]?.Value<bool>());
        Assert.AreEqual(true, info["allowInput"]?.Value<bool>());
        Assert.AreEqual("{mode}==1", info["visibleExpression"]?.ToString());
        Assert.AreEqual("a|A\nb|B", info["selectionItems"]?.ToString());
        Assert.AreEqual("^.+$", info["validationPattern"]?.ToString());
        Assert.AreEqual(2, info["inputMethod"]?.Value<int>());
        Assert.AreEqual(1, info["variableMode"]?.Value<int>());
        Assert.AreEqual("OpenFile", info["textTools"]?.ToString());
        Assert.AreEqual(1, info["replaceMode"]?.Value<int>());
    }

    [TestMethod]
    public void CompressVariables_camelCase_outputParamInfo_keeps_visibleExpression()
    {
        var variables = new JArray
        {
            JObject.Parse(
                """
                {
                  "key": "result",
                  "isOutput": true,
                  "outputParamInfo": { "visibleExpression": "{mode}==2" }
                }
                """),
        };

        var compressed = XActionCompressor.CompressVariables(variables);
        var info = (compressed[0] as JObject)?["outputParamInfo"] as JObject;

        Assert.IsNotNull(info, "outputParamInfo should survive wire round trip");
        Assert.AreEqual("{mode}==2", info!["visibleExpression"]?.ToString());
    }

    [TestMethod]
    public void CompressVariables_native_PascalCase_InputParamInfo_still_parses()
    {
        var variables = new JArray
        {
            JObject.Parse(
                """
                {
                  "Key": "tpl",
                  "IsInput": true,
                  "InputParamInfo": { "SkipEval": true, "MultiLine": true }
                }
                """),
        };

        var compressed = XActionCompressor.CompressVariables(variables);
        var info = (compressed[0] as JObject)?["inputParamInfo"] as JObject;

        Assert.IsNotNull(info);
        Assert.AreEqual(true, info!["skipEval"]?.Value<bool>());
        Assert.AreEqual(true, info["multiLine"]?.Value<bool>());
    }

    [TestMethod]
    public void Compress_program_with_camelCase_tableDef_keeps_fields()
    {
        var variables = new JArray
        {
            JObject.Parse(
                """
                {
                  "key": "rows",
                  "varType": "table",
                  "tableDef": {
                    "fields": [
                      { "fieldKey": "name", "label": "名称", "dictVarType": 0 }
                    ]
                  }
                }
                """),
        };

        var compressed = XActionCompressor.CompressVariables(variables);
        var tableDef = (compressed[0] as JObject)?["tableDef"] as JObject;

        Assert.IsNotNull(tableDef, "tableDef should survive wire round trip");
        var field = (tableDef!["fields"] as JArray)?.FirstOrDefault() as JObject;
        Assert.IsNotNull(field);
        Assert.AreEqual("name", field!["fieldKey"]?.ToString());
        Assert.AreEqual("名称", field["label"]?.ToString());
    }
}
