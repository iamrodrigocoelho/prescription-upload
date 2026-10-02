declare module 'heic-decode' {
  interface DecodedImage {
    width: number;
    height: number;
    /** RGBA, 4 canais. */
    data: Uint8ClampedArray;
  }
  function decode(input: { buffer: Buffer | ArrayBuffer }): Promise<DecodedImage>;
  export default decode;
}
