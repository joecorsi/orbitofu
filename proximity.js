(() => {
  "use strict";

  function findProximity(people, origin, mode, getPoint, center) {
    if (!origin || !mode) return null;
    const axis = mode === "verticalSymmetry" ? "x" : mode === "horizontalSymmetry" ? "y" : null;
    const axisValue = axis && center[axis];
    if (axis && origin[axis] === axisValue) return null;
    const target = axis ? { ...origin, [axis]: 2 * axisValue - origin[axis] } : origin;
    let result = null;
    let bestDistance = mode === "furthest" ? -Infinity : Infinity;
    for (const person of people) {
      const point = getPoint(person);
      if (!point || (axis && (point[axis] - axisValue) * (origin[axis] - axisValue) >= 0)) continue;
      const distance = (point.x - target.x) ** 2 + (point.y - target.y) ** 2;
      if (mode === "furthest" ? distance > bestDistance : distance < bestDistance) {
        result = person;
        bestDistance = distance;
      }
    }
    return result;
  }

  const modeLabels = { closest: "Closest", furthest: "Furthest",
    verticalSymmetry: "Vertical symmetry", horizontalSymmetry: "Horizontal symmetry" };

  function setProximityLabel(toggle, mode, name, emptyLabel) {
    const modeLabel = modeLabels[mode];
    const label = modeLabel ? (name ? `${modeLabel}: ${name}` :
      emptyLabel ?? (mode.endsWith("Symmetry") ? "No opposite-side match" : "No visible people")) : "Proximity";
    const description = modeLabel ? `Current ${modeLabel.toLowerCase()}: ${name ?? label}` : label;
    if (toggle.firstElementChild.textContent !== label) toggle.firstElementChild.textContent = label;
    if (toggle.getAttribute("aria-label") !== description) toggle.setAttribute("aria-label", description);
    if (toggle.title !== description) toggle.title = description;
  }

  function setupProximityMenu(toggle, menu, closest, furthest, draw, additional = {}) {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const duration = 700 / 1.15;
    const pulseDuration = 400;
    const sweeps = Object.fromEntries(Object.entries({ closest, furthest, ...additional })
      .map(([mode, checkbox]) => [mode, { checkbox }]));
    const stopSweep = sweep => {
      if (sweep.frame != null) window.cancelAnimationFrame(sweep.frame);
      sweep.frame = null;
      sweep.progress = 1;
      sweep.pulseProgress = -1;
      sweep.pulseTarget = undefined;
    };
    for (const sweep of Object.values(sweeps)) stopSweep(sweep);
    const tick = (sweep, time) => {
      sweep.frame = null;
      if (!sweep.checkbox.checked) return stopSweep(sweep);
      const elapsed = Math.max(0, time - sweep.start);
      sweep.progress = Math.min(1, elapsed / duration);
      sweep.pulseProgress = elapsed >= duration ? Math.min(1, (elapsed - duration) / pulseDuration) : -1;
      draw();
      if (sweep.pulseProgress < 1) sweep.frame = window.requestAnimationFrame(time => tick(sweep, time));
    };
    const startSweep = sweep => {
      stopSweep(sweep);
      if (sweep.checkbox.checked && !reducedMotion.matches) {
        sweep.progress = 0;
        sweep.start = window.performance.now();
        sweep.frame = window.requestAnimationFrame(time => tick(sweep, time));
      }
    };
    const stop = () => {
      for (const sweep of Object.values(sweeps)) stopSweep(sweep);
    };
    const start = () => {
      for (const sweep of Object.values(sweeps)) startSweep(sweep);
      draw();
    };
    reducedMotion.addEventListener("change", () => {
      if (reducedMotion.matches) {
        for (const sweep of Object.values(sweeps)) stopSweep(sweep);
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
      draw();
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
    for (const sweep of Object.values(sweeps)) {
      sweep.checkbox.addEventListener("change", () => {
        startSweep(sweep);
        draw();
      });
    }
    const pulseFor = (mode, target) => {
      const sweep = sweeps[mode];
      if (sweep.pulseProgress < 0) return 1;
      if (sweep.pulseTarget === undefined) sweep.pulseTarget = target;
      if (target == null || target !== sweep.pulseTarget) return 1;
      return 1 + 0.5 * Math.sin(Math.PI * sweep.pulseProgress) ** 2;
    };
    return { close, start, stop, progress: mode => sweeps[mode].progress, pulseFor };
  }

  function traceProximityLine(context, from, to, mode, progress) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    context.beginPath();
    if (mode === "closest") {
      const radius = 10;
      const angle = Math.atan2(dy, dx);
      const offsetX = -Math.sin(angle) * radius;
      const offsetY = Math.cos(angle) * radius;
      context.lineWidth = 2;
      if (progress < 1) {
        if (progress <= 0) {
          return false;
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
      const wavelength = mode === "furthest" ? 10 : 20;
      const pointAt = distance => {
        const wave = 3 * Math.sin(2 * Math.PI * distance / wavelength) *
          Math.min(1, distance / 10, (length - distance) / 10);
        context.lineTo(from.x + (dx * distance - dy * wave) / length,
          from.y + (dy * distance + dx * wave) / length);
      };
      for (let distance = 0.5; distance < end; distance += 0.5) {
        pointAt(distance);
      }
      if (length) pointAt(end);
    }
    return true;
  }

  function drawProximityLine(context, from, to, mode, progress = 1, highlighted = false) {
    context.save();
    context.strokeStyle = highlighted ? "#000" : "rgba(0, 0, 0, 0.23)";
    if (traceProximityLine(context, from, to, mode, progress)) context.stroke();
    context.restore();
  }

  function hitProximityLine(context, from, to, mode, progress, point) {
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    const traced = traceProximityLine(context, from, to, mode, progress);
    context.lineWidth += 10;
    const hit = traced && context.isPointInStroke(point.x, point.y);
    context.restore();
    return hit;
  }

  function drawProximityCanvas(canvas, context, width, height, from, lines) {
    const scale = window.devicePixelRatio || 1;
    const canvasWidth = Math.round(width * scale);
    const canvasHeight = Math.round(height * scale);
    if (canvas.width !== canvasWidth) canvas.width = canvasWidth;
    if (canvas.height !== canvasHeight) canvas.height = canvasHeight;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.clearRect(0, 0, width, height);
    if (from) for (const { to, mode, progress } of lines) {
      if (to) drawProximityLine(context, from, to, mode, progress);
    }
  }

  window.thePearProximity = {
    findProximity, setProximityLabel, setupProximityMenu, drawProximityLine, drawProximityCanvas,
    hitProximityLine, modeLabels
  };
})();
