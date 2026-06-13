using System;
using System.IO;
using System.Linq;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction.Project;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class ProgramWireSchemaValidatorTests
{
    [TestMethod]
    public void Unknown_step_field_reports_path_and_suggestion()
    {
        var data = JObject.Parse("""
            {
              "steps": [
                { "stepkey": "sys:getClipboardText", "outputParams": { "text": "clip" } }
              ],
              "variables": [ { "key": "clip" } ]
            }
            """);

        var issues = ProgramWireSchemaValidator.Validate(data);

        var unknown = issues.Single(i => i.Code == "UNKNOWN_STEP_FIELD");
        Assert.AreEqual("steps[0].stepkey", unknown.Path);
        Assert.IsNotNull(unknown.Line);
        StringAssert.Contains(unknown.Message, "stepkey");

        var missing = issues.Single(i => i.Code == "MISSING_STEP_RUNNER_KEY");
        Assert.AreEqual("steps[0]", missing.Path);
        StringAssert.Contains(missing.Message, "stepRunnerKey");
    }

    [TestMethod]
    public void Misspelled_stepRunnerKey_suggests_canonical_name()
    {
        var data = JObject.Parse("""
            {
              "steps": [ { "stepRunerKey": "sys:if" } ],
              "variables": []
            }
            """);

        var issues = ProgramWireSchemaValidator.Validate(data);
        var unknown = issues.Single(i => i.Code == "UNKNOWN_STEP_FIELD");
        StringAssert.Contains(unknown.Message, "\"stepRunnerKey\"");
    }

    [TestMethod]
    public void Snake_case_step_field_suggests_camel_case()
    {
        var data = JObject.Parse("""
            {
              "steps": [ { "step_runner_key": "sys:if" } ],
              "variables": []
            }
            """);

        var issues = ProgramWireSchemaValidator.Validate(data);
        var unknown = issues.Single(i => i.Code == "UNKNOWN_STEP_FIELD");
        StringAssert.Contains(unknown.Message, "\"stepRunnerKey\"");
    }

    [TestMethod]
    public void Nested_branch_steps_are_validated_with_path()
    {
        var data = JObject.Parse("""
            {
              "steps": [
                {
                  "stepRunnerKey": "sys:if",
                  "inputParams": { "condition": "$= 1 == 1" },
                  "ifSteps": [ { "runnerKey": "sys:showMessage" } ]
                }
              ],
              "variables": []
            }
            """);

        var issues = ProgramWireSchemaValidator.Validate(data);
        var unknown = issues.Single(i => i.Code == "UNKNOWN_STEP_FIELD");
        Assert.AreEqual("steps[0].ifSteps[0].runnerKey", unknown.Path);
        StringAssert.Contains(unknown.Message, "\"stepRunnerKey\"");
        Assert.IsTrue(issues.Any(i =>
            i.Code == "MISSING_STEP_RUNNER_KEY" && i.Path == "steps[0].ifSteps[0]"));
    }

    [TestMethod]
    public void Wire_bind_suffix_keys_must_be_strings()
    {
        var data = JObject.Parse("""
            {
              "steps": [
                {
                  "stepRunnerKey": "sys:evalexpression",
                  "inputParams": { "expression.var": 123 }
                }
              ],
              "variables": []
            }
            """);

        var issues = ProgramWireSchemaValidator.Validate(data);
        var bind = issues.Single(i => i.Code == "INVALID_INPUT_PARAM_BIND");
        Assert.AreEqual("steps[0].inputParams.expression.var", bind.Path);
    }

    [TestMethod]
    public void Unknown_variable_field_and_invalid_varType_are_reported()
    {
        var data = JObject.Parse("""
            {
              "steps": [],
              "variables": [
                { "key": "a", "vartype": "strnig" },
                { "desc": "missing key" }
              ]
            }
            """);

        var issues = ProgramWireSchemaValidator.Validate(data);

        var unknown = issues.Single(i => i.Code == "UNKNOWN_VARIABLE_FIELD");
        Assert.AreEqual("variables[0].vartype", unknown.Path);
        StringAssert.Contains(unknown.Message, "\"varType\"");

        Assert.IsTrue(issues.Any(i =>
            i.Code == "MISSING_VARIABLE_KEY" && i.Path == "variables[1]"));
    }

    [TestMethod]
    public void Invalid_varType_value_lists_allowed_names()
    {
        var data = JObject.Parse("""
            {
              "steps": [],
              "variables": [ { "key": "a", "varType": "strnig" } ]
            }
            """);

        var issues = ProgramWireSchemaValidator.Validate(data);
        var invalid = issues.Single(i => i.Code == "INVALID_VAR_TYPE");
        Assert.AreEqual("variables[0].varType", invalid.Path);
        StringAssert.Contains(invalid.Message, "integer");
    }

    [TestMethod]
    public void Field_type_errors_are_reported()
    {
        var data = JObject.Parse("""
            {
              "steps": [
                {
                  "stepRunnerKey": "sys:if",
                  "ifSteps": { "oops": true },
                  "disabled": "yes",
                  "outputParams": { "result": { "var": "x" } }
                }
              ],
              "variables": []
            }
            """);

        var issues = ProgramWireSchemaValidator.Validate(data);
        Assert.IsTrue(issues.Any(i =>
            i.Code == "INVALID_FIELD_TYPE" && i.Path == "steps[0].ifSteps"));
        Assert.IsTrue(issues.Any(i =>
            i.Code == "INVALID_FIELD_TYPE" && i.Path == "steps[0].disabled"));
        Assert.IsTrue(issues.Any(i =>
            i.Code == "INVALID_OUTPUT_PARAM" && i.Path == "steps[0].outputParams.result"));
    }

    [TestMethod]
    public void Unknown_inputParamInfo_field_is_reported_with_suggestion()
    {
        var data = JObject.Parse("""
            {
              "steps": [],
              "variables": [
                {
                  "key": "tpl",
                  "isInput": true,
                  "inputParamInfo": { "skipEvaluation": true, "isRequired": "yes" }
                },
                {
                  "key": "result",
                  "isOutput": true,
                  "outputParamInfo": { "visibleExpr": "{mode}==1" }
                }
              ]
            }
            """);

        var issues = ProgramWireSchemaValidator.Validate(data);

        var unknownInput = issues.Single(i => i.Code == "UNKNOWN_INPUT_PARAM_INFO_FIELD");
        Assert.AreEqual("variables[0].inputParamInfo.skipEvaluation", unknownInput.Path);
        StringAssert.Contains(unknownInput.Message, "\"skipEval\"");

        Assert.IsTrue(issues.Any(i =>
            i.Code == "INVALID_FIELD_TYPE" && i.Path == "variables[0].inputParamInfo.isRequired"));

        var unknownOutput = issues.Single(i => i.Code == "UNKNOWN_OUTPUT_PARAM_INFO_FIELD");
        Assert.AreEqual("variables[1].outputParamInfo.visibleExpr", unknownOutput.Path);
        StringAssert.Contains(unknownOutput.Message, "\"visibleExpression\"");
    }

    [TestMethod]
    public void Valid_inputParamInfo_advanced_fields_pass()
    {
        var data = JObject.Parse("""
            {
              "steps": [],
              "variables": [
                {
                  "key": "pattern",
                  "isInput": true,
                  "paramName": "正则模板",
                  "inputParamInfo": {
                    "isAdvanced": true,
                    "skipEval": true,
                    "isRequired": true,
                    "multiLine": true,
                    "inputMethod": 2,
                    "variableMode": 0,
                    "replaceMode": 1,
                    "selectionItems": "a|A",
                    "onlyUseSelect": false,
                    "allowInput": true,
                    "validationPattern": "^.+$",
                    "textTools": "OpenFile",
                    "visibleExpression": "{mode}==1"
                  }
                },
                {
                  "key": "result",
                  "isOutput": true,
                  "outputParamInfo": { "visibleExpression": "{mode}==2" }
                }
              ]
            }
            """);

        var issues = ProgramWireSchemaValidator.Validate(data);
        Assert.AreEqual(0, issues.Count, string.Join("\n", issues));
    }

    [TestMethod]
    public void Valid_wire_passes_including_pascal_case_and_wire_keys()
    {
        var data = JObject.Parse("""
            {
              "steps": [
                {
                  "StepRunnerKey": "sys:evalexpression",
                  "inputParams": { "expression.file": "files/calc.eval.cs", "paths.var": "urls" },
                  "outputParams": { "result": "count" },
                  "note": "ok",
                  "disabled": false,
                  "delayMs": 100
                },
                {
                  "stepRunnerKey": "sys:if",
                  "ifSteps": [ { "stepRunnerKey": "sys:showMessage", "inputParams": { "message": "hi" } } ],
                  "elseSteps": []
                }
              ],
              "variables": [
                { "key": "urls", "default.file": "files/urls.txt" },
                { "key": "count", "varType": "number", "default": "0", "saveState": true },
                {
                  "key": "cmd",
                  "isInput": true,
                  "paramName": "命令行",
                  "inputParamInfo": { "multiLine": true }
                }
              ]
            }
            """);

        var issues = ProgramWireSchemaValidator.Validate(data);
        Assert.AreEqual(0, issues.Count, string.Join("\n", issues));
    }

    [TestMethod]
    public void Compile_blocks_on_schema_errors()
    {
        var data = new JObject
        {
            ["steps"] = new JArray
            {
                new JObject { ["stepkey"] = "sys:getClipboardText" },
            },
            ["variables"] = new JArray(),
        };

        var result = XActionFileRefCompiler.Compile(data, Path.GetTempPath());
        Assert.IsFalse(result.Success);
        StringAssert.Contains(result.ErrorMessage!, "schema error");
        StringAssert.Contains(result.ErrorMessage!, "steps[0]");
    }

    [TestMethod]
    public void Validate_reads_raw_data_json_for_line_numbers()
    {
        var root = Path.Combine(Path.GetTempPath(), "qkrpc-schema-" + Guid.NewGuid().ToString("N"));
        try
        {
            Directory.CreateDirectory(root);
            File.WriteAllText(
                Path.Combine(root, "data.json"),
                """
                {
                  "steps": [
                    {
                      "stepkey": "sys:getClipboardText"
                    }
                  ],
                  "variables": []
                }
                """,
                System.Text.Encoding.UTF8);

            var data = QuickerProjectFiles.ReadData(root);
            var result = XActionFileRefValidator.Validate(data, root);

            Assert.IsFalse(result.Success);
            Assert.IsTrue(result.SchemaIssues.Count >= 1, result.ErrorMessage);
            var unknown = result.SchemaIssues.Single(i => i.Code == "UNKNOWN_STEP_FIELD");
            Assert.AreEqual(4, unknown.Line);
            StringAssert.Contains(result.ErrorMessage!, "steps[0]");
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
