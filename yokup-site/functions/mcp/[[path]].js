// /mcp del espejo. GET de navegador sigue al asset (y el middleware de la casa
// lo marca). POST, OPTIONS y la galaxia se los lleva el guardián.
import { responderMcp } from "../_shared/mcp-espejo.mjs";

export function onRequest(context) {
  return responderMcp(context.request, { next: () => context.next(), fetchImpl: fetch });
}
