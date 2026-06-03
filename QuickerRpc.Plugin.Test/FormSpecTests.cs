using System;
using System.IO;
using System.Linq;
using System.Text;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.Form;
using QuickerRpc.AgentModel.Proto.V1;
using QuickerRpc.AgentModel.XAction;
using QuickerRpc.AgentModel.XAction.Project;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class FormSpecTests
{
    private const string VariablesSpec = """
        {
          "$schema": "qkrpc.form.v1",
          "mode": "variables",
          "title": "填写信息",
          "fields": [
            {
              "key": "userName",
              "label": "姓名",
              "type": "text",
              "required": true
            },
            {
              "key": "age",
              "label": "年龄",
              "type": "integer",
              "min": 0,
              "max": 120,
              "default": "18"
            },
            {
              "key": "gender",
              "label": "性别",
              "type": "select",
              "options": [
                { "value": "male", "label": "男" },
                { "value": "female", "label": "女" }
              ],
              "default": "male"
            }
          ]
        }
        """;

    [TestMethod]
    public void Validate_accepts_variables_spec()
    {
        var parse = FormSpecCompiler.TryParse(VariablesSpec);
        Assert.IsTrue(parse.Success, parse.ErrorMessage);

        var validation = FormSpecValidator.Validate(parse.Spec);
        Assert.IsTrue(validation.Success, string.Join("; ", validation.Issues.Select(i => i.Message)));
    }

    [TestMethod]
    public void Build_compiles_variables_step_with_formDef()
    {
        var result = FormSpecCompiler.BuildFromJson(VariablesSpec);
        Assert.IsTrue(result.Success, string.Join("; ", result.Issues.Select(i => i.Message)));
        Assert.AreEqual("variables", result.Mode);
        Assert.AreEqual("formDef", result.FormParamKey);

        var step = JObject.Parse(result.StepJson!);
        Assert.AreEqual("sys:form", step.Value<string>("stepRunnerKey"));
        Assert.AreEqual("variables", step["inputParams"]!["operation"]!["value"]!.Value<string>());
        Assert.IsNotNull(step["inputParams"]!["formDef"]);

        var native = JObject.Parse(result.NativeFormJson!);
        var fields = (JArray)native["fields"]!;
        Assert.AreEqual(3, fields.Count);
        Assert.AreEqual("TextBox", fields[0]!["InputMethod"]!.Value<string>());
        Assert.AreEqual("NumberBox", fields[1]!["InputMethod"]!.Value<string>());
        Assert.AreEqual("DropDown", fields[2]!["InputMethod"]!.Value<string>());
        Assert.AreEqual("male|男\nfemale|女", fields[2]!["SelectionItems"]!.Value<string>());
    }

    [TestMethod]
    public void Build_compiles_dict_dynamic_step()
    {
        const string spec = """
            {
              "$schema": "qkrpc.form.v1",
              "mode": "dict_dynamic",
              "title": "编辑词典",
              "dictVar": "data",
              "fields": [
                { "key": "name", "label": "名称", "type": "text" }
              ]
            }
            """;

        var result = FormSpecCompiler.BuildFromJson(spec);
        Assert.IsTrue(result.Success);
        Assert.AreEqual("dynamicFormForDictDef", result.FormParamKey);

        var step = JObject.Parse(result.StepJson!);
        Assert.AreEqual("data", step["inputParams"]!["dictVar"]!["varKey"]!.Value<string>());
        Assert.AreEqual("name", JObject.Parse(result.NativeFormJson!)["fields"]![0]!["FieldKey"]!.Value<string>());
    }

    [TestMethod]
    public void Validate_rejects_select_without_options()
    {
        const string spec = """
            {
              "mode": "variables",
              "title": "x",
              "fields": [
                { "key": "x", "label": "X", "type": "select" }
              ]
            }
            """;

        var parse = FormSpecCompiler.TryParse(spec);
        var validation = FormSpecValidator.Validate(parse.Spec);
        Assert.IsFalse(validation.Success);
        Assert.IsTrue(validation.Issues.Any(i => i.Path.Contains("options")));
    }

    [TestMethod]
    public void Validate_rejects_invalid_field_key()
    {
        const string spec = """
            {
              "mode": "variables",
              "title": "x",
              "fields": [
                { "key": "1bad", "label": "X", "type": "text" }
              ]
            }
            """;

        var parse = FormSpecCompiler.TryParse(spec);
        var validation = FormSpecValidator.Validate(parse.Spec);
        Assert.IsFalse(validation.Success);
        Assert.IsTrue(validation.Issues.Any(i => i.Path.EndsWith(".key")));
    }

    [TestMethod]
    public void Build_compiles_visible_when_expression()
    {
        const string spec = """
            {
              "mode": "variables",
              "title": "x",
              "fields": [
                { "key": "kind", "label": "类型", "type": "text" },
                {
                  "key": "detail",
                  "label": "详情",
                  "type": "text",
                  "visibleWhen": { "field": "kind", "eq": "custom" }
                }
              ]
            }
            """;

        var result = FormSpecCompiler.BuildFromJson(spec);
        Assert.IsTrue(result.Success);
        var fields = (JArray)JObject.Parse(result.NativeFormJson!)["fields"]!;
        Assert.AreEqual("kind=='custom'", fields[1]!["VisibleExpression"]!.Value<string>());
    }

    [TestMethod]
    public void TryParse_accepts_embedded_json_object()
    {
        var token = JObject.Parse("""
            {
              "mode": "variables",
              "title": "填写",
              "fields": [
                { "key": "name", "label": "姓名", "type": "text" }
              ]
            }
            """);

        var parse = FormSpecCompiler.TryParse(token);
        Assert.IsTrue(parse.Success, parse.ErrorMessage);
        Assert.AreEqual("variables", parse.Spec!.Mode);
    }

    [TestMethod]
    public void Patch_preprocess_compiles_formDef_file_into_native_value()
    {
        var root = Path.Combine(Path.GetTempPath(), "qkrpc-form-def-" + Guid.NewGuid().ToString("N"));
        try
        {
            Directory.CreateDirectory(Path.Combine(root, "files"));
            const string spec = """
                {
                  "mode": "variables",
                  "title": "填写",
                  "fields": [
                    { "key": "userName", "label": "姓名", "type": "text" }
                  ]
                }
                """;
            File.WriteAllText(Path.Combine(root, "files", "login.form.json"), spec, Encoding.UTF8);

            var patch = new JObject
            {
                ["steps"] = new JArray
                {
                    new JObject
                    {
                        ["stepRunnerKey"] = "sys:form",
                        ["inputParams"] = new JObject
                        {
                            ["operation"] = new JObject { ["value"] = "variables" },
                            ["formDef"] = new JObject { ["file"] = "files/login.form.json" },
                        },
                    },
                },
            };

            var preprocess = XActionFormSpecCompiler.CompilePatch(patch, root);
            Assert.IsTrue(preprocess.Success, preprocess.ErrorMessage);

            var formDef = patch["steps"]![0]!["inputParams"]!["formDef"] as JObject;
            Assert.IsNotNull(formDef!["value"]);
            Assert.IsNull(formDef["file"]);
            var native = JObject.Parse(formDef["value"]!.Value<string>()!);
            Assert.AreEqual("userName", native["fields"]![0]!["FieldKey"]!.Value<string>());
        }
        finally
        {
            if (Directory.Exists(root))
            {
                Directory.Delete(root, recursive: true);
            }
        }
    }

    [TestMethod]
    public void FileRefCompiler_compiles_formDef_file_and_preserves_workspace_data()
    {
        var root = Path.Combine(Path.GetTempPath(), "qkrpc-form-spec-" + Guid.NewGuid().ToString("N"));
        try
        {
            Directory.CreateDirectory(Path.Combine(root, "files"));
            const string spec = """
                {
                  "mode": "variables",
                  "title": "填写",
                  "fields": [
                    { "key": "userName", "label": "姓名", "type": "text" }
                  ]
                }
                """;
            File.WriteAllText(Path.Combine(root, "files", "login.form.json"), spec, Encoding.UTF8);

            var data = new JObject
            {
                ["steps"] = new JArray
                {
                    new JObject
                    {
                        ["stepRunnerKey"] = "sys:form",
                        ["inputParams"] = new JObject
                        {
                            ["operation"] = new JObject { ["value"] = "variables" },
                            ["formDef"] = new JObject { ["file"] = "files/login.form.json" },
                        },
                    },
                },
                ["variables"] = new JArray(),
            };

            var result = XActionFileRefCompiler.Compile(data, root);
            Assert.IsTrue(result.Success, result.ErrorMessage);

            var workspaceFormDef = data["steps"]![0]!["inputParams"]!["formDef"] as JObject;
            Assert.AreEqual("files/login.form.json", workspaceFormDef!["file"]!.Value<string>());
            Assert.IsNull(workspaceFormDef["value"]);

            var compiledFormDef = result.CompiledData!["steps"]![0]!["inputParams"]!["formDef"] as JObject;
            Assert.IsNotNull(compiledFormDef!["value"]);
            Assert.IsNull(compiledFormDef["file"]);
            Assert.IsFalse(FormSpecDocumentShape.LooksLikeFormSpecText(compiledFormDef["value"]!.Value<string>()));
        }
        finally
        {
            if (Directory.Exists(root))
            {
                Directory.Delete(root, recursive: true);
            }
        }
    }

    [TestMethod]
    public void Decompile_quicker_pascal_case_fields_and_enum_input_method()
    {
        const string native = """
            {
              "Fields": [
                {
                  "FieldKey": "capType",
                  "Label": "截图方式",
                  "InputMethod": 3,
                  "SelectionItems": "单次截图|单次"
                }
              ]
            }
            """;

        var decompile = FormSpecDecompiler.TryDecompile(
            native,
            new FormSpecDecompiler.DecompileContext { Mode = "variables", Title = "表单" });
        Assert.IsTrue(decompile.Success, decompile.ErrorMessage);
        Assert.AreEqual("select", decompile.Spec!.Fields[0].Type);
        Assert.AreEqual("capType", decompile.Spec.Fields[0].Key);

        var export = new JObject
        {
            ["steps"] = new JArray
            {
                new JObject
                {
                    ["stepRunnerKey"] = "sys:form",
                    ["inputParams"] = new JObject
                    {
                        ["operation"] = new JObject { ["value"] = "variables" },
                        ["formDef"] = new JObject { ["value"] = native },
                    },
                },
            },
            ["variables"] = new JArray(),
        };

        var result = XActionFileRefExporter.Export(export, Path.GetTempPath(), templateData: null);
        Assert.IsTrue(result.Success, result.ErrorMessage);
        var formDef = result.ExportedData!["steps"]![0]!["inputParams"]!["formDef"] as JObject;
        Assert.IsNotNull(formDef!["file"]);
        Assert.IsNull(formDef["value"]);
    }

    [TestMethod]
    public void Normalize_on_disk_writes_form_file_for_pascal_case_native()
    {
        var projectDir = Path.Combine(Path.GetTempPath(), "qkrpc-form-norm-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(projectDir);
        try
        {
            const string native = """
                {
                  "Fields": [
                    {
                      "FieldKey": "capType",
                      "Label": "截图方式",
                      "InputMethod": 3,
                      "SelectionItems": "单次|单次"
                    }
                  ]
                }
                """;

            var data = new JObject
            {
                ["steps"] = new JArray
                {
                    new JObject
                    {
                        ["stepId"] = "s1",
                        ["stepRunnerKey"] = "sys:form",
                        ["inputParams"] = new JObject
                        {
                            ["operation"] = new JObject { ["value"] = "variables" },
                            ["formDef"] = new JObject { ["value"] = native },
                        },
                    },
                },
                ["variables"] = new JArray(),
            };

            QuickerProjectFiles.WriteData(projectDir, data);
            var result = ActionProjectFormDefNormalizer.TryApplyToProject(projectDir);
            Assert.IsTrue(result.Changed);
            Assert.IsTrue(result.ResourceFilesWritten > 0);

            var after = QuickerProjectFiles.ReadData(projectDir);
            var formDef = after["steps"]![0]!["inputParams"]!["formDef"] as JObject;
            Assert.IsNotNull(formDef!["file"]);
            Assert.IsNull(formDef["value"]);
        }
        finally
        {
            if (Directory.Exists(projectDir))
            {
                Directory.Delete(projectDir, recursive: true);
            }
        }
    }

    [TestMethod]
    public void Export_refreshes_existing_form_json_when_only_formDef_file_in_data()
    {
        var projectDir = Path.Combine(Path.GetTempPath(), "qkrpc-form-refresh-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Path.Combine(projectDir, "files"));
        try
        {
            const string escaped = """
                {
                  "$schema": "qkrpc.form.v1",
                  "mode": "variables",
                  "title": "\u622A\u56FE\u8BBE\u7F6E - \u9AD8\u7CBE\u5EA6OCR",
                  "fields": [
                    {
                      "key": "capType",
                      "label": "\u622A\u56FE\u65B9\u5F0F",
                      "type": "select"
                    }
                  ]
                }
                """;

            File.WriteAllText(
                Path.Combine(projectDir, "files", "form1.form.json"),
                escaped,
                Encoding.UTF8);

            var latest = new JObject
            {
                ["steps"] = new JArray
                {
                    new JObject
                    {
                        ["stepId"] = "step-form",
                        ["stepRunnerKey"] = "sys:form",
                        ["inputParams"] = new JObject
                        {
                            ["operation"] = new JObject { ["value"] = "variables" },
                            ["formDef"] = new JObject { ["file"] = "files/form1.form.json" },
                        },
                    },
                },
                ["variables"] = new JArray(),
            };

            var template = (JObject)latest.DeepClone();
            var result = XActionFileRefExporter.Export(latest, projectDir, template);
            Assert.IsTrue(result.Success, result.ErrorMessage);
            Assert.IsTrue(result.ResourceFiles.Count > 0, "expected form resource refresh");

            var written = result.ResourceFiles.First(f =>
                f.RelativePath.EndsWith("form1.form.json", StringComparison.OrdinalIgnoreCase));
            StringAssert.Contains(written.Content, "截图设置");
            Assert.IsFalse(written.Content.Contains("\\u622A", StringComparison.Ordinal));

            ActionProjectExtractWriter.Write(
                projectDir,
                new ActionProjectInfo { Id = Guid.NewGuid().ToString(), Title = "t", EditVersion = 1 },
                result.ExportedData!,
                result.ResourceFiles);

            var onDisk = File.ReadAllText(Path.Combine(projectDir, "files", "form1.form.json"), Encoding.UTF8);
            StringAssert.Contains(onDisk, "截图设置");
            Assert.IsFalse(onDisk.Contains("\\u622A", StringComparison.Ordinal));
        }
        finally
        {
            if (Directory.Exists(projectDir))
            {
                Directory.Delete(projectDir, recursive: true);
            }
        }
    }

    [TestMethod]
    public void NormalizeFormSpecFileContent_rewrites_unicode_escapes_to_cjk()
    {
        const string escaped = """
            {
              "$schema": "qkrpc.form.v1",
              "mode": "variables",
              "title": "\u8BBE\u7F6E - \u622A\u56FEOCR",
              "fields": [
                {
                  "key": "showWindow",
                  "label": "\u663E\u793A\u7A97\u53E3",
                  "type": "checkbox"
                }
              ]
            }
            """;

        var normalized = FormSpecDecompiler.NormalizeFormSpecFileContent(escaped);
        StringAssert.Contains(normalized, "设置 - 截图OCR");
        StringAssert.Contains(normalized, "显示窗口");
        Assert.IsFalse(normalized.Contains("\\u8BBE", StringComparison.Ordinal));
    }

    [TestMethod]
    public void Serialize_writes_user_reported_title_without_unicode_escapes()
    {
        var spec = new FormSpecDocument
        {
            Mode = "variables",
            Title = "设置 - 截图OCR",
            Fields = [],
        };

        var json = FormSpecDecompiler.Serialize(spec);
        StringAssert.Contains(json, "设置 - 截图OCR");
        Assert.IsFalse(json.Contains("\\u8BBE", StringComparison.Ordinal));
    }

    [TestMethod]
    public void Serialize_writes_readable_cjk_not_unicode_escapes()
    {
        var spec = new FormSpecDocument
        {
            Schema = FormSpecDocument.SchemaId,
            Mode = "variables",
            Title = "设置 - 截图OCR",
            Fields =
            [
                new FormSpecField
                {
                    Key = "showWindow",
                    Label = "显示窗口",
                    Type = "checkbox",
                },
            ],
        };

        var json = FormSpecDecompiler.Serialize(spec);
        StringAssert.Contains(json, "设置 - 截图OCR");
        StringAssert.Contains(json, "显示窗口");
        Assert.IsFalse(json.Contains("\\u8BBE", StringComparison.Ordinal));
    }

    [TestMethod]
    public void Decompile_round_trips_variables_spec()
    {
        var build = FormSpecCompiler.BuildFromJson(VariablesSpec);
        Assert.IsTrue(build.Success);

        var ctx = new FormSpecDecompiler.DecompileContext
        {
            Mode = "variables",
            Title = "填写信息",
        };
        var decompile = FormSpecDecompiler.TryDecompile(build.NativeFormJson!, ctx);
        Assert.IsTrue(decompile.Success, decompile.ErrorMessage);
        Assert.AreEqual(3, decompile.Spec!.Fields.Count);
        Assert.AreEqual("qkrpc.form.v1", decompile.Spec.Schema);

        var rebuild = FormSpecCompiler.Build(decompile.Spec);
        Assert.IsTrue(rebuild.Success);
        Assert.AreEqual(build.NativeFormJson, rebuild.NativeFormJson);
    }

    [TestMethod]
    public void FileRefExporter_decompiles_native_formDef_to_spec_file()
    {
        var build = FormSpecCompiler.BuildFromJson(VariablesSpec);
        Assert.IsTrue(build.Success);

        var data = new JObject
        {
            ["steps"] = new JArray { JObject.Parse(build.StepJson!) },
            ["variables"] = new JArray(),
        };
        var root = Path.Combine(Path.GetTempPath(), "qkrpc-form-rev-" + Guid.NewGuid().ToString("N"));
        try
        {
            var export = XActionFileRefExporter.Export(
                data,
                root,
                templateData: null,
                options: new XActionFileRefExportOptions { AutoExternalizeMinLines = 4 });
            Assert.IsTrue(export.Success, export.ErrorMessage);

            var formDef = export.ExportedData!["steps"]![0]!["inputParams"]!["formDef"] as JObject;
            Assert.AreEqual("files/form1.form.json", formDef!["file"]!.Value<string>());
            Assert.IsNull(formDef["value"]);

            var specFile = export.ResourceFiles.FirstOrDefault(
                f => f.RelativePath.EndsWith(".form.json", StringComparison.OrdinalIgnoreCase));
            Assert.IsNotNull(specFile);
            Assert.IsTrue(FormSpecDocumentShape.LooksLikeFormSpecText(specFile!.Content));
            Assert.IsFalse(FormSpecDecompiler.LooksLikeNativeFormDef(specFile.Content));
        }
        finally
        {
            if (Directory.Exists(root))
            {
                Directory.Delete(root, recursive: true);
            }
        }
    }

    [TestMethod]
    public void FileRefExporter_reextract_preserves_form_spec_file_content()
    {
        var root = Path.Combine(Path.GetTempPath(), "qkrpc-form-rev2-" + Guid.NewGuid().ToString("N"));
        try
        {
            Directory.CreateDirectory(Path.Combine(root, "files"));
            const string originalSpec = """
                {
                  "$schema": "qkrpc.form.v1",
                  "mode": "variables",
                  "title": "填写",
                  "fields": [
                    { "key": "userName", "label": "姓名", "type": "text" }
                  ]
                }
                """;
            File.WriteAllText(Path.Combine(root, "files", "login.form.json"), originalSpec, Encoding.UTF8);

            var template = new JObject
            {
                ["steps"] = new JArray
                {
                    new JObject
                    {
                        ["stepId"] = "s-1",
                        ["stepRunnerKey"] = "sys:form",
                        ["inputParams"] = new JObject
                        {
                            ["operation"] = new JObject { ["value"] = "variables" },
                            ["formDef"] = new JObject { ["file"] = "files/login.form.json" },
                        },
                    },
                },
            };

            var build = FormSpecCompiler.BuildFromJson(originalSpec);
            var step = JObject.Parse(build.StepJson!);
            step["stepId"] = "s-1";
            var latest = new JObject
            {
                ["steps"] = new JArray { step },
                ["variables"] = new JArray(),
            };

            var export = XActionFileRefExporter.Export(latest, root, template);
            Assert.IsTrue(export.Success, export.ErrorMessage);

            var written = export.ResourceFiles.First(f =>
                f.RelativePath.Equals("files/login.form.json", StringComparison.OrdinalIgnoreCase));
            Assert.IsTrue(FormSpecDocumentShape.LooksLikeFormSpecText(written.Content));
            Assert.IsFalse(FormSpecDecompiler.LooksLikeNativeFormDef(written.Content));
        }
        finally
        {
            if (Directory.Exists(root))
            {
                Directory.Delete(root, recursive: true);
            }
        }
    }

    [TestMethod]
    public void Patch_preprocess_legacy_formSpec_still_compiles()
    {
        var patch = new JObject
        {
            ["steps"] = new JArray
            {
                new JObject
                {
                    ["stepRunnerKey"] = "sys:form",
                    ["inputParams"] = new JObject
                    {
                        ["formSpec"] = new JObject
                        {
                            ["value"] = """
                                {
                                  "mode": "variables",
                                  "title": "填写",
                                  "fields": [
                                    { "key": "userName", "label": "姓名", "type": "text" }
                                  ]
                                }
                                """,
                        },
                    },
                },
            },
        };

        var preprocess = XActionFormSpecCompiler.CompilePatch(patch, projectDirectory: null);
        Assert.IsTrue(preprocess.Success, preprocess.ErrorMessage);
        Assert.IsNotNull(patch["steps"]![0]!["inputParams"]!["formDef"]);
        Assert.IsNull(patch["steps"]![0]!["inputParams"]!["formSpec"]);
    }
}
