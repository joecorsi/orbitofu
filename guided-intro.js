/* A private four-person questionnaire that reveals its dots only after self-rating. */
(() => {
  "use strict";

  const KEY = "the-pear-first-graph-v2";
  const OLD_KEY = "the-pear-first-graph-v1";
  const FLOW_ROUTE = "#/try";
  const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  const ROLES = ["friend", "family", "choice", "me"];
  const COLORS = ["#e83c9b", "#35a84d", "#ed8615", "#145c92"];
  const { findProximity, setProximityLabel, setupProximityMenu, drawProximityCanvas } = window.thePearProximity;
  const $ = id => document.getElementById(id);
  const ui = {
    flow: $("starter-flow"),
    title: $("starter-title"),
    description: $("starter-description"),
    step: $("starter-step"),
    progress: $("starter-progress"),
    answerForm: $("starter-answer-form"),
    nameField: $("starter-name-field"),
    name: $("starter-name"),
    kindField: $("starter-kind-field"),
    lover: $("starter-lover"),
    foe: $("starter-foe"),
    cool: $("starter-cool"),
    benevolence: $("starter-benevolence"),
    sliderHeading: $("starter-slider-heading"),
    back: $("starter-back"),
    next: $("starter-next"),
    finishActions: $("starter-finish-actions"),
    edit: $("starter-edit"),
    save: $("starter-save"),
    skip: $("starter-skip"),
    error: $("starter-error"),
    privacy: $("starter-privacy"),
    authDetails: $("auth-details"),
    authNote: $("starter-auth-note"),
    authIntro: $("auth-intro"),
    tryButton: $("starter-try"),
    authEmail: $("auth-email"),
    demo: $("demo-column"),
    graph: $("starter-graph"),
    center: $("starter-center"),
    footer: $("starter-footer"),
    reset: $("starter-reset"),
    proximity: $("starter-proximity"),
    proximityToggle: $("starter-proximity-toggle"),
    proximityMenu: $("starter-proximity-menu"),
    proximityClosest: $("starter-proximity-closest"),
    proximityFurthest: $("starter-proximity-furthest"),
    proximityCanvas: $("starter-proximity-line")
  };
  const proximityContext = ui.proximityCanvas.getContext("2d");
  const closeProximityMenu = setupProximityMenu(ui.proximityToggle, ui.proximityMenu, ui.proximityClosest, ui.proximityFurthest, updateDots);

  const emptyDraft = () => ({
    version: 2, answers: [], step: 0, phase: "questions", ready: false, updatedAt: Date.now()
  });
  const clamp = value => Math.max(0, Math.min(100, Math.round(value)));
  const validScore = value => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;

  function validateDraft(value) {
    if (!value || value.version !== 2 || !Array.isArray(value.answers) ||
        value.answers.length > 4 || !Number.isFinite(value.updatedAt) ||
        value.updatedAt > Date.now() + 60000 ||
        Date.now() - value.updatedAt > MAX_AGE_MS) return null;
    const answers = [];
    for (let index = 0; index < value.answers.length; index++) {
      const person = value.answers[index];
      const role = ROLES[index];
      const relationship = person?.relationship;
      const correctRole = role === "choice" ? ["lover", "enemy"].includes(relationship) : relationship === role;
      if (!person || !correctRole || typeof person.name !== "string" ||
          !person.name.trim() || person.name.length > 80 ||
          (role === "me" && person.name !== "Me") ||
          !validScore(person.x) || !validScore(person.y)) return null;
      answers.push({
        name: person.name.trim(), relationship, x: person.x, y: person.y
      });
    }
    if (new Set(answers.map(person => person.name.toLocaleLowerCase())).size !== answers.length) return null;
    const phase = value.phase === "reveal" ? "reveal" : "questions";
    if (phase === "reveal" && answers.length !== 4) return null;
    const step = Number.isInteger(value.step) && value.step >= 0 && value.step <= 3
      ? value.step : Math.min(answers.length, 3);
    if (phase === "questions" && step > answers.length) return null;
    return {
      version: 2, answers, step, phase,
      ready: value.ready === true && phase === "reveal",
      updatedAt: value.updatedAt
    };
  }

  function loadDraft() {
    try {
      // The old draft format did not collect relationships or self-ratings.
      localStorage.removeItem(OLD_KEY);
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const valid = validateDraft(JSON.parse(raw));
      if (!valid?.ready) {
        localStorage.removeItem(KEY);
        return null;
      }
      return valid;
    } catch {
      try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
      return null;
    }
  }

  const isReload = window.performance.getEntriesByType("navigation")[0]?.type === "reload";
  let returnedHomeAfterReload = isReload && window.location.hash === FLOW_ROUTE;
  if (isReload) {
    try {
      returnedHomeAfterReload ||= localStorage.getItem(KEY) !== null || localStorage.getItem(OLD_KEY) !== null;
      localStorage.removeItem(KEY);
      localStorage.removeItem(OLD_KEY);
    } catch (storageError) {
      returnedHomeAfterReload = true;
      console.error("Could not clear the guided graph draft on reload:", storageError);
      const notice = $("auth-notice");
      notice.textContent = "This browser couldn't clear the saved draft. Check your browser storage settings.";
      notice.classList.add("visible");
    }
    if (window.location.hash === FLOW_ROUTE) {
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    }
  }

  let ignoreStoredDraft = isReload;
  let draft = isReload ? emptyDraft() : loadDraft() || emptyDraft();
  let hasStoredDraft = draft.ready;
  let selectedIndex = -1;
  let drag = null;
  let view = { zoom: 1, x: 0.5, y: 0.5 };
  const nodes = new Map();

  function error(message) {
    ui.error.textContent = message;
    ui.error.hidden = !message;
  }

  function persist() {
    draft.updatedAt = Date.now();
    try {
      if (draft.ready) {
        localStorage.setItem(KEY, JSON.stringify(draft));
        hasStoredDraft = true;
        ignoreStoredDraft = false;
      } else if (hasStoredDraft) {
        localStorage.removeItem(KEY);
        hasStoredDraft = false;
      }
      error("");
      return true;
    } catch {
      error("This browser is blocking local storage. Enable storage to keep your answers when you sign in.");
      return false;
    }
  }

  function pendingPeople() {
    if (ignoreStoredDraft) return null;
    const saved = loadDraft();
    return saved?.ready && saved.answers.length === 4
      ? saved.answers.map(person => ({ ...person })) : null;
  }

  function confirmImported() {
    try { localStorage.removeItem(KEY); } catch { /* import already succeeded */ }
    draft = emptyDraft();
    hasStoredDraft = false;
    showAuth(false);
  }

  // Only an explicitly saved questionnaire can be read by the authenticated editor.
  window.thePearStarter = {
    pendingPeople, confirmImported, showHomepage, returnedHomeAfterReload,
    inFlow: () => window.location.hash === FLOW_ROUTE
  };

  function showAuth(hasDraft) {
    ui.flow.hidden = true;
    ui.authDetails.hidden = false;
    ui.authNote.hidden = !hasDraft;
    ui.tryButton.hidden = hasDraft;
    ui.privacy.hidden = true;
    ui.demo.hidden = false;
    ui.demo.classList.toggle("starter-active", hasDraft);
    ui.graph.hidden = !hasDraft;
    ui.footer.hidden = !hasDraft;
    if (hasDraft) {
      updateDots();
      window.requestAnimationFrame?.(updateDots);
    }
  }

  function showGuide() {
    ui.flow.hidden = false;
    ui.privacy.hidden = false;
    ui.authDetails.hidden = true;
    ui.demo.classList.add("starter-active");
    render();
  }

  function showHomepage() {
    if (window.location.hash === FLOW_ROUTE) {
      window.history.pushState(null, "", window.location.pathname + window.location.search);
    }
    showAuth(draft.ready);
  }

  function syncRoute() {
    if (window.location.hash === FLOW_ROUTE) showGuide();
    else showAuth(draft.ready);
  }

  function createDot(index) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "demo-person starter-person";
    button.style.setProperty("--person-color", COLORS[index]);
    const dot = document.createElement("span");
    dot.className = "demo-person-dot";
    dot.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.className = "demo-person-name";
    button.append(dot, label);
    button.addEventListener("pointerdown", event => {
      if (!event.isPrimary || event.button !== 0) return;
      selectedIndex = index;
      const point = eventCoordinates(event);
      const { left, top, viewedSpan } = graphBounds();
      const person = draft.answers[index];
      drag = { index, pointerId: event.pointerId,
        offsetX: point.x - (left + person.x / 100 * viewedSpan),
        offsetY: point.y - (top + (1 - person.y / 100) * viewedSpan) };
      button.setPointerCapture(event.pointerId);
      button.focus({ preventScroll: true });
      updateDots();
      event.preventDefault();
    });
    button.addEventListener("pointermove", event => {
      if (!drag || drag.pointerId !== event.pointerId || drag.index !== index) return;
      const point = pointFromEvent(event, drag.offsetX, drag.offsetY);
      const person = draft.answers[index];
      person.x = point.x;
      person.y = point.y;
      updateDots();
    });
    const endPointer = event => {
      if (!drag || drag.pointerId !== event.pointerId || drag.index !== index) return;
      drag = null;
      persist();
      updateDots();
    };
    button.addEventListener("pointerup", endPointer);
    button.addEventListener("pointercancel", endPointer);
    button.addEventListener("lostpointercapture", endPointer);
    button.addEventListener("keydown", event => {
      const direction = {
        ArrowLeft: [-2, 0], ArrowRight: [2, 0],
        ArrowUp: [0, 2], ArrowDown: [0, -2]
      }[event.key];
      if (!direction || (event.shiftKey && view.zoom > 1)) return;
      event.preventDefault();
      const person = draft.answers[index];
      person.x = clamp(person.x + direction[0]);
      person.y = clamp(person.y + direction[1]);
      selectedIndex = index;
      persist();
      updateDots();
    });
    ui.graph.append(button);
    nodes.set(index, button);
  }

  function graphBounds() {
    const size = Math.min(ui.graph.clientWidth, ui.graph.clientHeight);
    const inset = Math.min(38, Math.max(14, (size - 1) / 2));
    const span = size - 2 * inset;
    return { size, inset, span, viewedSpan: span * view.zoom,
      left: inset + (0.5 - view.x * view.zoom) * span,
      top: inset + (0.5 - view.y * view.zoom) * span };
  }

  function eventCoordinates(event) {
    const rect = ui.graph.getBoundingClientRect();
    return { x: event.clientX - rect.left - ui.graph.clientLeft,
      y: event.clientY - rect.top - ui.graph.clientTop };
  }

  function constrainView() {
    const half = 0.5 / view.zoom;
    view.x = Math.max(half, Math.min(1 - half, view.x));
    view.y = Math.max(half, Math.min(1 - half, view.y));
  }

  function pointFromEvent(event, offsetX, offsetY) {
    const { viewedSpan, left, top } = graphBounds();
    if (!viewedSpan) return { x: 50, y: 50 };
    const point = eventCoordinates(event);
    return {
      x: clamp((point.x - offsetX - left) / viewedSpan * 100),
      y: clamp((top + viewedSpan - point.y + offsetY) / viewedSpan * 100)
    };
  }

  function updateDots() {
    const reveal = draft.phase === "reveal";
    for (const button of nodes.values()) button.hidden = !reveal;
    ui.footer.hidden = ui.graph.hidden;
    ui.proximity.hidden = !reveal;
    if (!reveal) closeProximityMenu();
    ui.proximityCanvas.hidden = !reveal;
    const { size, inset, span, viewedSpan, left, top } = graphBounds();
    if (!size || !span) return;
    const midX = left + viewedSpan / 2;
    const midY = top + viewedSpan / 2;
    ui.graph.style.setProperty("--demo-axis-x", `${Math.max(20, Math.min(size - 20, midX))}px`);
    ui.graph.style.setProperty("--demo-axis-y", `${Math.max(20, Math.min(size - 20, midY))}px`);
    ui.center.hidden = midX < 20 || midX > size - 20 || midY < 20 || midY > size - 20;
    ui.center.style.left = `${midX}px`;
    ui.center.style.top = `${midY}px`;
    const displayedPoint = person => {
      const actualX = left + person.x / 100 * viewedSpan;
      const actualY = top + (1 - person.y / 100) * viewedSpan;
      return { x: Math.max(inset, Math.min(size - inset, actualX)),
        y: Math.max(inset, Math.min(size - inset, actualY)), actualX, actualY };
    };
    for (let index = 0; reveal && index < draft.answers.length; index++) {
      if (!nodes.has(index)) createDot(index);
      const person = draft.answers[index];
      const button = nodes.get(index);
      const { x, y, actualX, actualY } = displayedPoint(person);
      button.style.left = x + "px";
      button.style.top = y + "px";
      button.classList.toggle("label-left", x > size - 90);
      button.classList.toggle("selected", index === selectedIndex);
      button.classList.toggle("sticky", x !== actualX || y !== actualY);
      button.querySelector(".demo-person-name").textContent = person.name;
      button.setAttribute("aria-label",
        person.name + ", " + (person.relationship === "enemy" ? "foe" : person.relationship) +
        ". Coolness " + person.x + " out of 100, malevolence " + person.y +
        " out of 100. Drag or use arrow keys to reposition.");
    }
    ui.graph.classList.toggle("has-selection", selectedIndex >= 0);
    const mode = ui.proximityClosest.checked ? "closest" : ui.proximityFurthest.checked ? "furthest" : null;
    const me = reveal ? draft.answers.find(person => person.relationship === "me") : null;
    const target = findProximity(draft.answers, me, mode, person => person === me ? null : person);
    setProximityLabel(ui.proximityToggle, mode, target?.name);
    drawProximityCanvas(ui.proximityCanvas, proximityContext, size, size,
      me && displayedPoint(me), target && displayedPoint(target), mode);
  }

  ui.graph.addEventListener("wheel", event => {
    if (draft.phase !== "reveal" || drag || event.target.closest(".chart-info")) return;
    const { size, inset, span } = graphBounds();
    if (span <= 0) return;
    event.preventDefault();
    const point = eventCoordinates(event);
    const x = Math.max(0, Math.min(1, (point.x - inset) / span)) - 0.5;
    const y = Math.max(0, Math.min(1, (point.y - inset) / span)) - 0.5;
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? size : 1);
    const zoom = Math.max(1, Math.min(8, view.zoom * Math.exp(-delta * 0.0015)));
    view = { zoom, x: view.x + x / view.zoom - x / zoom, y: view.y + y / view.zoom - y / zoom };
    constrainView();
    updateDots();
  }, { passive: false });

  ui.graph.addEventListener("pointerdown", event => {
    if (!event.isPrimary || event.button !== 0 || drag || event.target.closest(".demo-person, .chart-info")) return;
    selectedIndex = -1;
    ui.graph.focus({ preventScroll: true });
    if (view.zoom > 1) {
      drag = { pointerId: event.pointerId, ...eventCoordinates(event) };
      ui.graph.setPointerCapture(event.pointerId);
      event.preventDefault();
    }
    updateDots();
  });
  ui.graph.addEventListener("pointermove", event => {
    if (!drag || drag.index !== undefined || drag.pointerId !== event.pointerId) return;
    const point = eventCoordinates(event);
    const { span } = graphBounds();
    if (span <= 0) return;
    view.x -= (point.x - drag.x) / (span * view.zoom);
    view.y -= (point.y - drag.y) / (span * view.zoom);
    constrainView();
    drag.x = point.x;
    drag.y = point.y;
    updateDots();
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    ui.graph.addEventListener(type, event => {
      if (drag && drag.index === undefined && drag.pointerId === event.pointerId) drag = null;
    });
  }
  ui.graph.addEventListener("keydown", event => {
    if (!event.shiftKey || view.zoom === 1 || drag || event.target.closest(".chart-info")) return;
    const direction = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0],
      ArrowUp: [0, -1], ArrowDown: [0, 1]
    }[event.key];
    if (!direction) return;
    event.preventDefault();
    view.x += direction[0] * 0.1 / view.zoom;
    view.y += direction[1] * 0.1 / view.zoom;
    constrainView();
    updateDots();
  });
  ui.reset.addEventListener("click", () => {
    view = { zoom: 1, x: 0.5, y: 0.5 };
    updateDots();
  });

  const prompts = [
    ["Think of a friend.", "How do you see someone you know well?"],
    ["Think of someone in your family.", "Where do they land on these scales?"],
    ["Think of a lover or a foe.", "Who brings out strong feelings in you?"],
    ["Now, think about yourself.", "Where would you put yourself?"]
  ];

  function render() {
    const reveal = draft.phase === "reveal";
    const index = draft.step;
    ui.title.hidden = reveal;
    ui.answerForm.hidden = reveal;
    ui.finishActions.hidden = !reveal;
    ui.demo.hidden = false;
    ui.graph.hidden = false;
    ui.step.textContent = reveal ? "Your four-person graph" : "Step " + (index + 1) + " of 4";
    const complete = reveal ? 4 : index;
    ui.progress.setAttribute("aria-valuenow", String(complete));
    [...ui.progress.children].forEach((part, i) => part.classList.toggle("filled", i < complete));
    if (reveal) {
      ui.description.textContent = ui.authIntro.textContent;
      selectedIndex = -1;
    } else {
      const current = draft.answers[index];
      ui.title.textContent = prompts[index][0];
      ui.description.textContent = prompts[index][1];
      ui.nameField.hidden = index === 3;
      ui.name.required = index !== 3;
      ui.name.value = index === 3 ? "" : (current?.name ?? "");
      ui.kindField.hidden = index !== 2;
      ui.lover.checked = current?.relationship === "lover";
      ui.foe.checked = current?.relationship === "enemy";
      ui.cool.value = String(current?.x ?? 50);
      ui.benevolence.value = String(current?.y ?? 50);
      ui.sliderHeading.textContent = index === 3 ? "Rate yourself:" : "Rate them:";
      ui.back.disabled = index === 0;
      ui.next.textContent = index === 3 ? "Show my graph" : "Next";
    }
    updateDots();
    window.requestAnimationFrame?.(updateDots);
  }

  ui.answerForm.addEventListener("submit", event => {
    event.preventDefault();
    const index = draft.step;
    const role = ROLES[index];
    const relationship = role === "choice" ? (ui.lover.checked ? "lover" : ui.foe.checked ? "enemy" : "") : role;
    const name = role === "me" ? "Me" : ui.name.value.trim().slice(0, 80);
    if (!name) {
      error("Enter a name to continue.");
      ui.name.focus();
      return;
    }
    if (!relationship) {
      error("Choose Lover or Foe to continue.");
      ui.lover.focus();
      return;
    }
    if (role !== "me" && name.toLocaleLowerCase() === "me") {
      error("Me is reserved for the final step. Choose a different name.");
      ui.name.focus();
      return;
    }
    if (draft.answers.some((person, i) => i !== index && person.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      error("You've already rated that person. Choose someone different.");
      ui.name.focus();
      return;
    }
    draft.answers[index] = {
      name, relationship,
      x: clamp(Number(ui.cool.value)),
      y: clamp(Number(ui.benevolence.value))
    };
    if (index === 3) {
      draft.phase = "reveal";
      selectedIndex = -1;
    } else {
      draft.step = index + 1;
    }
    draft.ready = false;
    persist();
    render();
    if (draft.phase === "reveal") ui.save.focus();
    else ui.name.focus();
  });

  ui.back.addEventListener("click", () => {
    if (draft.step === 0) return;
    draft.step -= 1;
    draft.ready = false;
    persist();
    render();
    if (draft.step !== 3) ui.name.focus();
  });

  ui.edit.addEventListener("click", () => {
    draft.phase = "questions";
    draft.step = 3;
    draft.ready = false;
    view = { zoom: 1, x: 0.5, y: 0.5 };
    selectedIndex = -1;
    persist();
    render();
    ui.cool.focus();
  });

  ui.save.addEventListener("click", () => {
    if (draft.phase !== "reveal" || draft.answers.length !== 4) return;
    draft.ready = true;
    if (!persist()) return;
    showHomepage();
    ui.authEmail.focus();
  });

  ui.skip.addEventListener("click", () => {
    if (!ui.flow.hidden) {
      showHomepage();
    }
    ui.authEmail.focus();
  });

  ui.tryButton.addEventListener("click", event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    draft.ready = false;
    persist();
    window.history.pushState(null, "", FLOW_ROUTE);
    showGuide();
    if (draft.phase === "questions" && draft.step < 3) ui.name.focus();
  });

  new ResizeObserver(updateDots).observe(ui.graph);
  window.addEventListener("popstate", syncRoute);
  syncRoute();
})();