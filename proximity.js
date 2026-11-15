(() => {
  "use strict";

  function findProximity(people, origin, mode, getPoint) {
    if (!origin || !mode) return null;
    let result = null;
    let bestDistance = mode === "closest" ? Infinity : -Infinity;
    for (const person of people) {
      const point = getPoint(person);
      if (!point) continue;
      const distance = (point.x - origin.x) ** 2 + (point.y - origin.y) ** 2;
      if (mode === "closest" ? distance < bestDistance : distance > bestDistance) {
        result = person;
        bestDistance = distance;
      }
    }
    return result;
  }

  function setProximityLabel(toggle, mode, name, emptyLabel = "No visible people") {
    const label = mode ? (name ? `${mode === "closest" ? "Closest" : "Furthest"}: ${name}` : emptyLabel) : "Proximity";
    const description = mode ? `Current ${mode}: ${name ?? label}` : label;
    if (toggle.firstElementChild.textContent !== label) toggle.firstElementChild.textContent = label;
    if (toggle.getAttribute("aria-label") !== description) toggle.setAttribute("aria-label", description);
    if (toggle.title !== description) toggle.title = description;
  }

  function setupProximityMenu(toggle, menu, closest, furthest, draw) {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const duration = 700 / 1.15;
    const pulseDuration = 400;
    let frame = null;
    let start = 0;
    let progress = 1;
    let pulseProgress = -1;
    let pulseTarget;
    let active = null;
    const stopSweep = () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = null;
      progress = 1;
      pulseProgress = -1;
      pulseTarget = undefined;
      active = null;
    };
    const tick = time => {
      frame = null;
      if (!active.checked) return stopSweep();
      const elapsed = Math.max(0, time - start);
      progress = Math.min(1, elapsed / duration);
      pulseProgress = elapsed >= duration ? Math.min(1, (elapsed - duration) / pulseDuration) : -1;
      draw();
      if (pulseProgress < 1) frame = window.requestAnimationFrame(tick);
    };
    const startSweep = () => {
      stopSweep();
      active = closest.checked ? closest : furthest.checked ? furthest : null;
      if (active && !reducedMotion.matches) {
        progress = 0;
        start = window.performance.now();
        frame = window.requestAnimationFrame(tick);
      }
      draw();
    };
    reducedMotion.addEventListener("change", () => {
      if (reducedMotion.matches && frame !== null) {
        stopSweep();
        draw();
      }
    });
    const close = (restoreFocus = false) => {
      if (menu.hidden) return;
      menu.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
      if (restoreFocus) toggle.focus();
    };
    toggle.addEventListener("click", () => {
      if (!menu.hidden) return close();
      menu.hidden = false;
      toggle.setAttribute("aria-expanded", "true");
      menu.style.left = "0px";
      const overflow = menu.getBoundingClientRect().right - document.documentElement.clientWidth;
      if (overflow > 0) menu.style.left = `${-overflow}px`;
    });
    toggle.parentElement.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(true);
      }
    });
    toggle.parentElement.addEventListener("focusout", event => {
      if (!toggle.parentElement.contains(event.relatedTarget)) close();
    });
    document.addEventListener("pointerdown", event => {
      if (!toggle.parentElement.contains(event.target)) close();
    });
    for (const [checkbox, other] of [[closest, furthest], [furthest, closest]]) {
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) other.checked = false;
        startSweep();
      });
    }
    const pulseFor = target => {
      if (pulseProgress < 0) return 1;
      if (pulseTarget === undefined) pulseTarget = target;
      if (target == null || target !== pulseTarget) return 1;
      return 1 + 0.5 * Math.sin(Math.PI * pulseProgress) ** 2;
    };
    return { close, start: startSweep, progress: () => progress, pulseFor };
  }

  function drawProximityLine(context, from, to, mode, progress = 1) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    context.save();
    context.strokeStyle = "rgba(0, 0, 0, 0.23)";
    context.beginPath();
    if (mode === "closest") {
      const radius = 10;
      const angle = Math.atan2(dy, dx);
      const offsetX = -Math.sin(angle) * radius;
      const offsetY = Math.cos(angle) * radius;
      context.lineWidth = 2;
      if (progress < 1) {
        if (progress <= 0) {
          context.restore();
          return;
        }
        const perimeter = 2 * length + 2 * Math.PI * radius;
        context.setLineDash([perimeter * progress, perimeter]);
        context.lineDashOffset = 0;
      }
      context.moveTo(from.x + offsetX, from.y + offsetY);
      context.lineTo(to.x + offsetX, to.y + offsetY);
      context.arc(to.x, to.y, radius, angle + Math.PI / 2, angle - Math.PI / 2, true);
      context.lineTo(from.x - offsetX, from.y - offsetY);
      context.arc(from.x, from.y, radius, angle - Math.PI / 2, angle + Math.PI / 2, true);
      context.closePath();
    } else {
      context.lineWidth = 1;
      context.moveTo(from.x, from.y);
      const end = length * progress;
      const pointAt = distance => {
        const wave = 3 * Math.sin(2 * Math.PI * distance / 10) *
          Math.min(1, distance / 10, (length - distance) / 10);
        context.lineTo(from.x + (dx * distance - dy * wave) / length,
          from.y + (dy * distance + dx * wave) / length);
      };
      for (let distance = 0.5; distance < end; distance += 0.5) {
        pointAt(distance);
      }
      if (length) pointAt(end);
    }
    context.stroke();
    context.restore();
  }

  function drawProximityCanvas(canvas, context, width, height, from, to, mode, progress = 1) {
    const scale = window.devicePixelRatio || 1;
    const canvasWidth = Math.round(width * scale);
    const canvasHeight = Math.round(height * scale);
    if (canvas.width !== canvasWidth) canvas.width = canvasWidth;
    if (canvas.height !== canvasHeight) canvas.height = canvasHeight;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.clearRect(0, 0, width, height);
    if (from && to) drawProximityLine(context, from, to, mode, progress);
  }

  window.thePearProximity = {
    findProximity, setProximityLabel, setupProximityMenu, drawProximityLine, drawProximityCanvas
  };
})();
