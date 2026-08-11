import { createCallbackProxy } from '../_shared/gis-callback.mjs';

const handle = createCallbackProxy({
  backendUrl:'https://api.yokup.com/auth/callback',
  publicOrigin:'https://www.yokup.com'
});

export function onRequest(context) { return handle(context.request); }
