export type VoiceChatPhase =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

export type VoiceChatTurn = {
  role: "user" | "assistant";
  text: string;
};

export type VoiceChatMessage = VoiceChatTurn & {
  id: string;
  at: number;
};
