using System.Text.Json;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console;

internal static class StepRunnerInputContractCli
{
    internal static QuickerRpcStepRunnerInputContractRequest CreateRequest(StepRunnerOptions options)
    {
        if (string.IsNullOrWhiteSpace(options.Key)) throw new ArgumentException("A step runner key is required.");
        if (options.ControlField is not null && options.ControlFieldJson is not null)
            throw new ArgumentException("Use one control value representation.");
        var value = options.ControlField;
        if (options.ControlFieldJson is not null)
        {
            try
            {
                using var json = JsonDocument.Parse(options.ControlFieldJson);
                if (json.RootElement.ValueKind != JsonValueKind.String) throw new ArgumentException("The control literal must be a JSON string.");
                value = json.RootElement.GetString();
            }
            catch (JsonException) { throw new ArgumentException("The control literal must be a valid JSON string."); }
        }
        return new QuickerRpcStepRunnerInputContractRequest { StepRunnerKey = options.Key.Trim(), ControlFieldValue = value };
    }
}
