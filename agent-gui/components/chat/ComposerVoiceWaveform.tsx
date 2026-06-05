type ComposerVoiceWaveformProps = {
  active?: boolean;
  busy?: boolean;
  className?: string;
};

export function ComposerVoiceWaveform({
  active = true,
  busy = false,
  className = "",
}: ComposerVoiceWaveformProps) {
  return (
    <span
      className={[
        "composer-voice-wave",
        active ? "composer-voice-wave--active" : "",
        busy ? "composer-voice-wave--busy" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden
    >
      {[0, 1, 2, 3, 4].map((index) => (
        <span
          key={index}
          className="composer-voice-wave-bar"
          style={{ animationDelay: `${index * 0.12}s` }}
        />
      ))}
    </span>
  );
}
