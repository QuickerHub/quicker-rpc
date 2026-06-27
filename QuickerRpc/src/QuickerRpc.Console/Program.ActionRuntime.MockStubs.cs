#if !ACTION_RUNTIME_MOCK
namespace QuickerRpc.Console;

internal static partial class Program
{
    private const string MockNotAvailableMessage =
        "ActionRuntime mock is only available in dev builds (dotnet build -p:EnableActionRuntimeMock=true). "
        + "Production qkrpc / QuickerAgent bundles exclude mock verify.";

    private static Task<int> RunActionMockAsync(ActionOptions options) =>
        EmitErrorAndFailAsync(options.Json, "MOCK_NOT_AVAILABLE", MockNotAvailableMessage);

    private static Task<int> RunActionMockProfilesAsync(ActionOptions options) =>
        EmitErrorAndFailAsync(options.Json, "MOCK_NOT_AVAILABLE", MockNotAvailableMessage);

    private static Task<int> RunActionMockTraceDiffAsync(ActionOptions options) =>
        EmitErrorAndFailAsync(options.Json, "MOCK_NOT_AVAILABLE", MockNotAvailableMessage);
}
#endif
