using System.Text.Json.Nodes;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.AgentModel.Guides;
using QuickerRpc.AgentModel.Schemas;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class ActionDataSchemaTests
{
    [TestMethod]
    public void GetSchema_loads_embedded_program_data_schema()
    {
        var schema = ActionDataSchemaService.GetSchema();
        Assert.AreEqual(ActionDataSchemaService.SchemaId, schema["schemaId"]?.GetValue<string>());
        Assert.IsNotNull(schema["definitions"]?["step"]);
        Assert.IsNotNull(schema["definitions"]?["variables"]?["action"]);
        Assert.IsNotNull(schema["definitions"]?["variables"]?["subprogram"]);
        Assert.IsNotNull(schema["definitions"]?["inputParamInfo"]);
        Assert.IsNotNull(schema["template"]?["action"]);
        Assert.IsNotNull(schema["template"]?["subprogram"]);
    }

    [TestMethod]
    public void GetDataTemplate_returns_kind_specific_empty_body()
    {
        var action = ActionDataSchemaService.GetDataTemplate(ActionDataSchemaService.ProgramKindAction);
        var sub = ActionDataSchemaService.GetDataTemplate(ActionDataSchemaService.ProgramKindSubprogram);
        Assert.IsInstanceOfType(action["variables"], typeof(JsonArray));
        Assert.IsInstanceOfType(sub["steps"], typeof(JsonArray));
        Assert.AreEqual(0, action["variables"]!.AsArray().Count);
    }

    [TestMethod]
    public void Guide_get_action_data_schema_returns_schema_node()
    {
        var guides = new ActionAuthoringGuideService();
        var doc = guides.GetDoc(ActionDataSchemaService.TopicId);
        Assert.IsTrue(doc.Success);
        Assert.IsNotNull(doc.Schema);
        Assert.AreEqual(ActionDataSchemaService.SchemaId, doc.Schema!["schemaId"]?.GetValue<string>());
    }
}
