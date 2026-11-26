// Command-line option parsing shared by the development scripts.

/**
 * The value of option `name` in `args`, given as `--name value` or `--name=value`, or `fallback`
 * when the option is absent. Throws, listing `allowed`, when the value is not one of them.
 */
export function optionValue(args, name, allowed, fallback) {
  const flag = `--${name}`;
  const at = args.findIndex((arg) => arg === flag || arg.startsWith(`${flag}=`));
  if (at === -1) return fallback;
  const value = args[at].includes('=') ? args[at].slice(flag.length + 1) : args[at + 1];
  if (!allowed.includes(value)) {
    throw new Error(`${flag} takes one of ${allowed.join(', ')}; got ${value ?? 'nothing'}`);
  }
  return value;
}
