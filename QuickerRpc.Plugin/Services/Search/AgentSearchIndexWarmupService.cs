using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Hosting;
using QuickerRpc.AgentModel.Search;

namespace QuickerRpc.Plugin.Services.Search;

/// <summary>Queues initial action/subprogram index builds after plugin host starts.</summary>
internal sealed class AgentSearchIndexWarmupService : IHostedService
{
    private readonly AgentSearchIndexCoordinator _coordinator;

    public AgentSearchIndexWarmupService(AgentSearchIndexCoordinator coordinator) =>
        _coordinator = coordinator;

    public Task StartAsync(CancellationToken cancellationToken)
    {
        _coordinator.ScheduleBuild(SearchRegion.Action);
        _coordinator.ScheduleBuild(SearchRegion.SubProgram);
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        _coordinator.CancelAllBuilds();
        return Task.CompletedTask;
    }
}
