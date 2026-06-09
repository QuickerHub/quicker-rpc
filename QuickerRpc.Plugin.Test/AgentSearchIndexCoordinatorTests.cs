using System.Collections.Generic;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.AgentModel.Search;
using QuickerRpc.Plugin.Services.Search;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class AgentSearchIndexCoordinatorTests
{
    [TestMethod]
    public void Invalidate_clears_ready_snapshot()
    {
        var hub = new AgentSearchHub();
        var coordinator = new AgentSearchIndexCoordinator(hub);
        hub.Publish(
            SearchRegion.Action,
            new[]
            {
                new SearchDocument
                {
                    Id = "a",
                    Region = SearchRegion.Action,
                    SortKey = "A",
                    Fields = new Dictionary<string, string> { [ActionSearchFields.Title] = "A" },
                },
            },
            SearchRegionMode.LinearSubstring);

        Assert.IsTrue(coordinator.IsReady(SearchRegion.Action));
        coordinator.InvalidateAction();
        Assert.IsFalse(coordinator.IsReady(SearchRegion.Action));
    }

    [TestMethod]
    public void ScheduleBuild_without_quicker_runtime_is_noop()
    {
        var hub = new AgentSearchHub();
        var coordinator = new AgentSearchIndexCoordinator(hub);
        coordinator.ScheduleBuild(SearchRegion.Action);
        coordinator.ScheduleBuild(SearchRegion.SubProgram);
        Assert.IsFalse(hub.IsPublished(SearchRegion.Action));
        Assert.IsFalse(hub.IsPublished(SearchRegion.SubProgram));
    }
}
