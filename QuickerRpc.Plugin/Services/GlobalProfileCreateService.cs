using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;
using Quicker.Common;
using Quicker.Domain;
using Quicker.Domain.Entities;
using Quicker.Domain.Profiles;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Creates blank global action profile pages via Quicker's native AddProfile path.
/// </summary>
public sealed class GlobalProfileCreateService
{
    private static readonly Regex GlobalNumberedName =
        new(@"#\s*(\d+)\s*$", RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private readonly ProfileManagerAccessor? _profileManager;

    public GlobalProfileCreateService()
    {
        _profileManager = ProfileManagerAccessor.TryCreate();
    }

    public QuickerRpcCreateGlobalProfilesResult CreateGlobalProfiles(int count, bool insertAfterFirstPage)
    {
        if (count <= 0)
        {
            return Fail("count must be greater than 0.");
        }

        if (count > 20)
        {
            return Fail("count must be 20 or less.");
        }

        if (_profileManager is null)
        {
            return Fail("Not running inside Quicker (ProfileManager unavailable).");
        }

        try
        {
            var manager = _profileManager.Instance;
            var profiles = manager.GetGlobalProfiles(filterByMachine: true)
                .Where(p => p is not null)
                .Cast<ActionProfile>()
                .ToList();
            if (profiles.Count == 0)
            {
                return Fail("No global profiles found.");
            }

            var anchor = profiles.FirstOrDefault(p =>
                             string.Equals(p.Name, "_global", StringComparison.OrdinalIgnoreCase))
                         ?? profiles.OrderBy(p => p.ListOrder).ThenBy(p => p.Name, StringComparer.OrdinalIgnoreCase).First();

            var insertAt = insertAfterFirstPage ? anchor.ListOrder + 1 : NextListOrder(profiles);
            if (insertAfterFirstPage)
            {
                ShiftListOrders(manager, profiles, insertAt, count);
            }

            var items = new List<QuickerRpcCreatedProfileItem>();
            var nextNumber = NextGlobalNumber(profiles);
            var createdIds = new List<string>();
            for (var i = 0; i < count; i++)
            {
                var profileName = $"全局 #{nextNumber + i}";
                var dto = new CreateProfileDto
                {
                    ExeFile = ActionProfile.ExeName_Global,
                    ProfileName = profileName,
                    ListOrder = insertAt + i,
                };

                var created = AppState.AppServer.AddProfile(dto);
                manager.SaveProfile(created);
                profiles.Add(created);
                createdIds.Add(created.Id);
                items.Add(new QuickerRpcCreatedProfileItem
                {
                    ProfileId = created.Id,
                    ProfileName = created.Name ?? profileName,
                    ListOrder = created.ListOrder,
                });
            }

            if (insertAfterFirstPage
                && !GlobalExeSettingsAccessor.TryInsertProfilesAfter(anchor.Id ?? string.Empty, createdIds, out var orderError))
            {
                return Fail(orderError ?? "Could not update global profile tab order.");
            }

            return new QuickerRpcCreateGlobalProfilesResult
            {
                Ok = true,
                Message = insertAfterFirstPage
                    ? $"已在「{anchor.Name}」后创建 {count} 个空白全局动作页。"
                    : $"已创建 {count} 个空白全局动作页。",
                InsertAfterProfileId = insertAfterFirstPage ? anchor.Id : null,
                InsertAfterProfileName = insertAfterFirstPage ? anchor.Name : null,
                Items = items,
            };
        }
        catch (Exception ex)
        {
            return Fail(ex.Message);
        }
    }

    private static int NextListOrder(IEnumerable<ActionProfile> profiles) =>
        profiles.Select(p => p.ListOrder).DefaultIfEmpty(-1).Max() + 1;

    private static void ShiftListOrders(
        ProfileManager manager,
        IReadOnlyList<ActionProfile> profiles,
        int insertAt,
        int count)
    {
        foreach (var profile in profiles
                     .Where(p => p.ListOrder >= insertAt)
                     .OrderByDescending(p => p.ListOrder))
        {
            profile.ListOrder += count;
            manager.SaveProfile(profile);
        }
    }

    private static int NextGlobalNumber(IEnumerable<ActionProfile> profiles)
    {
        var max = 0;
        foreach (var profile in profiles)
        {
            var name = profile.Name ?? string.Empty;
            var match = GlobalNumberedName.Match(name);
            if (match.Success
                && int.TryParse(match.Groups[1].Value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var n))
            {
                max = Math.Max(max, n);
            }
        }

        return max + 1;
    }

    private static QuickerRpcCreateGlobalProfilesResult Fail(string message) =>
        new() { Ok = false, Message = message };

    public QuickerRpcCreateGlobalProfilesResult ReorderGlobalProfilesAfterFirst(IReadOnlyList<string> profileIds)
    {
        if (profileIds.Count == 0)
        {
            return Fail("profileIds is required.");
        }

        if (_profileManager is null)
        {
            return Fail("Not running inside Quicker (ProfileManager unavailable).");
        }

        try
        {
            var profiles = _profileManager.Instance.GetGlobalProfiles(filterByMachine: true)
                .Where(p => p is not null)
                .Cast<ActionProfile>()
                .ToList();
            var anchor = profiles.FirstOrDefault(p =>
                             string.Equals(p.Name, "_global", StringComparison.OrdinalIgnoreCase))
                         ?? profiles.OrderBy(p => p.ListOrder).ThenBy(p => p.Name, StringComparer.OrdinalIgnoreCase).FirstOrDefault();
            if (anchor is null)
            {
                return Fail("No global anchor profile found.");
            }

            if (!GlobalExeSettingsAccessor.TryInsertProfilesAfter(anchor.Id ?? string.Empty, profileIds, out var orderError))
            {
                return Fail(orderError ?? "Could not update global profile tab order.");
            }

            var idSet = new HashSet<string>(profileIds, StringComparer.OrdinalIgnoreCase);
            var items = profiles
                .Where(p => idSet.Contains(p.Id))
                .Select(p => new QuickerRpcCreatedProfileItem
                {
                    ProfileId = p.Id,
                    ProfileName = p.Name ?? string.Empty,
                    ListOrder = p.ListOrder,
                })
                .ToList();

            return new QuickerRpcCreateGlobalProfilesResult
            {
                Ok = true,
                Message = $"已将 {profileIds.Count} 个动作页移动到「{anchor.Name}」之后。",
                InsertAfterProfileId = anchor.Id,
                InsertAfterProfileName = anchor.Name,
                Items = items,
            };
        }
        catch (Exception ex)
        {
            return Fail(ex.Message);
        }
    }
}
