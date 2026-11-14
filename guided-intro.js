/* A private, reversible guest-first graph. No auth or database writes until Save. */
(() => {
  "use strict";

  const KEY = "the-pear-first-graph-v1";
  const DISMISSED_KEY = "the-pear-intro-dismissed-v1";
  const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  const MAX_PEOPLE = 30;
  const colors = ["#1681d4", "#e83c9b", "#35a84d", "#ed8615", "#9d58cd", "#00aeb0"];
  const $ = id => document.getElementById(id);
  const ui = {
    flow: $("starter-flow"),
    title: $("starter-title"),
    description: $("starter-description"),
    step: $("starter-step"),
    progress: $("starter-progress"),
    nameForm: $("starter-name-form"),
    name: $("starter-name"),
    placeActions: $("starter-place-actions"),
    continueButton: $("starter-continue"),
    finishActions: $("starter-finish-actions"),
    addMore: $("starter-add-more"),
    save: $("starter-save"),
    skip: $("starter-skip"),
    error: $("starter-error"),
    authDetails: $("auth-details"),
    authNote: $("starter-auth-note"),
    tryButton: $("starter-try"),
    authEmail: $("auth-email"),
    demo: $("demo-column"),
    graph: $("starter-graph"),
    graphCaption: $("starter-graph-caption")
  };

  const emptyDraft = () => ({
    version: 1, people: [], phase: "name", ready: false, updatedAt: Date.now()
  });
  const clamp = value => Math.max(0, Math.min(100, Math.round(value)));
  const validScore = value => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;

  function validateDraft(value) {
    if (!value || value.version !== 1 || !Array.isArray(value.people) ||
        value.people.length > MAX_PEOPLE ||
        !Number.isFinite(value.updatedAt) ||
        value.updatedAt > Date.now() + 60000 ||
        Date.now() - value.updatedAt > MAX_AGE_MS) return null;
    const people = [];
    for (const person of value.people) {
      if (!person || typeof person.name !== "string" ||
          !person.name.trim() || person.name.trim().length > 80 ||
          !validScore(person.x) || !validScore(person.y)) return null;
      people.push({ name: person.name.trim(), x: person.x, y: person.y });
    }
    const phase = ["name", "place", "done"].includes(value.phase) ? value.phase : "name";
    const ready = value.ready === true && people.length >= 3;
    return { version: 1, people, phase, ready, updatedAt: value.updatedAt };
  }

  function loadDraft() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? validateDraft(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  }

  let draft = loadDraft() || emptyDraft();
  let selectedIndex = -1;
  let drag = null;
  const nodes = new Map();

  function error(message) {
    ui.error.textContent = message;
    ui.error.hidden = !message;
  }

  function persist() {
    draft.updatedAt = Date.now();
    try {
      localStorage.setItem(KEY, JSON.stringify(draft));
      error("");
      return true;
    } catch {
      error("This browser is blocking local storage. Your work cannot carry over to sign-in until storage is enabled.");
      return false;
    }
  }

  function pendingPeople() {
    const saved = loadDraft() || draft;
    return saved.ready && saved.people.length >= 3
      ? saved.people.map(person => ({ name: person.name, x: person.x, y: person.y }))
      : null;
  }

  function markSignedIn() {
    try { localStorage.setItem(DISMISSED_KEY, "1"); } catch { /* optional preference */ }
  }

  function confirmImported() {
    try {
      localStorage.removeItem(KEY);
    } catch {
      // The graph already reached the account; clearing local state is best effort.
    }
    markSignedIn();
    draft = emptyDraft();
  }

  function wasDismissed() {
    try { return localStorage.getItem(DISMISSED_KEY) === "1"; }
    catch { return false; }
  }

  // The authenticated editor reads only a draft explicitly marked ready by Save.
  window.thePearStarter = { pendingPeople, confirmImported, markSignedIn };

  function showAuth(hasDraft) {
    ui.flow.hidden = true;
    ui.authDetails.hidden = false;
    ui.authNote.hidden = !hasDraft;
    ui.demo.classList.remove("starter-active");
    ui.graph.hidden = true;
    ui.graphCaption.hidden = true;
  }

  function showGuide() {
    ui.flow.hidden = false;
    ui.authDetails.hidden = true;
    ui.demo.classList.add("starter-active");
    ui.graph.hidden = false;
    ui.graphCaption.hidden = false;
    render();
  }

  function createDot(index) {
    const person = draft.people[index];
    const button = document.createElement("button");
    button.type = "button";
    button.className = "demo-person starter-person";
    button.style.setProperty("--person-color", colors[index % colors.length]);
    const dot = document.createElement("span");
    dot.className = "demo-person-dot";
    dot.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.className = "demo-person-name";
    button.append(dot, label);
    button.addEventListener("pointerdown", event => {
      if (!event.isPrimary || event.button !== 0) return;
      selectedIndex = index;
      drag = { index, pointerId: event.pointerId };
      button.setPointerCapture(event.pointerId);
      button.focus({ preventScroll: true });
      updateDots();
      event.preventDefault();
    });
    button.addEventListener("pointermove", event => {
      if (!drag || drag.pointerId !== event.pointerId || drag.index !== index) return;
      const point = pointFromEvent(event);
      const current = draft.people[index];
      if (!current) return;
      current.x = point.x;
      current.y = point.y;
      updateDots();
    });
    function endPointer(event) {
      if (!drag || drag.pointerId !== event.pointerId || drag.index !== index) return;
      drag = null;
      persist();
      updateDots();
    }
    button.addEventListener("pointerup", endPointer);
    button.addEventListener("pointercancel", endPointer);
    button.addEventListener("lostpointercapture", endPointer);
    button.addEventListener("keydown", event => {
      if (!draft.people[index]) return;
      const movements = {
        ArrowLeft: [-2, 0], ArrowRight: [2, 0],
        ArrowUp: [0, 2], ArrowDown: [0, -2]
      };
      const delta = movements[event.key];
      if (!delta) return;
      event.preventDefault();
      draft.people[index].x = clamp(draft.people[index].x + delta[0]);
      draft.people[index].y = clamp(draft.people[index].y + delta[1]);
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
    return { size, inset, span: size - 2 * inset };
  }

  function pointFromEvent(event) {
    const rect = ui.graph.getBoundingClientRect();
    const { size, inset, span } = graphBounds();
    if (!span) return { x: 50, y: 50 };
    const x = event.clientX - rect.left - ui.graph.clientLeft;
    const y = event.clientY - rect.top - ui.graph.clientTop;
    return { x: clamp((x - inset) / span * 100),
      y: clamp((size - inset - y) / span * 100) };
  }

  function updateDots() {
    const { size, inset, span } = graphBounds();
    if (!size || !span) return;
    for (let index = 0; index < draft.people.length; index++) {
      if (!nodes.has(index)) createDot(index);
      const person = draft.people[index];
      const button = nodes.get(index);
      const x = inset + person.x / 100 * span;
      const y = size - inset - person.y / 100 * span;
      button.style.left = x + "px";
      button.style.top = y + "px";
      button.classList.toggle("label-left", x > size - 90);
      button.classList.toggle("is-current", draft.phase === "place" && index === draft.people.length - 1);
      button.classList.toggle("selected", index === selectedIndex);
      button.querySelector(".demo-person-name").textContent = person.name;
      button.setAttribute("aria-label", person.name + ". Coolness " + person.x +
        " out of 100, malevolence " + person.y + " out of 100. Drag or use arrow keys to reposition.");
    }
    for (const [index, button] of nodes) {
      if (index < draft.people.length) continue;
      button.remove();
      nodes.delete(index);
    }
    ui.graph.classList.toggle("has-selection", selectedIndex >= 0);
  }

  function render() {
    const count = draft.people.length;
    const placing = draft.phase === "place" && count > 0;
    const finished = draft.phase === "done" && count >= 3;
    if (!placing && !finished && draft.phase !== "name") draft.phase = "name";

    ui.nameForm.hidden = draft.phase !== "name";
    ui.placeActions.hidden = !placing;
    ui.finishActions.hidden = !finished;
    const nextNumber = count + 1;
    ui.step.textContent = finished ? count + " people on your graph" :
      placing ? "Person " + count + (count <= 3 ? " of 3" : "") :
      "Person " + nextNumber + (nextNumber <= 3 ? " of 3" : "");
    if (placing) {
      ui.title.textContent = "Where does " + draft.people[count - 1].name + " belong?";
      ui.description.textContent = "Drag their dot to where you think they fit. Or use the arrow keys to nudge it.";
      ui.continueButton.textContent = count >= 3 ? "See my graph" : "Next person";
    } else if (finished) {
      ui.title.textContent = "Now you're seeing people differently.";
      ui.description.textContent = "Compare the dots. Who belongs between these people? You can keep adding people, or save this graph.";
    } else {
      ui.title.textContent = count === 0 ? "Think of someone you know." :
        count === 1 ? "Who comes to mind next?" : "One more person.";
      ui.description.textContent = count === 0
        ? "A friend, someone you admire, or someone who drives you crazy."
        : "The interesting part is comparing people. Add someone different.";
    }
    const completed = Math.min(3, placing ? count - 1 : count);
    ui.progress.setAttribute("aria-valuenow", String(completed));
    [...ui.progress.children].forEach((part, index) => part.classList.toggle("filled", index < completed));
    ui.graphCaption.textContent = count
      ? "Drag any dot to change its position. Arrow keys work, too."
      : "Your first person will appear on this graph.";
    updateDots();
  }

  ui.nameForm.addEventListener("submit", event => {
    event.preventDefault();
    const name = ui.name.value.trim().slice(0, 80);
    if (!name) {
      error("Enter a name to begin.");
      ui.name.focus();
      return;
    }
    if (draft.people.length >= MAX_PEOPLE) {
      error("This preview is limited to " + MAX_PEOPLE + " people. Save your graph to continue.");
      return;
    }
    if (draft.people.some(person => person.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      error("That person is already on your graph.");
      ui.name.focus();
      return;
    }
    draft.people.push({ name, x: 50, y: 50 });
    draft.phase = "place";
    ui.name.value = "";
    selectedIndex = draft.people.length - 1;
    persist();
    render();
    nodes.get(selectedIndex)?.focus({ preventScroll: true });
  });

  ui.continueButton.addEventListener("click", () => {
    selectedIndex = -1;
    draft.phase = draft.people.length >= 3 ? "done" : "name";
    persist();
    render();
    if (draft.phase === "name") ui.name.focus();
  });

  ui.addMore.addEventListener("click", () => {
    draft.phase = "name";
    selectedIndex = -1;
    persist();
    render();
    ui.name.focus();
  });

  ui.save.addEventListener("click", () => {
    if (draft.people.length < 3) return;
    draft.ready = true;
    if (!persist()) return;
    showAuth(true);
    ui.authEmail.focus();
  });

  ui.skip.addEventListener("click", () => {
    try { localStorage.setItem(DISMISSED_KEY, "1"); } catch { /* optional preference */ }
    showAuth(false);
  });
  ui.tryButton.addEventListener("click", () => {
    try { localStorage.removeItem(DISMISSED_KEY); } catch { /* optional preference */ }
    draft.ready = false;
    persist();
    showGuide();
    if (draft.phase === "name") ui.name.focus();
  });
  new ResizeObserver(updateDots).observe(ui.graph);
  if (draft.ready) showAuth(true);
  else if (wasDismissed()) showAuth(false);
  else showGuide();
})();