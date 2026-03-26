(function () {
  'use strict';

  function getFrameOrigin(iframe) {
    try {
      return new URL(iframe.src, window.location.href).origin;
    } catch (error) {
      return null;
    }
  }

  function clampHeight(height, minHeight) {
    var parsed = Number(height);
    if (!Number.isFinite(parsed)) return minHeight;
    return Math.max(minHeight, Math.ceil(parsed));
  }

  function bindContainerLoading(container) {
    if (!container) return;

    var iframe = container.querySelector('iframe');
    if (!iframe) {
      container.classList.remove('is-loading');
      return;
    }

    var resolved = false;
    var finishLoading = function () {
      if (resolved) return;
      resolved = true;
      container.classList.remove('is-loading');
    };

    iframe.addEventListener('load', finishLoading, { once: true });
    window.setTimeout(finishLoading, 10_000);
  }

  function findIframeBySource(sourceWindow) {
    if (!sourceWindow) return null;
    var iframes = document.querySelectorAll('.seven-academy-container iframe');
    for (var i = 0; i < iframes.length; i += 1) {
      var iframe = iframes[i];
      if (iframe.contentWindow === sourceWindow) {
        return iframe;
      }
    }
    return null;
  }

  function onResizeMessage(event) {
    if (!event || !event.data || typeof event.data !== 'object') return;
    if (event.data.type !== 'seven-academy:resize') return;

    var iframe = findIframeBySource(event.source);
    if (!iframe) return;

    var frameOrigin = getFrameOrigin(iframe);
    if (frameOrigin && event.origin && frameOrigin !== event.origin) {
      return;
    }

    var container = iframe.closest('.seven-academy-container');
    var minHeight = Number(iframe.dataset.minHeightPx || 720);
    var nextHeight = clampHeight(event.data.height, minHeight);

    iframe.style.height = nextHeight + 'px';
    iframe.style.minHeight = nextHeight + 'px';
    iframe.style.overflow = 'hidden';

    if (container) {
      container.classList.add('is-auto-height');
      container.classList.remove('is-loading');
    }
  }

  function initSevenAcademyContainers() {
    var containers = document.querySelectorAll('.seven-academy-container.is-loading');
    if (!containers.length) return;

    containers.forEach(bindContainerLoading);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSevenAcademyContainers);
  } else {
    initSevenAcademyContainers();
  }

  window.addEventListener('message', onResizeMessage);
  window.addEventListener('pageshow', initSevenAcademyContainers);
})();
