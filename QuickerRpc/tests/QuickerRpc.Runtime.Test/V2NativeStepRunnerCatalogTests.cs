using System.Reflection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.Plugin.V2.Reflection;

namespace QuickerRpc.Runtime.Test;

[TestClass]
[DoNotParallelize]
public sealed class V2NativeStepRunnerCatalogTests
{
    [TestCleanup]
    public void ClearOwnedFixture() => Storage.StepRunnerService = null;

    [TestMethod]
    public void Existing_owner_and_interface_dispatch_supply_real_catalog_and_full_UI_schema()
    {
        var service = new ExplicitService();
        Storage.StepRunnerService = service;
        Assert.IsNull(service.GetType().GetMethod("GetAllRunners"), "The implementation's private method name is not the public native contract.");
        var catalog = Read();
        var detail = StepRunnerCatalogMapper.GetDetail(catalog, "sys:notify", null);
        Assert.IsTrue(detail.Success, detail.ErrorMessage);
        var ui = JObject.Parse(StepRunnerUiSchemaJson.Serialize(detail.Schema!));
        Assert.AreEqual("sys:notify", ui.Value<string>("stepRunnerKey"));
        Assert.AreEqual("fa:Light_Test", ui.Value<string>("icon"));
        Assert.AreEqual("message", ui["inputs"]![0]!.Value<string>("key"));
        Assert.AreEqual(1, service.Reads);
    }

    [TestMethod]
    public void Unavailable_or_empty_first_read_does_not_poison_the_next_native_snapshot()
    {
        Assert.AreEqual(0, Read().Items.Count);
        var service = new ExplicitService();
        service.Rows.Clear();
        Storage.StepRunnerService = service;
        Assert.AreEqual(0, Read().Items.Count);
        service.Rows.Add(new Runner { Key = "sys:notify" });
        Assert.AreEqual("sys:notify", Read().Items.Single().Key);
        Assert.AreEqual(2, service.Reads);
    }

    [TestMethod]
    public void Owner_replacement_removal_and_definition_changes_never_return_an_old_snapshot()
    {
        var first = new ExplicitService();
        Storage.StepRunnerService = first;
        Assert.AreEqual("sys:notify", Read().Items.Single().Key);
        var second = new ExplicitService();
        second.Rows[0].Key = "sys:delay";
        Storage.StepRunnerService = second;
        Assert.AreEqual("sys:delay", Read().Items.Single().Key);
        second.Rows[0].Name = "changed";
        Assert.AreEqual("changed", Read().Items.Single().Name);
        Storage.StepRunnerService = null;
        Assert.AreEqual(0, Read().Items.Count);
        Assert.AreEqual(1, first.Reads);
        Assert.AreEqual(2, second.Reads);
    }

    [TestMethod]
    public void Missing_or_mismatched_contracts_do_not_read_a_service_or_guess_DI()
    {
        var service = new ExplicitService();
        Storage.StepRunnerService = service;
        Assert.AreEqual(0, QuickerV2StepRunnerCatalogBuilder.ReadCurrentService(null, typeof(IService)).Items.Count);
        Assert.AreEqual(0, QuickerV2StepRunnerCatalogBuilder.ReadCurrentService(typeof(Storage), null).Items.Count);
        Assert.AreEqual(0, QuickerV2StepRunnerCatalogBuilder.ReadCurrentService(typeof(Storage), typeof(ExplicitService)).Items.Count);
        Assert.AreEqual(0, QuickerV2StepRunnerCatalogBuilder.ReadCurrentService(typeof(WrongStorage), typeof(IService)).Items.Count);
        Assert.AreEqual(0, service.Reads);
    }

    [TestMethod]
    public void Native_read_failures_are_propagated_instead_of_reusing_previous_definitions()
    {
        var service = new ExplicitService();
        Storage.StepRunnerService = service;
        Assert.AreEqual(1, Read().Items.Count);
        service.Fail = true;
        var error = Assert.ThrowsException<TargetInvocationException>(() => Read());
        Assert.IsInstanceOfType<InvalidOperationException>(error.InnerException);
        Assert.AreEqual("owned native read failed", error.InnerException!.Message);
    }

    private static StepRunnerCatalog Read() => QuickerV2StepRunnerCatalogBuilder.ReadCurrentService(typeof(Storage), typeof(IService));
    public interface IService { IList<Runner> GetAllRunners(); }
    public static class Storage { public static IService? StepRunnerService { get; set; } }
    public static class WrongStorage { public static object StepRunnerService => throw new AssertFailedException("Mismatched owner was read."); }
    public sealed class ExplicitService : IService
    {
        public readonly List<Runner> Rows = [new()];
        public int Reads;
        public bool Fail;
        IList<Runner> IService.GetAllRunners()
        {
            Reads++;
            if (Fail) throw new InvalidOperationException("owned native read failed");
            return Rows;
        }
    }
    public sealed class Runner
    {
        public string Key { get; set; } = "sys:notify";
        public string Name { get; set; } = "Fixture";
        public string Icon => "fa:Light_Test";
        public List<Input> InputParams => [new()];
        public object[] OutputParams => [];
    }
    public sealed class Input
    {
        public string Key => "message";
        public string Name => "Message";
        public int Type => 0;
        public int VariableMode => 1;
    }
}
