using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;

namespace QuickerRpc.AgentModel.Form;

/// <summary>Newtonsoft settings for <c>qkrpc.form.v1</c> (literal UTF-8 CJK, not <c>\uXXXX</c>).</summary>
internal static class FormSpecJson
{
    public static readonly JsonSerializerSettings ReadWriteSettings = new()
    {
        Formatting = Formatting.Indented,
        NullValueHandling = NullValueHandling.Ignore,
        DefaultValueHandling = DefaultValueHandling.Ignore,
        ContractResolver = new CamelCasePropertyNamesContractResolver(),
    };
}
