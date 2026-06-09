"use client";

type DigitalAvatarProps = {
  speaking: boolean;
  phaseLabel: string;
};

export function DigitalAvatar({ speaking, phaseLabel }: DigitalAvatarProps) {
  return (
    <div
      className={`voice-chat-avatar${speaking ? " voice-chat-avatar--speaking" : ""}`}
      aria-label="数字人"
    >
      <div className="voice-chat-avatar__glow" />
      <div className="voice-chat-avatar__face">
        <div className="voice-chat-avatar__eyes">
          <span />
          <span />
        </div>
        <div className="voice-chat-avatar__mouth" />
      </div>
      <p className="voice-chat-avatar__phase">{phaseLabel}</p>
    </div>
  );
}
