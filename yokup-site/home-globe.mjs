// Natural Earth land geometry is public domain; it contains no platform/customer data.
export function worldStyle() {
  return {
    version: 8,
    projection: {type: 'globe'},
    sources: {land: {type: 'geojson', data: '/assets/world-land.geojson', attribution: '<a href="https://www.naturalearthdata.com/">Natural Earth</a>'}},
    layers: [
      {id: 'ocean', type: 'background', paint: {'background-color': '#edf2e6'}},
      {id: 'land', type: 'fill', source: 'land', paint: {'fill-color': '#53785b', 'fill-outline-color': '#628967'}}
    ]
  };
}

// Separate elapsed-time rotation from rendering so pauses never cause a camera jump.
export class GlobeRotation {
  constructor({readCenter, writeCenter, requestFrame, cancelFrame, reducedMotion = false}) {
    Object.assign(this, {readCenter, writeCenter, requestFrame, cancelFrame});
    this.enabled = !reducedMotion;
    this.visible = true;
    this.ready = false;
    this.frame = null;
    this.previous = null;
  }
  update(values) {
    Object.assign(this, values);
    if (this.frame !== null) this.cancelFrame(this.frame);
    this.frame = null;
    this.previous = null;
    if (this.enabled && this.visible && this.ready) this.frame = this.requestFrame(time => this.tick(time));
  }
  tick(time) {
    if (!this.enabled || !this.visible || !this.ready) return;
    if (this.previous !== null) {
      const elapsed = Math.min(Math.max(time - this.previous, 0), 100);
      const center = this.readCenter();
      // 2.4 degrees/second, independent of the screen refresh rate.
      const lng = ((center.lng + elapsed * .0024 + 180) % 360 + 360) % 360 - 180;
      this.writeCenter([lng, center.lat]);
    }
    this.previous = time;
    this.frame = this.requestFrame(next => this.tick(next));
  }
  dispose() { this.update({ready: false}); }
}

export function startHomeGlobe() {
  const container = document.getElementById('home-globe');
  if (!container) return;
  const loading = document.getElementById('globe-loading');
  const failure = document.getElementById('globe-error');
  const toolbar = document.getElementById('globe-toolbar');
  const toggle = document.getElementById('globe-toggle');
  const reset = document.getElementById('globe-reset');
  const retry = document.getElementById('globe-retry');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let map, rotation, observer, resize, timeout, inView = true, failed = false, touched = false;
  const homeZoom = () => Math.log2(Math.max(200, Math.min(container.clientWidth, container.clientHeight)) * .82 * Math.PI / 512);
  const setButton = () => {
    toggle.textContent = rotation.enabled ? 'Pausar giro' : 'Reanudar giro';
    toggle.setAttribute('aria-pressed', String(!rotation.enabled));
  };
  const visible = () => rotation?.update({visible: inView && !document.hidden});
  const pause = () => { touched = true; rotation?.update({enabled: false}); if (rotation) setButton(); };
  function cleanup() {
    clearTimeout(timeout);
    rotation?.dispose(); observer?.disconnect(); resize?.disconnect();
    if (map) { map.remove(); map = null; }
  }
  function showFailure() {
    if (failed) return;
    failed = true;
    cleanup();
    loading.hidden = true; failure.hidden = false; toolbar.hidden = true;
  }
  function initialise() {
    cleanup(); failed = false; touched = false;
    loading.hidden = false; failure.hidden = true; toolbar.hidden = true;
    try {
      if (!window.maplibregl?.Map) throw new Error('Map renderer unavailable');
      map = new window.maplibregl.Map({
        container, style: worldStyle(), center: [-20, 18], zoom: homeZoom(),
        minZoom: .1, maxZoom: 4, pitch: 0, bearing: 0,
        attributionControl: {compact: true}, renderWorldCopies: false,
        scrollZoom: false, dragRotate: false, touchPitch: false,
        canvasContextAttributes: {antialias: true}
      });
      map.touchZoomRotate.disableRotation();
      map.getCanvas().setAttribute('aria-label', 'Explorar el globo terráqueo');
      rotation = new GlobeRotation({
        readCenter: () => map.getCenter(), writeCenter: center => map.jumpTo({center}),
        requestFrame: fn => requestAnimationFrame(fn), cancelFrame: id => cancelAnimationFrame(id),
        reducedMotion: motion.matches
      });
      setButton();
      map.on('style.load', () => {
        map.setSky({'sky-color': '#ffffff', 'horizon-color': '#e4edd8', 'fog-color': '#ffffff',
          'sky-horizon-blend': .9, 'horizon-fog-blend': .8, 'fog-ground-blend': .1,
          'atmosphere-blend': .45});
      });
      map.once('load', () => {
        if (failed) return;
        clearTimeout(timeout); loading.hidden = true; toolbar.hidden = false;
        rotation.update({ready: true, visible: inView && !document.hidden});
      });
      // Only user interactions pause rotation, never our own camera updates.
      for (const event of ['dragstart', 'zoomstart', 'rotatestart']) map.on(event, e => { if (e.originalEvent) pause(); });
      map.getCanvas().addEventListener('pointerdown', pause, {passive: true});
      map.getCanvas().addEventListener('keydown', pause);
      map.getCanvas().addEventListener('webglcontextlost', showFailure);
      map.on('error', e => { if (e.sourceId === 'land' || !map?.isStyleLoaded()) showFailure(); });
      observer = new IntersectionObserver(entries => { inView = entries[0].isIntersecting; visible(); });
      observer.observe(container);
      resize = new ResizeObserver(() => {
        if (!map) return;
        map.resize();
        if (!touched) map.jumpTo({zoom: homeZoom()});
      });
      resize.observe(container);
      timeout = setTimeout(() => { if (!rotation.ready) showFailure(); }, 20000);
    } catch (error) { console.warn('Yokup globe:', error); showFailure(); }
  }
  toggle.addEventListener('click', () => { rotation.update({enabled: !rotation.enabled}); setButton(); });
  reset.addEventListener('click', () => {
    touched = false;
    map.jumpTo({center: [-20, 18], zoom: homeZoom(), bearing: 0, pitch: 0});
    rotation.update({enabled: !motion.matches}); setButton();
  });
  retry.addEventListener('click', initialise);
  document.addEventListener('visibilitychange', visible);
  motion.addEventListener('change', () => { if (rotation) { rotation.update({enabled: !motion.matches}); setButton(); } });
  window.addEventListener('pagehide', cleanup);
  window.addEventListener('pageshow', event => { if (event.persisted) initialise(); });
  initialise();
}
if (typeof window !== 'undefined') {
  if (document.readyState === 'complete') startHomeGlobe();
  else window.addEventListener('load', startHomeGlobe, {once: true});
}
