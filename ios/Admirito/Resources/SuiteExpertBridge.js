// Transport only. Grammar, aliases, authorization and execution stay in the published suite engine.
(function () {
  'use strict';
  const trusted = () => location.protocol === 'https:' && ["admira.biz", "www.admira.biz", "admira.live", "www.admira.live", "admira.studio", "www.admira.studio", "admira.store", "www.admira.store", "admira.tv", "www.admira.tv", "admira.app", "www.admira.app", "admiranext.com", "www.admiranext.com", "yokup.com", "www.yokup.com", "pixeria.com", "www.pixeria.com", "xpaceos.com", "www.xpaceos.com"].includes(location.hostname);
  const requests = new Map();
  const ready = () => trusted() && !!window.AdmiraExperto && typeof window.AdmiraExperto.exec === 'function' && window.AdmiraExperto.has('admirito') && window.AdmiraExperto.has('help');
  window.AdmiritoSuiteBridge = {
    ready,
    async execute(command, requestID) {
      if (!ready()) return {state: 'not_ready', output: 'El modo Experto de admira.biz todavía no está listo.'};
      if (requests.has(requestID)) return requests.get(requestID);
      const pending = (async () => {
        const engine = window.AdmiraExperto;
        if (engine.admiritoReady) await engine.admiritoReady;
        engine.open();
        let log = document.querySelector('.ax-cli-out');
        if (!log) {
          log = document.createElement('ul'); log.id = 'admirito-native-output';
          log.setAttribute('aria-live', 'polite'); document.body.appendChild(log);
        }
        const result = await engine.exec(command, log, {echo: true});
        return {state: 'dispatched', ok: result?.ok !== false, output: String(log.innerText || log.textContent || '').slice(-6000)};
      })();
      requests.set(requestID, pending);
      return pending;
    }
  };
})();
