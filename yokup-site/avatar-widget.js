// Admirito de la suite: una única nube y el mismo panel de digitalavatar.ai.
// Estas páginas tenían un segundo widget con burbuja de robot y cabeza 3D.
// Se reutiliza el cargador común también para /admirito, /bugito y /avatar.
(function (root, doc) {
  'use strict';
  try { if (root.self !== root.top) return; } catch (_) { return; }
  if (root.YokupAdmiritoReady) return;

  function cargar() {
    if (root.AdmiraAvatar && root.AdmiraAvatar.floatingCharacters) return Promise.resolve(root.AdmiraAvatar);
    return new Promise(function (resolve, reject) {
      var script = doc.querySelector('script[data-admira-avatar]'), nuevo = !script;
      if (!script) {
        script = doc.createElement('script');
        script.src = 'https://www.admiranext.com/assets/avatar.js?v=20261014-yokup-admirito-1';
        script.async = true;
        script.setAttribute('data-admira-avatar', '');
        script.setAttribute('data-brain', '/avatar-ask');
      }
      script.addEventListener('load', function () {
        root.AdmiraAvatar ? resolve(root.AdmiraAvatar) : reject(new Error('Admirito no disponible'));
      }, { once: true });
      script.addEventListener('error', function () { reject(new Error('No se pudo cargar Admirito')); }, { once: true });
      if (nuevo) (doc.head || doc.documentElement).appendChild(script);
    });
  }

  root.YokupAdmiritoReady = cargar().then(function (A) {
    A.setContext({ site: 'yokup', sector: 'soporte', lang: doc.documentElement.lang || 'es', tier: 'good' });
    // Sustituye la presencia que ya tenía el copiloto; respeta el apagado explícito.
    if (A.state().override === 'off') return A;
    return Promise.resolve(A.show(false, 'good')).then(function () {
      var nube = doc.getElementById('da-suite-bubble');
      if (nube) { nube.setAttribute('aria-label', 'Admirito'); nube.title = 'Admirito'; }
      return A;
    });
  });
  root.YokupAdmiritoReady.catch(function () {
    if (root.console) root.console.warn('Admirito no ha cargado. Recarga la página para volver a intentarlo.');
  });
})(window, document);
