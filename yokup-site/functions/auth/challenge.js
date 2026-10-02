import { createChallengeProxy } from '../_shared/gis-callback.mjs';
import { publicOriginFor } from '../_shared/casas.mjs';

// El backend es el mismo worker para todas las casas; lo que cambia es en nombre de
// qué web se le habla. El espejo admira.biz se presenta como admira.biz, y así el
// login vuelve a admira.biz en vez de a yokup.com.
const handlers = new Map();
function handlerFor(request) {
  const publicOrigin = publicOriginFor(request);
  if (!handlers.has(publicOrigin)) {
    handlers.set(publicOrigin, createChallengeProxy({ backendUrl:'https://api.yokup.com/auth/challenge', publicOrigin }));
  }
  return handlers.get(publicOrigin);
}

export function onRequest(context) { return handlerFor(context.request)(context.request); }
