using System.Text.Json.Nodes;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.AgentModel.Form;
using QuickerRpc.AgentModel.Guides;
using QuickerRpc.AgentModel.Schemas;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class FormSpecSchemaTests
{
    [TestMethod]
    public void GetSchema_loads_embedded_form_spec_schema()
    {
        var schema = FormSpecSchemaService.GetSchema();
        Assert.AreEqual(FormSpecSchemaService.SchemaId, schema["schemaId"]?.GetValue<string>());
        Assert.AreEqual(FormSpecDocument.SchemaId, schema["documentSchemaId"]?.GetValue<string>());
        Assert.IsNotNull(schema["definitions"]?["formSpec"]);
        Assert.IsNotNull(schema["definitions"]?["formField"]);
        Assert.IsNotNull(schema["template"]);
    }

    [TestMethod]
    public void GetTemplate_sets_document_schema_id()
    {
        var template = FormSpecSchemaService.GetTemplate();
        Assert.AreEqual(FormSpecDocument.SchemaId, template["$schema"]?.GetValue<string>());
        Assert.IsInstanceOfType(template["fields"], typeof(JsonArray));
    }

    [TestMethod]
    public void Guide_get_form_spec_schema_returns_schema_node()
    {
        var guides = new ActionAuthoringGuideService();
        var doc = guides.GetDoc(FormSpecSchemaService.TopicId);
        Assert.IsTrue(doc.Success);
        Assert.IsNotNull(doc.Schema);
        Assert.AreEqual(FormSpecSchemaService.SchemaId, doc.Schema!["schemaId"]?.GetValue<string>());
    }
}
