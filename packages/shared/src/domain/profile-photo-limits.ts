// Single PH1 contract. Bytes use KiB; jpeg-js resolution uses decimal megapixels.
export const PHOTO_LIMITS=Object.freeze({inputBytes:256*1024,inputEdge:1024,inputPixels:1024*1024,outputBytes:64*1024,outputEdge:256,bodyBytes:360*1024,decoderMemoryMiB:32});
export const PHOTO_INPUT_BASE64=4*Math.ceil(PHOTO_LIMITS.inputBytes/3);
export const PHOTO_OUTPUT_BASE64=4*Math.ceil(PHOTO_LIMITS.outputBytes/3);
export const PHOTO_DECODER_MP=PHOTO_LIMITS.inputPixels/1_000_000;
