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

  function setProximityLabel(toggle) {
    if (toggle.firstElementChild.textContent !== "Proximity") toggle.firstElementChild.textContent = "Proximity";
    if (toggle.getAttribute("aria-label") !== "Proximity") toggle.setAttribute("aria-label", "Proximity");
    if (toggle.title !== "Proximity") toggle.title = "Proximity";
  }

  function updateProximityMenuBackground(menu, chart, points, radius) {
    if (menu.hidden) {
      menu.classList.remove("overlaps-target");
      return;
    }
    const menuRect = menu.getBoundingClientRect();
    const chartRect = chart.getBoundingClientRect();
    const overlaps = points.some(point => {
      if (!point) return false;
      const x = chartRect.left + chart.clientLeft + point.x;
      const y = chartRect.top + chart.clientTop + point.y;
      const dx = Math.max(menuRect.left - x, 0, x - menuRect.right);
      const dy = Math.max(menuRect.top - y, 0, y - menuRect.bottom);
      return dx * dx + dy * dy < radius * radius;
    });
    menu.classList.toggle("overlaps-target", overlaps);
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
      menu.style.left = "0px";
      draw();
      const overflow = menu.getBoundingClientRect().right - document.documentElement.clientWidth;
      if (overflow > 0) {
        menu.style.left = `${-overflow}px`;
        draw();
      }
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

  function drawProximityCanvas(canvas, context, width, height, from, lines, highlightedMode = null) {
    const scale = window.devicePixelRatio || 1;
    const canvasWidth = Math.round(width * scale);
    const canvasHeight = Math.round(height * scale);
    if (canvas.width !== canvasWidth) canvas.width = canvasWidth;
    if (canvas.height !== canvasHeight) canvas.height = canvasHeight;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.clearRect(0, 0, width, height);
    if (from) {
      for (const { to, mode, progress } of lines) {
        if (to && mode !== highlightedMode) drawProximityLine(context, from, to, mode, progress);
      }
      const highlighted = lines.find(line => line.mode === highlightedMode && line.to);
      if (highlighted) drawProximityLine(context, from, highlighted.to, highlighted.mode, highlighted.progress, true);
    }
  }

  function setupProximityHover(frame, label, draw, isDragging) {
    const hitContext = document.createElement("canvas").getContext("2d");
    let point = null, from = null, lines = [], hovered = null;
    const hit = location => {
      if (!from) return null;
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if (line.to && hitProximityLine(hitContext, from, line.to, line.mode, line.progress, location)) return line;
      }
      return null;
    };
    const update = (origin, nextLines) => {
      from = origin;
      lines = nextLines;
      hovered = point ? hit(point) : null;
      label.hidden = !hovered;
      if (hovered) {
        label.textContent = modeLabels[hovered.mode];
        const width = label.offsetWidth, height = label.offsetHeight;
        label.style.left = `${Math.max(1, Math.min(point.x - width / 2, frame.clientWidth - width - 1))}px`;
        label.style.top = `${point.y >= height + 11 ? point.y - height - 10 :
          Math.min(frame.clientHeight - height - 1, point.y + 10)}px`;
      }
      return hovered?.mode ?? null;
    };
    const clear = () => {
      point = null;
      if (!hovered) return;
      hovered = null;
      label.hidden = true;
      draw();
    };
    frame.addEventListener("pointermove", event => {
      if (isDragging() || event.buttons || event.pointerType === "touch" ||
          event.target.closest(".demo-person, .chart-group-button, .chart-group-popover, .chart-info")) return clear();
      const rect = frame.getBoundingClientRect();
      const next = { x: event.clientX - rect.left - frame.clientLeft,
        y: event.clientY - rect.top - frame.clientTop };
      const moved = !point || next.x !== point.x || next.y !== point.y;
      point = next;
      const nextMode = hit(point)?.mode ?? null;
      if (nextMode !== (hovered?.mode ?? null) || (nextMode && moved)) draw();
    });
    frame.addEventListener("pointerdown", clear);
    frame.addEventListener("pointerleave", clear);
    return { update };
  }

  const sunEmojiOffsets = new Map();
  function sunEmojiOffset(fontSize) {
    const measuredSize = Math.max(1, Math.round(fontSize * 2) / 2);
    const ratio = window.devicePixelRatio || 1;
    const cacheKey = `${measuredSize}:${ratio}`;
    if (sunEmojiOffsets.has(cacheKey)) return sunEmojiOffsets.get(cacheKey);
    const measureCanvas = document.createElement("canvas");
    measureCanvas.width = Math.ceil(128 * ratio);
    measureCanvas.height = Math.ceil(128 * ratio);
    const measureContext = measureCanvas.getContext("2d", { willReadFrequently: true });
    measureContext.setTransform(ratio, 0, 0, ratio, 0, 0);
    measureContext.font = `${measuredSize}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    measureContext.textAlign = "center";
    measureContext.textBaseline = "middle";
    measureContext.fillText("☀️", 64, 64);
    const { data, width, height } = measureContext.getImageData(0, 0, measureCanvas.width, measureCanvas.height);
    let alphaTotal = 0, xTotal = 0, yTotal = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const alpha = data[(y * width + x) * 4 + 3];
        if (alpha === 0) continue;
        alphaTotal += alpha;
        xTotal += (x + .5) * alpha;
        yTotal += (y + .5) * alpha;
      }
    }
    const offset = alphaTotal === 0 ? { x: 0, y: 0 } : {
      x: xTotal / alphaTotal / ratio - 64,
      y: yTotal / alphaTotal / ratio - 64
    };
    sunEmojiOffsets.set(cacheKey, offset);
    return offset;
  }

  function drawSunEmoji(context, x, y, fontSize) {
    context.font = `${fontSize}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    const offset = sunEmojiOffset(fontSize);
    context.fillText("☀️", x - offset.x, y - offset.y);
  }

  window.orbitofuProximity = {
    findProximity, setProximityLabel, setupProximityMenu, drawProximityLine, drawProximityCanvas,
    hitProximityLine, modeLabels, setupProximityHover, updateProximityMenuBackground, sunEmojiOffset, drawSunEmoji
  };
})();
