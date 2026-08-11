import { createChallengeProxy } from '../_shared/gis-callback.mjs';

const handle = createChallengeProxy({
  backendUrl:'https://api.yokup.com/auth/challenge',
  publicOrigin:'https://www.yokup.com'
});

export function onRequest(context) { return handle(context.request); }
