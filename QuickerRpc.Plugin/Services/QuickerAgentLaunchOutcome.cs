namespace QuickerRpc.Plugin.Services;

internal enum QuickerAgentLaunchOutcome
{
    Activated,
    Launched,
    DevFrontendOpened,
    NotInstalled,
    RunningButHidden,
    Failed,
}
