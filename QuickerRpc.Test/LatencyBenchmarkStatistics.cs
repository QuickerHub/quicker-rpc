using System;
using System.Collections.Generic;
using System.Linq;

namespace QuickerRpc.Test;

internal static class LatencyBenchmarkStatistics
{
    internal sealed class Stats
    {
        public int SampleCount { get; init; }
        public double MinMs { get; init; }
        public double MaxMs { get; init; }
        public double MeanMs { get; init; }
        public double MedianMs { get; init; }
        public double P95Ms { get; init; }
    }

    internal static Stats FromSamples(IReadOnlyList<double> samplesMs)
    {
        if (samplesMs.Count == 0)
        {
            throw new ArgumentException("At least one sample is required.", nameof(samplesMs));
        }

        var sorted = samplesMs.OrderBy(static sample => sample).ToArray();
        var mean = sorted.Average();
        var p95Index = (int)Math.Ceiling(sorted.Length * 0.95) - 1;
        p95Index = Math.Max(0, Math.Min(p95Index, sorted.Length - 1));
        return new Stats
        {
            SampleCount = sorted.Length,
            MinMs = sorted[0],
            MaxMs = sorted[^1],
            MeanMs = mean,
            MedianMs = Percentile(sorted, 0.5),
            P95Ms = sorted[p95Index],
        };
    }

    private static double Percentile(double[] sorted, double percentile)
    {
        if (sorted.Length == 1)
        {
            return sorted[0];
        }

        var position = percentile * (sorted.Length - 1);
        var lowerIndex = (int)Math.Floor(position);
        var upperIndex = (int)Math.Ceiling(position);
        if (lowerIndex == upperIndex)
        {
            return sorted[lowerIndex];
        }

        var weight = position - lowerIndex;
        return sorted[lowerIndex] + (sorted[upperIndex] - sorted[lowerIndex]) * weight;
    }
}
