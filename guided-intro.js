/* A private four-person questionnaire that reveals the graph only after self-rating. */
(() => {
  "use strict";

  const KEY = "the-pear-first-graph-v2";
  const OLD_KEY = "the-pear-first-graph-v1";
  const DISMISSED_KEY = "the-pear-intro-dismissed-v1";
  const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  const ROLES = ["friend", "family", "choice", "me"];
  const COLORS = ["#e83c9b", "#35a84d", "#ed8615", "#145c92"];
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
    authDetails: $("auth-details"),
    authNote: $("starter-auth-note"),
    tryButton: $("starter-try"),
    authEmail: $("auth-email"),
    demo: $("demo-column"),
    graph: $("starter-graph"),
    graphCaption: $("starter-graph-caption")
  };

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
      if (!valid) localStorage.removeItem(KEY);
      return valid;
    } catch {
      try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
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
      error("This browser is blocking local storage. Enable storage to keep your answers when you sign in.");
      return false;
    }
  }

  function pendingPeople() {
    const saved = loadDraft();
    return saved?.ready && saved.answers.length === 4
      ? saved.answers.map(person => ({ ...person })) : null;
  }

  function markSignedIn() {
    try { localStorage.setItem(DISMISSED_KEY, "1"); } catch { /* optional preference */ }
  }

  function confirmImported() {
    try { localStorage.removeItem(KEY); } catch { /* import already succeeded */ }
    markSignedIn();
    draft = emptyDraft();
  }

  function wasDismissed() {
    try { return localStorage.getItem(DISMISSED_KEY) === "1"; }
    catch { return false; }
  }

  // Only an explicitly saved questionnaire can be read by the authenticated editor.
  window.thePearStarter = { pendingPeople, confirmImported, markSignedIn };

  function showAuth(hasDraft) {
    ui.flow.hidden = true;
    ui.authDetails.hidden = false;
    ui.authNote.hidden = !hasDraft;
    ui.demo.hidden = false;
    ui.demo.classList.remove("starter-active");
    ui.graph.hidden = true;
    ui.graphCaption.hidden = true;
  }

  function showGuide() {
    ui.flow.hidden = false;
    ui.authDetails.hidden = true;
    ui.demo.classList.add("starter-active");
    render();
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
      drag = { index, pointerId: event.pointerId };
      button.setPointerCapture(event.pointerId);
      button.focus({ preventScroll: true });
      updateDots();
      event.preventDefault();
    });
    button.addEventListener("pointermove", event => {
      if (!drag || drag.pointerId !== event.pointerId || drag.index !== index) return;
      const point = pointFromEvent(event);
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
      if (!direction) return;
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
    return { size, inset, span: size - 2 * inset };
  }

  function pointFromEvent(event) {
    const rect = ui.graph.getBoundingClientRect();
    const { size, inset, span } = graphBounds();
    if (!span) return { x: 50, y: 50 };
    const x = event.clientX - rect.left - ui.graph.clientLeft;
    const y = event.clientY - rect.top - ui.graph.clientTop;
    return {
      x: clamp((x - inset) / span * 100),
      y: clamp((size - inset - y) / span * 100)
    };
  }

  function updateDots() {
    if (draft.phase !== "reveal") return;
    const { size, inset, span } = graphBounds();
    if (!size || !span) return;
    for (let index = 0; index < draft.answers.length; index++) {
      if (!nodes.has(index)) createDot(index);
      const person = draft.answers[index];
      const button = nodes.get(index);
      const x = inset + person.x / 100 * span;
      const y = size - inset - person.y / 100 * span;
      button.style.left = x + "px";
      button.style.top = y + "px";
      button.classList.toggle("label-left", x > size - 90);
      button.classList.toggle("selected", index === selectedIndex);
      button.querySelector(".demo-person-name").textContent = person.name;
      button.setAttribute("aria-label",
        person.name + ", " + (person.relationship === "enemy" ? "foe" : person.relationship) +
        ". Coolness " + person.x + " out of 100, malevolence " + person.y +
        " out of 100. Drag or use arrow keys to reposition.");
    }
    ui.graph.classList.toggle("has-selection", selectedIndex >= 0);
  }

  const prompts = [
    ["Think of a friend.", "Choose a friend you know well. How do you see them?"],
    ["Think of someone in your family.", "Choose a relative. Where do they land on these scales?"],
    ["Think of a lover or a foe.", "Choose someone you love, or someone you really don't get along with."],
    ["Now, think about yourself.", "Same two scales. Where would you put yourself?"]
  ];

  function render() {
    const reveal = draft.phase === "reveal";
    const index = draft.step;
    ui.answerForm.hidden = reveal;
    ui.finishActions.hidden = !reveal;
    ui.demo.hidden = !reveal;
    ui.graph.hidden = !reveal;
    ui.graphCaption.hidden = !reveal;
    ui.step.textContent = reveal ? "Your four-person graph" : "Step " + (index + 1) + " of 4";
    const complete = reveal ? 4 : index;
    ui.progress.setAttribute("aria-valuenow", String(complete));
    [...ui.progress.children].forEach((part, i) => part.classList.toggle("filled", i < complete));
    if (reveal) {
      ui.title.textContent = "Here's how you see your world.";
      ui.description.textContent = "Three people, and you. Move any dot to change your answers before saving.";
      selectedIndex = -1;
      updateDots();
      window.requestAnimationFrame?.(updateDots);
      return;
    }
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
    ui.sliderHeading.textContent = index === 3 ?
      "How would you rate yourself?" : "Where would you put them on these two scales?";
    ui.back.hidden = index === 0;
    ui.next.textContent = index === 3 ? "Show my graph" : "Next";
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
    selectedIndex = -1;
    persist();
    render();
    ui.cool.focus();
  });

  ui.save.addEventListener("click", () => {
    if (draft.phase !== "reveal" || draft.answers.length !== 4) return;
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
    if (draft.phase === "questions" && draft.step < 3) ui.name.focus();
  });

  new ResizeObserver(updateDots).observe(ui.graph);
  if (draft.ready) showAuth(true);
  else if (wasDismissed()) showAuth(false);
  else showGuide();
})();