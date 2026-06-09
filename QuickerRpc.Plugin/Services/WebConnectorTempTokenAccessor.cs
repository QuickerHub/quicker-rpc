using System;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Reflection;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using Quicker.Common.Vm;
using Quicker.Domain;
using QuickerRpc.Plugin.Reflection;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Obtains getquicker temp login token for <c>/member/redirect</c> (same as <c>WebConnector.GetTempTokenAsync</c>).
/// Prefers direct API call with Quicker bearer token (Release-safe); falls back to signature reflection.
/// </summary>
internal static class WebConnectorTempTokenAccessor
{
    private const string GetTempTokenApiUrl = "https://api.getquicker.net/api/Account/GetTempToken";

    public static async Task<(bool Ok, string? Message, string? Token)> GetTempTokenAsync()
    {
        if (!QuickerHost.IsRunningInQuicker())
        {
            return (false, "Not running inside Quicker.", null);
        }

        try
        {
            var bearerToken = QuickerAccountAccessor.TryGetBearerToken();
            if (!string.IsNullOrEmpty(bearerToken))
            {
                var (apiOk, apiMessage, apiToken) = await GetTempTokenViaApiAsync(bearerToken)
                    .ConfigureAwait(false);
                if (apiOk && !string.IsNullOrEmpty(apiToken))
                {
                    return (true, apiMessage, apiToken);
                }
            }

            return await GetTempTokenViaReflectionAsync().ConfigureAwait(false);
        }
        catch (TargetInvocationException ex) when (ex.InnerException is not null)
        {
            return (false, ex.InnerException.Message, null);
        }
        catch (Exception ex)
        {
            return (false, ex.Message, null);
        }
    }

    private static async Task<(bool Ok, string? Message, string? Token)> GetTempTokenViaApiAsync(string bearerToken)
    {
        using var client = new HttpClient
        {
            Timeout = TimeSpan.FromSeconds(30),
        };
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", bearerToken);
        client.DefaultRequestHeaders.CacheControl = new CacheControlHeaderValue { NoCache = true };

        var url = $"{GetTempTokenApiUrl}?tick={DateTime.Now.Ticks}";
        using var response = await client.GetAsync(new Uri(url)).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            return (false, $"GetTempToken API failed: {(int)response.StatusCode}", null);
        }

        var json = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
        return ParseApiResultString(json);
    }

    private static (bool Ok, string? Message, string? Token) ParseApiResultString(string json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return (false, "GetTempToken API returned empty body.", null);
        }

        JObject root;
        try
        {
            root = JObject.Parse(json);
        }
        catch (Exception ex)
        {
            return (false, "GetTempToken API returned invalid JSON: " + ex.Message, null);
        }

        var isSuccess = root["IsSuccess"]?.Type == JTokenType.Boolean
            && root["IsSuccess"]!.Value<bool>();
        var message = root["Message"]?.Type == JTokenType.String
            ? root["Message"]!.Value<string>()
            : null;
        var data = root["Data"]?.Type == JTokenType.String
            ? root["Data"]!.Value<string>()?.Trim()
            : null;

        if (isSuccess && !string.IsNullOrEmpty(data))
        {
            return (true, message, data);
        }

        return (false, string.IsNullOrWhiteSpace(message) ? "GetTempToken API call failed." : message, null);
    }

    private static async Task<(bool Ok, string? Message, string? Token)> GetTempTokenViaReflectionAsync()
    {
        var assembly = QuickerAssemblyReflection.TryResolveQuickerEntryAssembly(out var quicker)
            ? quicker
            : typeof(AppState).Assembly;

        var apiResultStringType = typeof(ApiResult<>).MakeGenericType(typeof(string));
        var taskType = typeof(Task<>).MakeGenericType(apiResultStringType);
        var method = FindGetTempTokenMethod(assembly, taskType);
        if (method is null)
        {
            return (false, "WebConnector.GetTempTokenAsync not found.", null);
        }

        if (method.Invoke(null, null) is not Task task)
        {
            return (false, "GetTempTokenAsync did not return Task.", null);
        }

        await task.ConfigureAwait(false);
        return ReadApiResultString(task);
    }

    private static MethodInfo? FindGetTempTokenMethod(Assembly assembly, Type taskType)
    {
        var candidates = assembly
            .GetTypes()
            .SelectMany(t => t.GetMethods(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static))
            .Where(m => m.GetParameters().Length == 0 && m.ReturnType == taskType)
            .ToList();

        if (candidates.Count == 0)
        {
            return null;
        }

        if (candidates.Count == 1)
        {
            return candidates[0];
        }

        return candidates.FirstOrDefault(m =>
                   m.DeclaringType?.GetFields(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static)
                       .Any(f => f.FieldType == typeof(HttpClient)) == true)
               ?? candidates[0];
    }

    private static (bool Ok, string? Message, string? Token) ReadApiResultString(Task completedTask)
    {
        var resultProperty = completedTask.GetType().GetProperty("Result");
        if (resultProperty?.GetValue(completedTask) is not { } apiResult)
        {
            return (false, "GetTempTokenAsync returned null.", null);
        }

        var resultType = apiResult.GetType();
        var isSuccess = resultType.GetProperty("IsSuccess")?.GetValue(apiResult) is true;
        var message = resultType.GetProperty("Message")?.GetValue(apiResult) as string;
        var data = resultType.GetProperty("Data")?.GetValue(apiResult) as string;
        var token = string.IsNullOrWhiteSpace(data) ? null : data.Trim();
        return (isSuccess && !string.IsNullOrEmpty(token), message, token);
    }
}
