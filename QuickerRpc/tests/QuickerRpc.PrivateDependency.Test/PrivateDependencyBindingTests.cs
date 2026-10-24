using System.Diagnostics;
using System.Security;
using System.Reflection.Metadata;
using System.Reflection.PortableExecutable;
using System.Text.Json;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace QuickerRpc.PrivateDependency.Test;

/// <summary>Only generated pure libraries execute; no actual plugin, Quicker, service or pipe is loaded.</summary>
[TestClass]
[DoNotParallelize]
public sealed class PrivateDependencyBindingTests
{
    private static string _root = null!;
    private static string _parent = null!;
    private static string _runner = null!;

    [ClassInitialize]
    public static async Task BuildOwnedLibraries(TestContext _)
    {
        var repository = FindRepository();
        _parent = Path.Combine(repository, ".tmp", "private-dependency-tests");
        RejectRedirectedAncestors(_parent);
        Directory.CreateDirectory(_parent);
        RejectRedirectedAncestors(_parent);
        _root = Path.Combine(_parent, "run-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_root);
        await File.WriteAllTextAsync(Path.Combine(_root, "Directory.Build.props"), "<Project />");
        await File.WriteAllTextAsync(Path.Combine(_root, "Directory.Build.targets"), "<Project />");
        await File.WriteAllTextAsync(Path.Combine(_root, "NuGet.Config"), "<configuration><packageSources><clear /></packageSources></configuration>");
        var legacy = await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "Fixtures", "LegacyPluginCosturaAssemblyResolve.cs.txt"));
        var current = await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "Fixtures", "ProductionPluginCosturaAssemblyResolve.cs.txt"));
        var initializer = await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "Fixtures", "ProductionPluginModuleInitializer.cs.txt"));
        using var budget = new CancellationTokenSource(TimeSpan.FromMinutes(3));
        try
        {
            foreach (var version in new[] { 171, 172 })
            {
                var runtime = await BuildLibrary("runtime" + version, "QuickerRpc.Runtime", version,
                    RuntimeSource(version == 172), [], [], budget.Token);
                await BuildLibrary("legacy" + version, "QuickerRpc.Plugin.Fixture." + version, version,
                    EntrySource(version == 172, false), [runtime], [("Resolver.cs", legacy)], budget.Token,
                    [(runtime, "costura.quickerrpc.runtime.dll")]);
            }
            var privateRuntime = await BuildLibrary("runtime-private", "QuickerRpc.Runtime.0.14.8.172", 172,
                RuntimeSource(true), [], [], budget.Token);
            var transport = await BuildLibrary("transport-private", "QuickerRpc.Transport.0.14.8.172", 172,
                "namespace QuickerRpc.Transport; public static class Bridge { public static string Call()=>QuickerRpc.Runtime.StepRunnerInputContractBuilder.Build(null,null,\"v2\"); } public static class TransportDiagnostics { public static Action<string,Exception?>? Sink; }",
                [privateRuntime], [], budget.Token);
            var otherDependencies = new List<string>();
            foreach (var name in new[] { "Contracts", "AgentModel", "Host.Abstractions" })
                otherDependencies.Add(await BuildLibrary("private-" + name, "QuickerRpc." + name + ".0.14.8.172", 172,
                    "namespace PureFixture; public class Marker { }", [], [], budget.Token));
            foreach (var name in new[] { "Microsoft.Extensions.Fixture", "Newtonsoft.Json", "Unrelated.Dependency" })
                otherDependencies.Add(await BuildLibrary("shared-" + name, name, 172,
                    "namespace SharedFixture; public class Marker { }", [], [], budget.Token));
            await BuildLibrary("current", "QuickerRpc.Plugin.Fixture.Current", 172,
                EntrySource(true, true), [privateRuntime, transport, .. otherDependencies], [("Resolver.cs", current), ("Initializer.cs", initializer),
                    ("DiagnosticStubs.cs", "namespace QuickerRpc.Plugin; internal static class PluginAssemblyResolve { internal static int EnsureRegistered()=>1; } internal static class PluginV2DiagnosticLog { internal static void Write(string message,Exception? exception){} }")], budget.Token,
                embeddingTarget: Path.Combine(repository, "build", "EmbedV2Dependencies.targets"),
                runtimeAssets: [privateRuntime, privateRuntime]); // NuGet-style assets may overlap; one resource must be emitted.
            await BuildLibrary("foreign-transport", "QuickerRpc.Transport.0.14.8.172", 172,
                "namespace Foreign; public static class DifferentImage { public static string Marker=>\"not the embedded image\"; }", [], [], budget.Token);
            _runner = await BuildLibrary("runner", "FixtureRunner", 1, RunnerSource, [], [], budget.Token, executable: true);
        }
        catch
        {
            Cleanup();
            throw;
        }
    }

    [ClassCleanup]
    public static void Cleanup()
    {
        if (_root is null || !Directory.Exists(_root)) return;
        AssertOwned(_root);
        RejectRedirectedAncestors(_root);
        Directory.Delete(_root, recursive: true);
    }

    [TestMethod]
    public async Task Legacy_same_simple_name_reproduces_actual_missing_method_in_a_fresh_process()
    {
        using var report = await RunScenario("legacy");
        Assert.IsTrue(report.RootElement.GetProperty("error").GetString()!.StartsWith("MissingMethodException", StringComparison.Ordinal));
        Assert.AreEqual("0.14.8.171", report.RootElement.GetProperty("runtimes")[0].GetProperty("version").GetString());
        Assert.AreEqual(1, report.RootElement.GetProperty("runtimes").GetArrayLength());
    }

    [TestMethod]
    public async Task Private_simple_name_survives_the_older_resolver_registered_first()
    {
        using var report = await RunScenario("private");
        Assert.AreEqual("new-three", report.RootElement.GetProperty("result").GetString());
        Assert.AreEqual(JsonValueKind.Null, report.RootElement.GetProperty("error").ValueKind);
        Assert.AreEqual("QuickerRpc.Runtime.0.14.8.172", report.RootElement.GetProperty("runtimes")[0].GetProperty("name").GetString());
        Assert.IsTrue(report.RootElement.GetProperty("oldHandlerRegistered").GetBoolean());
    }

    [TestMethod]
    public async Task Actual_embedded_transitive_requester_keeps_the_same_owned_runtime_graph()
    {
        using var report = await RunScenario("transitive");
        Assert.AreEqual("new-three", report.RootElement.GetProperty("result").GetString());
        Assert.IsTrue(report.RootElement.GetProperty("ownedRequesterAccepted").GetBoolean());
        Assert.AreEqual(1, report.RootElement.GetProperty("runtimes").GetArrayLength());
    }

    [TestMethod]
    public async Task Concurrent_first_resolutions_publish_one_assembly_identity()
    {
        using var report = await RunScenario("concurrent");
        Assert.IsTrue(report.RootElement.GetProperty("concurrentSameImage").GetBoolean());
        Assert.AreEqual("new-three", report.RootElement.GetProperty("result").GetString());
        Assert.AreEqual(1, report.RootElement.GetProperty("runtimes").GetArrayLength());
    }

    [TestMethod]
    public async Task Resolver_rejects_unknown_requesters_wrong_full_identity_and_a_different_image()
    {
        using var report = await RunScenario("negative");
        foreach (var property in report.RootElement.GetProperty("rejected").EnumerateObject())
            Assert.IsTrue(property.Value.GetBoolean(), property.Name);
        Assert.AreEqual(8, report.RootElement.GetProperty("rejected").EnumerateObject().Count());
        Assert.IsTrue(report.RootElement.GetProperty("sameIdentityDifferentMvid").GetBoolean());
    }

    [TestMethod]
    public async Task V2_real_embedding_target_and_initializer_have_no_unscoped_generated_fallback()
    {
        var project = System.Xml.Linq.XDocument.Load(Path.Combine(FindRepository(), "QuickerRpc", "src", "QuickerRpc.Plugin.V2", "QuickerRpc.Plugin.V2.csproj"));
        Assert.IsFalse(project.Descendants("PackageReference").Any(reference => reference.Attribute("Include")?.Value == "Costura.Fody"));
        Assert.IsTrue(project.Descendants("Import").Any(import => import.Attribute("Project")?.Value.EndsWith("EmbedV2Dependencies.targets", StringComparison.Ordinal) == true));
        using var report = await RunScenario("embedding");
        Assert.AreEqual("new-three", report.RootElement.GetProperty("result").GetString());
        Assert.AreEqual(5, report.RootElement.GetProperty("embeddedResources").GetArrayLength());
        Assert.IsFalse(report.RootElement.GetProperty("generatedFallback").GetBoolean());
        Assert.IsTrue(report.RootElement.GetProperty("diagnosticsInitialized").GetBoolean());
        var output = Path.Combine(_root, "current", "bin", "Release", "net10.0");
        Assert.AreEqual(0, Directory.EnumerateFiles(output, "QuickerRpc.*.dll").Count(path => !Path.GetFileName(path).StartsWith("QuickerRpc.Plugin.", StringComparison.Ordinal)),
            "Embedded dependencies must not remain as loose CopyLocal files.");
        foreach (var name in new[] { "Microsoft.Extensions.Fixture", "Newtonsoft.Json", "Unrelated.Dependency" })
            Assert.IsTrue(File.Exists(Path.Combine(output, name + ".dll")), "Non-allowlisted dependencies must retain their ordinary CopyLocal behavior: " + name);
    }

    [TestMethod]
    public async Task Embedding_fails_before_compile_if_any_required_private_dependency_is_missing()
    {
        try
        {
            await BuildLibrary("missing-private", "MissingPrivateFixture", 172, "public class Marker {}", [], [], CancellationToken.None,
                embeddingTarget: Path.Combine(FindRepository(), "build", "EmbedV2Dependencies.targets"));
            Assert.Fail("A partial private graph must not produce a package.");
        }
        catch (AssertFailedException exception) when (exception.Message.Contains("V2 package is missing required private dependencies:", StringComparison.Ordinal))
        {
            StringAssert.Contains(exception.Message, "QuickerRpc.Runtime.0.14.8.172");
        }
    }

    [TestMethod]
    public async Task Private_restore_and_compile_graph_can_alternate_with_the_neutral_graph()
    {
        var repository = FindRepository();
        var graph = Path.Combine(_root, "profile-graph");
        var contracts = Path.Combine(graph, "contracts");
        Directory.CreateDirectory(contracts);
        await File.WriteAllTextAsync(Path.Combine(graph, "version.json"), "{}");
        string Xml(string value) => SecurityElement.Escape(value)!;
        await File.WriteAllTextAsync(Path.Combine(graph, "Directory.Build.props"),
            $"<Project><Import Project=\"{Xml(Path.Combine(repository, "QuickerRpc", "Directory.Build.props"))}\" /></Project>");
        await File.WriteAllTextAsync(Path.Combine(graph, "Directory.Build.targets"),
            $"<Project><Import Project=\"{Xml(Path.Combine(repository, "Directory.Build.targets"))}\" /></Project>");
        await File.WriteAllTextAsync(Path.Combine(contracts, "QuickerRpc.Contracts.csproj"),
            $"<Project Sdk=\"Microsoft.NET.Sdk\"><PropertyGroup><TargetFramework>net10.0</TargetFramework></PropertyGroup><Import Project=\"{Xml(Path.Combine(repository, "build", "AssemblyVersionFileNameSuffix.props"))}\" /></Project>");
        await File.WriteAllTextAsync(Path.Combine(contracts, "Marker.cs"), "namespace ProfileFixture; public class Marker { }");
        await File.WriteAllTextAsync(Path.Combine(graph, "Profile.csproj"), """
            <Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net10.0</TargetFramework>
            <EnableDefaultCompileItems>false</EnableDefaultCompileItems>
            <PrivateAssemblyVersionSuffix Condition="'$(PrivateFixture)' == 'true'">$(Version)</PrivateAssemblyVersionSuffix>
            </PropertyGroup><ItemGroup><Compile Include="Entry.cs" /><ProjectReference Include="contracts/QuickerRpc.Contracts.csproj" /></ItemGroup></Project>
            """);
        await File.WriteAllTextAsync(Path.Combine(graph, "Entry.cs"), "public class Entry { public ProfileFixture.Marker Field = new(); }");
        using var budget = new CancellationTokenSource(TimeSpan.FromMinutes(2));
        foreach (var profile in new[] { true, false, true })
        {
            await DotNet(["build", Path.Combine(graph, "Profile.csproj"), "-c", "Release", "-p:Version=9.8.7.6",
                "-p:PrivateFixture=" + profile.ToString().ToLowerInvariant(), "--disable-build-servers", "--verbosity", "quiet", "-p:UseSharedCompilation=false"], graph, budget.Token);
            var folder = profile ? Path.Combine("v2-private", "9.8.7.6", "Release", "net10.0") : Path.Combine("Release", "net10.0");
            var expected = "QuickerRpc.Contracts" + (profile ? ".9.8.7.6" : "");
            var library = Path.Combine(contracts, "bin", folder, expected + ".dll");
            Assert.AreEqual(expected, System.Reflection.AssemblyName.GetAssemblyName(library).Name);
            Assert.IsTrue(File.Exists(Path.Combine(contracts, "obj", profile ? Path.Combine("v2-private", "9.8.7.6", "project.assets.json") : "project.assets.json")));
            using var image = new PEReader(File.OpenRead(Path.Combine(graph, "bin", "Release", "net10.0", "Profile.dll")));
            var metadata = image.GetMetadataReader();
            var referenced = metadata.AssemblyReferences.Select(handle => metadata.GetString(metadata.GetAssemblyReference(handle).Name));
            Assert.AreEqual(expected, referenced.Single(name => name.StartsWith("QuickerRpc.Contracts", StringComparison.Ordinal)));
        }
    }

    [TestMethod]
    public async Task Product_profile_is_release_only_and_preserves_cli_framework_and_test_identities()
    {
        var repository = FindRepository();
        using var budget = new CancellationTokenSource(TimeSpan.FromMinutes(1));
        async Task<JsonDocument> Properties(string project, params string[] additional)
        {
            var output = await DotNet(["msbuild", Path.Combine(repository, "QuickerRpc", project), "-p:Version=9.8.7.6", .. additional,
                "-getProperty:AssemblyName,PrivateAssemblyVersionSuffix,BaseIntermediateOutputPath,BaseOutputPath,QkrpcV2PrivateDependencies"], repository, budget.Token);
            return JsonDocument.Parse(output[output.IndexOf('{')..]);
        }
        using var plugin = await Properties("src/QuickerRpc.Plugin.V2/QuickerRpc.Plugin.V2.csproj", "-p:Configuration=Release");
        Assert.AreEqual("9.8.7.6", plugin.RootElement.GetProperty("Properties").GetProperty("PrivateAssemblyVersionSuffix").GetString());
        StringAssert.Contains(plugin.RootElement.GetProperty("Properties").GetProperty("BaseIntermediateOutputPath").GetString(), "v2-private/9.8.7.6");
        using var debug = await Properties("src/QuickerRpc.Plugin.V2/QuickerRpc.Plugin.V2.csproj", "-p:Configuration=Debug");
        Assert.AreEqual("", debug.RootElement.GetProperty("Properties").GetProperty("PrivateAssemblyVersionSuffix").GetString());
        foreach (var framework in new[] { "netstandard2.0", "net472" })
        {
            using var neutral = await Properties("src/QuickerRpc.Contracts/QuickerRpc.Contracts.csproj", "-p:Configuration=Release", "-p:TargetFramework=" + framework);
            Assert.AreEqual(framework == "net472" ? "QuickerRpc.Contracts.9.8.7.6" : "QuickerRpc.Contracts",
                neutral.RootElement.GetProperty("Properties").GetProperty("AssemblyName").GetString());
            Assert.AreEqual("", neutral.RootElement.GetProperty("Properties").GetProperty("PrivateAssemblyVersionSuffix").GetString());
        }
        using var tests = await Properties("tests/QuickerRpc.Runtime.Test/QuickerRpc.Runtime.Test.csproj", "-p:Configuration=Release");
        Assert.AreEqual("false", tests.RootElement.GetProperty("Properties").GetProperty("QkrpcV2PrivateDependencies").GetString());
    }

    private static async Task<JsonDocument> RunScenario(string scenario)
    {
        var output = await DotNet([_runner, _root, scenario], _root, CancellationToken.None);
        var json = output.Split('\n', StringSplitOptions.RemoveEmptyEntries).Single(line => line.TrimStart().StartsWith('{'));
        return JsonDocument.Parse(json);
    }

    private static async Task<string> BuildLibrary(string directory, string name, int revision, string source,
        string[] references, (string Name, string Source)[] additionalSources, CancellationToken token,
        (string File, string Name)[]? resources = null, bool executable = false, string? embeddingTarget = null, string[]? runtimeAssets = null)
    {
        var path = Path.Combine(_root, directory);
        Directory.CreateDirectory(path);
        string Escape(string value) => SecurityElement.Escape(value)!;
        var items = string.Join("", references.Select(reference => $"<Reference Include=\"{Escape(Path.GetFileNameWithoutExtension(reference))}\"><HintPath>{Escape(reference)}</HintPath><Private>{(embeddingTarget is null || (runtimeAssets ?? []).Contains(reference) ? "false" : "true")}</Private></Reference>"))
            + string.Join("", (resources ?? []).Select(resource => $"<EmbeddedResource Include=\"{Escape(resource.File)}\" LogicalName=\"{Escape(resource.Name)}\" />"))
            + string.Join("", (runtimeAssets ?? []).Select(resource => $"<RuntimeCopyLocalItems Include=\"{Escape(resource)}\" />"));
        // RuntimeCopyLocalItems here are pure fixture files, not NuGet package records; no fake deps manifest is needed by LoadFile.
        var import = embeddingTarget is null ? "" : $"<PropertyGroup><PrivateAssemblyVersionSuffix>0.14.8.{revision}</PrivateAssemblyVersionSuffix><GenerateDependencyFile>false</GenerateDependencyFile></PropertyGroup><Import Project=\"{Escape(embeddingTarget)}\" />";
        var project = $"<Project Sdk=\"Microsoft.NET.Sdk\"><PropertyGroup><TargetFramework>net10.0</TargetFramework><AssemblyName>{name}</AssemblyName><AssemblyVersion>0.14.8.{revision}</AssemblyVersion><ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable><OutputType>{(executable ? "Exe" : "Library")}</OutputType></PropertyGroup><ItemGroup>{items}</ItemGroup>{import}</Project>";
        var projectFile = Path.Combine(path, "Fixture.csproj");
        await File.WriteAllTextAsync(projectFile, project, token);
        await File.WriteAllTextAsync(Path.Combine(path, "Entry.cs"), source, token);
        foreach (var additional in additionalSources)
            await File.WriteAllTextAsync(Path.Combine(path, additional.Name), additional.Source, token);
        await DotNet(["build", projectFile, "-c", "Release", "--disable-build-servers", "--verbosity", "quiet", "-p:UseSharedCompilation=false"], path, token);
        return Path.Combine(path, "bin", "Release", "net10.0", name + ".dll");
    }

    private static async Task<string> DotNet(string[] arguments, string directory, CancellationToken token)
    {
        var start = new ProcessStartInfo("dotnet") { WorkingDirectory = directory, RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true };
        foreach (var argument in arguments) start.ArgumentList.Add(argument);
        foreach (var name in new[] { "DOTNET_STARTUP_HOOKS", "DOTNET_ADDITIONAL_DEPS", "DOTNET_SHARED_STORE", "CORECLR_ENABLE_PROFILING", "COR_ENABLE_PROFILING", "DOTNET_DiagnosticPorts" })
            start.Environment.Remove(name);
        start.Environment["DOTNET_CLI_HOME"] = Path.Combine(_root, "dotnet-home");
        start.Environment["DOTNET_CLI_TELEMETRY_OPTOUT"] = "1";
        start.Environment["DOTNET_SKIP_FIRST_TIME_EXPERIENCE"] = "1";
        start.Environment["DOTNET_NOLOGO"] = "1";
        start.Environment["DOTNET_GENERATE_ASPNET_CERTIFICATE"] = "false";
        start.Environment["DOTNET_ADD_GLOBAL_TOOLS_TO_PATH"] = "false";
        start.Environment["DOTNET_CLI_WORKLOAD_UPDATE_NOTIFY_DISABLE"] = "true";
        using var process = Process.Start(start) ?? throw new InvalidOperationException("Could not start owned dotnet fixture");
        var stdout = process.StandardOutput.ReadToEndAsync();
        var stderr = process.StandardError.ReadToEndAsync();
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(token);
        deadline.CancelAfter(TimeSpan.FromSeconds(45));
        try { await process.WaitForExitAsync(deadline.Token); }
        catch (OperationCanceledException)
        {
            if (!process.HasExited) process.Kill(entireProcessTree: true);
            await process.WaitForExitAsync(CancellationToken.None).WaitAsync(TimeSpan.FromSeconds(5));
            throw new TimeoutException("Owned dotnet fixture exceeded its deadline: " + string.Join(" ", arguments));
        }
        var output = await stdout;
        var error = await stderr;
        Assert.AreEqual(0, process.ExitCode, $"Owned dotnet fixture failed: {string.Join(" ", arguments)}\n{output}\n{error}");
        return output;
    }

    private static string FindRepository()
    {
        for (var path = new DirectoryInfo(AppContext.BaseDirectory); path is not null; path = path.Parent)
            if (File.Exists(Path.Combine(path.FullName, "QuickerRpc", "version.json"))) return path.FullName;
        throw new InvalidOperationException("Cannot locate this checkout for owned fixture outputs");
    }

    private static void AssertOwned(string path)
    {
        var relative = Path.GetRelativePath(_parent, path);
        Assert.IsTrue(relative.StartsWith("run-", StringComparison.Ordinal) && !relative.Contains(Path.DirectorySeparatorChar) && !Path.IsPathRooted(relative));
    }

    private static void RejectRedirectedAncestors(string path)
    {
        Assert.IsFalse(System.Text.RegularExpressions.Regex.IsMatch(path, @"(?:^|[/\\])(?:OneDrive[^/\\]*|Dropbox|iCloud[^/\\]*)(?:[/\\]|$)", System.Text.RegularExpressions.RegexOptions.IgnoreCase));
        for (var current = new DirectoryInfo(path); current is not null; current = current.Parent)
        {
            FileAttributes attributes;
            try { attributes = current.Attributes; }
            catch (FileNotFoundException) { continue; }
            catch (DirectoryNotFoundException) { continue; }
            if ((int)attributes == -1) continue;
            // Windows recall flags are not named by System.IO.FileAttributes on every target.
            const FileAttributes recallFlags = (FileAttributes)0x00440000;
            Assert.IsFalse((attributes & (FileAttributes.ReparsePoint | FileAttributes.Offline | recallFlags)) != 0,
                "Fixture output path cannot follow a reparse point or cloud placeholder: " + current.FullName);
        }
    }

    private static string RuntimeSource(bool current) => "namespace QuickerRpc.Runtime; public static class StepRunnerInputContractBuilder { public static string Build(object? catalog,object? request)=>\"old-two\";"
        + (current ? "public static string Build(object? catalog,object? request,string hostKind)=>\"new-three\";" : "") + "}";

    private static string EntrySource(bool current, bool transitive) => """
        using System.Reflection;
        namespace QuickerRpc.Plugin;
        public static class FixtureEntry {
          public static void Register()=>PluginCosturaAssemblyResolve.EnsureRegistered();
          public static Assembly? Resolve(string name,Assembly? requester)=>(Assembly?)typeof(PluginCosturaAssemblyResolve).GetMethod("OnResolve",BindingFlags.NonPublic|BindingFlags.Static)!.Invoke(null,new object?[]{null,new ResolveEventArgs(name,requester)});
          public static string Call()=>QuickerRpc.Runtime.StepRunnerInputContractBuilder.Build(null,null
        """ + (current ? ",\"v2\");" : ");")
        + (transitive ? "public static string ViaTransport()=>QuickerRpc.Transport.Bridge.Call();" : "") + "}";

    private const string RunnerSource = """
        using System.Reflection;
        using System.Text.Json;
        var root=args[0];var scenario=args[1];
        Assembly Load(string dir,string name)=>Assembly.LoadFile(Path.Combine(root,dir,"bin/Release/net10.0",name+".dll"));
        object? Invoke(Assembly asm,string name,params object?[] parameters)=>asm.GetType("QuickerRpc.Plugin.FixtureEntry")!.GetMethod(name)!.Invoke(null,parameters);
        var old=Load("legacy171","QuickerRpc.Plugin.Fixture.171");Invoke(old,"Register");
        var current=scenario=="legacy"?Load("legacy172","QuickerRpc.Plugin.Fixture.172"):Load("current","QuickerRpc.Plugin.Fixture.Current");Invoke(current,"Register");
        bool concurrentSameImage=false;
        if(scenario=="concurrent") {
          using var start=new ManualResetEventSlim();
          var pending=Enumerable.Range(0,16).Select(_=>Task.Run(()=>{start.Wait();return Invoke(current,"Resolve","QuickerRpc.Runtime.0.14.8.172, Version=0.14.8.172, Culture=neutral, PublicKeyToken=null",current);})).ToArray();
          start.Set();Task.WaitAll(pending);concurrentSameImage=pending[0].Result is Assembly&&pending.All(task=>ReferenceEquals(task.Result,pending[0].Result));
        }
        string? result=null,error=null;try {result=(string?)Invoke(current,scenario is "transitive" or "negative"?"ViaTransport":"Call");}catch(TargetInvocationException e){error=e.InnerException!.GetType().Name+": "+e.InnerException.Message;}
        bool ownedRequesterAccepted=false,sameIdentityDifferentMvid=false;var rejected=new Dictionary<string,bool>();
        if(scenario is "transitive" or "negative") {
          var runtime=AppDomain.CurrentDomain.GetAssemblies().Single(a=>a.GetName().Name=="QuickerRpc.Runtime.0.14.8.172");
          var transport=AppDomain.CurrentDomain.GetAssemblies().Single(a=>a.GetName().Name=="QuickerRpc.Transport.0.14.8.172");
          var identity=runtime.GetName();ownedRequesterAccepted=ReferenceEquals(runtime,Invoke(current,"Resolve",identity.FullName,transport));
          if(scenario=="negative") {
            rejected["foreignRequester"]=Invoke(current,"Resolve",identity.FullName,typeof(Program).Assembly) is null;
            rejected["nullRequester"]=Invoke(current,"Resolve",identity.FullName,null) is null;
            var wrong=new AssemblyName(identity.FullName){Version=new Version(0,14,8,171)};rejected["wrongVersion"]=Invoke(current,"Resolve",wrong.FullName,current) is null;
            wrong=new AssemblyName(identity.FullName){CultureName="fr-FR"};rejected["wrongCulture"]=Invoke(current,"Resolve",wrong.FullName,current) is null;
            wrong=new AssemblyName(identity.FullName);wrong.SetPublicKeyToken(Convert.FromHexString("0011223344556677"));rejected["wrongToken"]=Invoke(current,"Resolve",wrong.FullName,current) is null;
            wrong=new AssemblyName(identity.FullName){ContentType=AssemblyContentType.WindowsRuntime};rejected["wrongContentType"]=Invoke(current,"Resolve",wrong.FullName,current) is null;
            wrong=new AssemblyName(identity.FullName){Flags=AssemblyNameFlags.Retargetable};rejected["retargetable"]=Invoke(current,"Resolve",wrong.FullName,current) is null;
            var foreign=Load("foreign-transport","QuickerRpc.Transport.0.14.8.172");sameIdentityDifferentMvid=foreign.FullName==transport.FullName&&foreign.ManifestModule.ModuleVersionId!=transport.ManifestModule.ModuleVersionId;
            rejected["differentImageRequester"]=Invoke(current,"Resolve",identity.FullName,foreign) is null;
          }
        }
        var runtimes=AppDomain.CurrentDomain.GetAssemblies().Where(a=>a.GetName().Name!.StartsWith("QuickerRpc.Runtime")).Select(a=>new{name=a.GetName().Name,version=a.GetName().Version!.ToString(),mvid=a.ManifestModule.ModuleVersionId}).ToArray();
        var diagnostics=current.GetType("QuickerRpc.Plugin.PluginModuleInitializer") is not null&&AppDomain.CurrentDomain.GetAssemblies().Single(a=>a.GetName().Name=="QuickerRpc.Transport.0.14.8.172"&&a.GetType("QuickerRpc.Transport.TransportDiagnostics") is not null).GetType("QuickerRpc.Transport.TransportDiagnostics")!.GetField("Sink")!.GetValue(null) is not null;
        Console.WriteLine(JsonSerializer.Serialize(new{fakeOnly=true,oldHandlerRegistered=true,result,error,runtimes,ownedRequesterAccepted,sameIdentityDifferentMvid,concurrentSameImage,rejected,
          embeddedResources=current.GetManifestResourceNames(),generatedFallback=current.GetType("Costura.AssemblyLoader") is not null,diagnosticsInitialized=diagnostics}));
        """;
}
