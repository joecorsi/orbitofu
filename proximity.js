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
        draw();
      });
    }
    return close;
  }

  function drawProximityLine(context, from, to, mode) {
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
      context.moveTo(from.x + offsetX, from.y + offsetY);
      context.lineTo(to.x + offsetX, to.y + offsetY);
      context.arc(to.x, to.y, radius, angle + Math.PI / 2, angle - Math.PI / 2, true);
      context.lineTo(from.x - offsetX, from.y - offsetY);
      context.arc(from.x, from.y, radius, angle - Math.PI / 2, angle + Math.PI / 2, true);
      context.closePath();
    } else {
      context.lineWidth = 1;
      context.moveTo(from.x, from.y);
      for (let distance = 0.5; distance < length; distance += 0.5) {
        const wave = 3 * Math.sin(2 * Math.PI * distance / 10) *
          Math.min(1, distance / 10, (length - distance) / 10);
        context.lineTo(from.x + (dx * distance - dy * wave) / length,
          from.y + (dy * distance + dx * wave) / length);
      }
      context.lineTo(to.x, to.y);
    }
    context.stroke();
    context.restore();
  }

  function drawProximityCanvas(canvas, context, width, height, from, to, mode) {
    const scale = window.devicePixelRatio || 1;
    const canvasWidth = Math.round(width * scale);
    const canvasHeight = Math.round(height * scale);
    if (canvas.width !== canvasWidth) canvas.width = canvasWidth;
    if (canvas.height !== canvasHeight) canvas.height = canvasHeight;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.clearRect(0, 0, width, height);
    if (from && to) drawProximityLine(context, from, to, mode);
  }

  window.thePearProximity = {
    findProximity, setProximityLabel, setupProximityMenu, drawProximityLine, drawProximityCanvas
  };
})();
