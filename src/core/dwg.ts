import { convertDwgToDxf } from 'dwgdxf'

/**
 * DWG support: read only, by conversion.
 *
 * DWG is Autodesk's closed binary format. This app does not parse it; the file is handed to
 * acadrust (LibreDWG's Rust port) compiled to WebAssembly, which converts it to DXF entirely in
 * the browser — the drawing never leaves the machine, and the rest of the app only ever sees a
 * DXF, the format it already reads.
 *
 * The WASM is lazy: nothing of it is fetched until a DWG is actually opened, and the runtime is
 * initialised once and reused. Conversion failures are reported as the message the user sees;
 * there is no partial result to salvage.
 */

export const isDwgFile = (name: string): boolean => name.toLowerCase().endsWith('.dwg')

/** Where the WASM assets are served from; copied into the build by vite's public directory. */
const WASM_BASE = '/dwgdxf-wasm'

export async function dwgToDxfText(bytes: Uint8Array): Promise<string> {
  /*
   * The WASM lives at a fixed public path rather than wherever the bundler emits it: the loader
   * resolves it relative to the JS chunk, and a hashed assets directory would break that.
   */
  const dxf = await convertDwgToDxf(bytes, { wasmBase: WASM_BASE })
  return new TextDecoder().decode(dxf)
}
