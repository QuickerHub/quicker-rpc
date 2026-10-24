/** Native default: keep short lists visible and collapse four or more full advanced rows. */
export function shouldExpandAdvancedParamSection(paramsTabFieldCount: number): boolean {
  return paramsTabFieldCount < 4;
}
