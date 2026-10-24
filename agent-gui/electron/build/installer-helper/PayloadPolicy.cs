using System;
using System.IO;
using System.Reflection;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text.RegularExpressions;

namespace QuickerAgent.Installer
{
    // Shared build-time and installed-target classification. The exact JSON is
    // embedded into the helper; it never reads a user's policy/configuration file.
    public static class PayloadPolicy
    {
        [DataContract] private sealed class Rules
        {
            [DataMember(Name = "directories")] public string[] Directories { get; set; }
            [DataMember(Name = "cloudDirectories")] public string[] CloudDirectories { get; set; }
            [DataMember(Name = "files")] public string[] Files { get; set; }
            [DataMember(Name = "extensions")] public string[] Extensions { get; set; }
            [DataMember(Name = "patterns")] public string[] Patterns { get; set; }
        }
        private static readonly Rules Policy = Load();
        private static Rules Load()
        {
            using (var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("QuickerAgent.Installer.Payload"))
            {
                if (stream == null) throw new IOException("Missing embedded installer payload policy.");
                var rules = (Rules)new DataContractJsonSerializer(typeof(Rules)).ReadObject(stream);
                if (rules.Directories == null || rules.CloudDirectories == null || rules.Files == null || rules.Extensions == null || rules.Patterns == null) throw new IOException("Invalid payload policy.");
                return rules;
            }
        }
        private static bool Has(string[] values, string name) { return Array.IndexOf(values, name.ToLowerInvariant()) >= 0; }
        public static bool IsDirectory(string name) { return Has(Policy.Directories, name); }
        public static bool IsCloudPath(string path, bool directory)
        {
            var segments = path.Replace('/', '\\').ToLowerInvariant().Split('\\');
            for (int index = 0; index < segments.Length - (directory ? 0 : 1); index++)
                foreach (string pattern in Policy.CloudDirectories)
                    if (pattern.EndsWith("*", StringComparison.Ordinal) ? segments[index].StartsWith(pattern.Substring(0, pattern.Length - 1), StringComparison.Ordinal) : segments[index] == pattern)
                        return true;
            return false;
        }
        public static bool IsRootFile(string name)
        {
            if (Path.GetFileName(name) != name) return false;
            name = name.ToLowerInvariant();
            if (Has(Policy.Files, name) || Has(Policy.Extensions, Path.GetExtension(name))) return true;
            foreach (string pattern in Policy.Patterns) if (Regex.IsMatch(name, pattern, RegexOptions.CultureInvariant)) return true;
            return false;
        }
    }
}
