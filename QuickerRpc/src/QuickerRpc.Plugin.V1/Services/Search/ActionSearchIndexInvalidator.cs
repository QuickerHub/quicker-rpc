using QuickerRpc.AgentModel.Search;

namespace QuickerRpc.Plugin.Services.Search;

internal static class ActionSearchIndexInvalidator
{
    public static void InvalidateAction() => Invalidate(SearchRegion.Action);

    public static void InvalidateSubProgram() => Invalidate(SearchRegion.SubProgram);

    private static void Invalidate(SearchRegion region)
    {
        if (!AppServices.IsInitialized)
        {
            return;
        }

        AppServices.GetRequired<AgentSearchIndexCoordinator>().Invalidate(region);
    }
}
