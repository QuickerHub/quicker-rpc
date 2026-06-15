using System;
using System.Diagnostics;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace QuickerRpc.Test;

internal sealed class QkrpcServeHttpClient : IDisposable
{
    private readonly HttpClient _http;
    private readonly string _invokeUrl;
    private readonly int _timeoutSeconds;

    public QkrpcServeHttpClient(string baseUrl, int timeoutSeconds)
    {
        var trimmed = (baseUrl ?? string.Empty).Trim().TrimEnd('/');
        if (string.IsNullOrEmpty(trimmed))
        {
            trimmed = "http://127.0.0.1:9477";
        }

        _invokeUrl = trimmed + "/v1/invoke";
        _timeoutSeconds = Math.Max(1, timeoutSeconds);
        _http = new HttpClient
        {
            Timeout = TimeSpan.FromSeconds(_timeoutSeconds + 5),
        };
    }

    public string BaseUrl => _invokeUrl.Replace("/v1/invoke", string.Empty);

    public async Task<bool> HealthOkAsync(CancellationToken cancellationToken)
    {
        using var response = await _http
            .GetAsync(BaseUrl + "/health", cancellationToken)
            .ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            return false;
        }

        var text = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
        if (string.IsNullOrWhiteSpace(text))
        {
            return false;
        }

        try
        {
            var json = JObject.Parse(text);
            return json.Value<bool?>("ok") == true;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    public async Task<(double ElapsedMs, JObject Body)> InvokeAsync(
        string op,
        object? args,
        CancellationToken cancellationToken)
    {
        var payload = JsonConvert.SerializeObject(new
        {
            op,
            args = args ?? new { },
            timeoutSeconds = _timeoutSeconds,
        });
        using var content = new StringContent(payload, Encoding.UTF8, "application/json");
        var sw = Stopwatch.StartNew();
        using var response = await _http
            .PostAsync(_invokeUrl, content, cancellationToken)
            .ConfigureAwait(false);
        var text = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
        sw.Stop();

        JObject body;
        try
        {
            body = string.IsNullOrWhiteSpace(text) ? new JObject() : JObject.Parse(text);
        }
        catch (JsonException ex)
        {
            throw new InvalidOperationException("qkrpc serve returned invalid JSON: " + ex.Message, ex);
        }

        if (!response.IsSuccessStatusCode)
        {
            var error = body.Value<string>("error") ?? "HTTP_" + (int)response.StatusCode;
            var message = body.Value<string>("message") ?? text;
            throw new InvalidOperationException(error + ": " + message);
        }

        if (body.Value<bool?>("ok") != true)
        {
            var error = body.Value<string>("error") ?? "INVOKE_FAILED";
            var message = body.Value<string>("message") ?? "unknown";
            throw new InvalidOperationException(error + ": " + message);
        }

        return (sw.Elapsed.TotalMilliseconds, body);
    }

    public void Dispose() => _http.Dispose();
}
