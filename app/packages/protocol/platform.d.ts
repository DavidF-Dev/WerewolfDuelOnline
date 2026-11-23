// The web platform APIs this package uses, for builds without the DOM library.

interface TextEncoder {
  encode(input?: string): Uint8Array;
}

declare var TextEncoder: {
  prototype: TextEncoder;
  new (): TextEncoder;
};
