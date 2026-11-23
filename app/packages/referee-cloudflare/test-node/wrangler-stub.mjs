// Stands in for wrangler in the deploy guard's tests: prints the arguments it was given and exits.
process.stdout.write(`WRANGLER_STUB_ARGV ${JSON.stringify(process.argv.slice(2))}\n`);
