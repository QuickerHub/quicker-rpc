using Quicker.ActionRuntime.Abstractions;
using Quicker.ActionRuntime.Abstractions.Operations.Core;
using Quicker.ActionRuntime.Mocking;

namespace QuickerRpc.Console.ActionRuntime.Mock;

internal static class MockProfileApplier
{
    internal static void Apply(MockProfileDocument profile, DeterministicTestScope.Builder builder)
    {
        var mocks = profile.Mocks;
        if (mocks == null)
        {
            return;
        }

        if (!string.IsNullOrEmpty(mocks.Clipboard?.UnicodeText))
        {
            builder.Clipboard.UnicodeText = mocks.Clipboard.UnicodeText;
        }

        if (mocks.Http != null)
        {
            foreach (var (url, response) in mocks.Http)
            {
                builder.HttpBackend.Responses[url] = new HttpResponseResult
                {
                    StatusCode = response.StatusCode,
                    Content = response.Content ?? string.Empty,
                    IsSuccess = response.StatusCode is >= 200 and < 300,
                };
            }
        }

        if (!string.IsNullOrWhiteSpace(mocks.Time?.FixedUtc)
            && DateTime.TryParse(mocks.Time.FixedUtc, out var fixedUtc))
        {
            builder.NowFactory = _ => fixedUtc.ToLocalTime();
        }

        if (mocks.Host != null)
        {
            if (!string.IsNullOrWhiteSpace(mocks.Host.MessageBox))
            {
                builder.HostServices.NextMessageBoxResult =
                    ParseMessageBoxResult(mocks.Host.MessageBox);
            }

            if (!string.IsNullOrWhiteSpace(mocks.Host.UserInput))
            {
                builder.HostServices.NextPromptResult = mocks.Host.UserInput;
            }

            if (mocks.Host.FormVariables != null)
            {
                foreach (var (key, value) in mocks.Host.FormVariables)
                {
                    builder.FormVariables[key] = CoerceJsonElement(value);
                }
            }

            if (!string.IsNullOrWhiteSpace(mocks.Host.ExplorerPath))
            {
                builder.ExplorerPath = mocks.Host.ExplorerPath;
            }

            if (!string.IsNullOrWhiteSpace(mocks.Host.SelectedFile))
            {
                builder.SelectedFilePath = mocks.Host.SelectedFile;
            }
        }

        if (mocks.Files?.Seed != null)
        {
            foreach (var seed in mocks.Files.Seed)
            {
                if (string.IsNullOrWhiteSpace(seed.Path))
                {
                    continue;
                }

                builder.FileText.Seed(seed.Path, seed.Content ?? string.Empty);
            }
        }

        if (mocks.Window != null)
        {
            if (!string.IsNullOrWhiteSpace(mocks.Window.ForegroundTitle))
            {
                builder.ForegroundWindowTitle = mocks.Window.ForegroundTitle;
            }

            if (mocks.Window.ForegroundHandle is { } handle)
            {
                builder.ForegroundWindowHandle = handle;
            }
        }
    }

    internal static Dictionary<string, object>? BuildInitialVars(MockProfileDocument profile)
    {
        if (profile.InitialVars == null || profile.InitialVars.Count == 0)
        {
            return null;
        }

        var dict = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
        foreach (var (key, value) in profile.InitialVars)
        {
            dict[key] = CoerceJsonElement(value);
        }

        return dict;
    }

    private static HostMessageResult ParseMessageBoxResult(string value) =>
        value.Trim().ToLowerInvariant() switch
        {
            "yes" or "ok" => HostMessageResult.Yes,
            "no" => HostMessageResult.No,
            "cancel" => HostMessageResult.Cancel,
            _ => HostMessageResult.Yes,
        };

    private static object CoerceJsonElement(System.Text.Json.JsonElement element) =>
        element.ValueKind switch
        {
            System.Text.Json.JsonValueKind.String => element.GetString() ?? string.Empty,
            System.Text.Json.JsonValueKind.Number when element.TryGetInt64(out var i) => i,
            System.Text.Json.JsonValueKind.Number => element.GetDouble(),
            System.Text.Json.JsonValueKind.True => true,
            System.Text.Json.JsonValueKind.False => false,
            _ => element.ToString(),
        };
}
