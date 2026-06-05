import {
  HighlightStyle,
  LanguageSupport,
  StreamLanguage,
  syntaxHighlighting,
} from "@codemirror/language";
import { Tag } from "@lezer/highlight";
import type { Extension } from "@codemirror/state";

const terminalPromptTag = Tag.define();
const terminalCommandTag = Tag.define();
const terminalErrorTag = Tag.define();

type TerminalTokenState = {
  commandLine: boolean;
};

const terminalTranscriptLanguage = StreamLanguage.define<TerminalTokenState>({
  name: "terminal",
  startState: () => ({ commandLine: false }),
  token(stream, state) {
    if (stream.sol()) {
      state.commandLine = false;
      if (stream.match("$")) {
        if (stream.peek() === " ") stream.next();
        state.commandLine = !stream.eol();
        return "terminalPrompt";
      }
      if (stream.match("[error]") || stream.match("[blocked]")) {
        stream.skipToEnd();
        return "terminalError";
      }
    } else if (state.commandLine) {
      stream.skipToEnd();
      state.commandLine = false;
      return "terminalCommand";
    }

    stream.next();
    return null;
  },
  tokenTable: {
    terminalPrompt: terminalPromptTag,
    terminalCommand: terminalCommandTag,
    terminalError: terminalErrorTag,
  },
});

const terminalTranscriptHighlightStyle = HighlightStyle.define([
  {
    tag: terminalPromptTag,
    color: "#6e9a7a",
  },
  {
    tag: terminalCommandTag,
    color: "#8b949e",
  },
  {
    tag: terminalErrorTag,
    color: "var(--danger, #c97870)",
  },
]);

export function terminalTranscriptCodeMirror(): Extension {
  return new LanguageSupport(terminalTranscriptLanguage, [
    syntaxHighlighting(terminalTranscriptHighlightStyle),
  ]);
}
