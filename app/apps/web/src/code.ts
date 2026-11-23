const CODE = /^[0-9A-HJKMNP-TV-Z]{6}$/;

/** Shows a six-character join code in two groups of three, e.g. `K7Q·2MX`. */
export const groupCode = (code: string): string => `${code.slice(0, 3)}·${code.slice(3)}`;

/** Reads a typed join code, ignoring case, spaces and group dots; undefined unless it is well formed. */
export function normaliseCode(input: string): string | undefined {
  const code = input.toUpperCase().replace(/[\s·.]/g, '');
  return CODE.test(code) ? code : undefined;
}

/** A well-formed code to show as an example. */
export const EXAMPLE_CODE = groupCode('K7Q2MX');
