/** Inline shell terminal typography (chat tool cards). */
export const SHELL_TERMINAL_FONT_SIZE_REM = 0.68;
export const SHELL_TERMINAL_LINE_HEIGHT = 1.38;

export function shellTerminalBlockMaxHeight(lineCount: number, paddingRem = 0.75): string {
  return `calc(${SHELL_TERMINAL_FONT_SIZE_REM}rem * ${SHELL_TERMINAL_LINE_HEIGHT} * ${lineCount} + ${paddingRem}rem)`;
}
