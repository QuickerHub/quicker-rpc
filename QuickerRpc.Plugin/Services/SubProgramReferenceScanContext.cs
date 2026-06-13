using System;
using System.Collections.Generic;
using Quicker.Domain.Actions.X;

namespace QuickerRpc.Plugin.Services;

/// <summary>Precomputed needles for fast subprogram reference prefilter before JSON parse.</summary>
internal sealed class SubProgramReferenceScanContext
{
    private const string SubProgramStepMarker = "sys:subprogram";

    private readonly SubProgram _target;
    private readonly string? _callIdentifier;
    private readonly string[] _needles;

    private SubProgramReferenceScanContext(SubProgram target, string? callIdentifier, string[] needles)
    {
        _target = target;
        _callIdentifier = callIdentifier;
        _needles = needles;
    }

    public SubProgram Target => _target;

    public string? CallIdentifier => _callIdentifier;

    public string TargetId => (_target.Id ?? string.Empty).Trim();

    public static SubProgramReferenceScanContext Create(SubProgram target, string? callIdentifier)
    {
        var needles = new List<string>(4);
        AddNeedle(needles, target.Name);
        AddNeedle(needles, target.Id);
        AddNeedle(needles, callIdentifier);
        if (!string.IsNullOrWhiteSpace(callIdentifier))
        {
            AddNeedle(needles, callIdentifier.Trim().TrimStart('%').TrimEnd('%'));
        }

        return new SubProgramReferenceScanContext(target, callIdentifier, needles.ToArray());
    }

    public bool BodyMayReference(string? bodyJson)
    {
        if (string.IsNullOrEmpty(bodyJson))
        {
            return false;
        }

        if (bodyJson.IndexOf(SubProgramStepMarker, StringComparison.OrdinalIgnoreCase) < 0)
        {
            return false;
        }

        for (var i = 0; i < _needles.Length; i++)
        {
            if (bodyJson.IndexOf(_needles[i], StringComparison.OrdinalIgnoreCase) >= 0)
            {
                return true;
            }
        }

        return false;
    }

    private static void AddNeedle(List<string> needles, string? value)
    {
        var trimmed = (value ?? string.Empty).Trim();
        if (trimmed.Length == 0)
        {
            return;
        }

        for (var i = 0; i < needles.Count; i++)
        {
            if (string.Equals(needles[i], trimmed, StringComparison.OrdinalIgnoreCase))
            {
                return;
            }
        }

        needles.Add(trimmed);
    }
}
