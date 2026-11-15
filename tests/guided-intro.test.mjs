import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../guided-intro.js", import.meta.url), "utf8");
const DRAFT_KEY = "the-pear-first-graph-v2";

function mount(initialStorage = {}, initialHash = "") {
  const store = new Map(Object.entries(initialStorage));
  const storage = {
    getItem: key => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: key => store.delete(key)
  };
  class Element {
    constructor(tag, id = "") {
      this.tag = tag;
      this.id = id;
      this.hidden = false;
      this.required = false;
      this.checked = false;
      this.value = "";
      this.textContent = "";
      this.children = [];
      this.className = "";
      this.listeners = {};
      this.attributes = {};
      this.style = { setProperty() {} };
      const classes = new Set();
      this.classList = {
        add: name => classes.add(name),
        remove: name => classes.delete(name),
        contains: name => classes.has(name),
        toggle(name, force = !classes.has(name)) {
          if (force) classes.add(name);
          else classes.delete(name);
          return force;
        }
      };
      this.clientWidth = 400;
      this.clientHeight = 400;
      this.clientLeft = 1;
      this.clientTop = 1;
    }
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
    dispatch(type, props = {}) {
      for (const fn of this.listeners[type] ?? []) {
        fn({
          preventDefault() {}, pointerId: 1, isPrimary: true, button: 0,
          clientX: 305, clientY: 90, target: this, ...props
        });
      }
    }
    append(...items) { this.children.push(...items); }
    querySelector(selector) {
      return this.children.find(child => child.className === selector.slice(1));
    }
    closest() { return null; }
    setAttribute(name, value) { this.attributes[name] = value; }
    focus() {}
    setPointerCapture() {}
    getBoundingClientRect() { return { left: 0, top: 0 }; }
    remove() {}
  }
  const elements = new Map();
  const doc = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, new Element("div", id));
      return elements.get(id);
    },
    createElement: tag => new Element(tag)
  };
  const el = id => doc.getElementById(id);
  el("starter-progress").children = Array.from({ length: 4 }, () => new Element("span"));
  el("auth-intro").textContent = "See your world from a new angle. Your graphs are private and available anywhere.";
  const win = {
    location: { pathname: "/", search: "", hash: initialHash },
    listeners: {},
    addEventListener(type, fn) { this.listeners[type] = fn; }
  };
  win.history = { pushState(_state, _title, url) {
    const parsed = new URL(url, "https://example.invalid" + win.location.pathname + win.location.search);
    win.location.pathname = parsed.pathname;
    win.location.search = parsed.search;
    win.location.hash = parsed.hash;
  } };
  const ResizeObserverStub = class { observe() {} };
  new Function("document", "window", "localStorage", "ResizeObserver", source)(
    doc, win, storage, ResizeObserverStub
  );
  return { el, store, api: win.thePearStarter, win };
}

function answer(ui, name, x, y, kind = null) {
  ui.el("starter-name").value = name;
  ui.el("starter-cool").value = String(x);
  ui.el("starter-benevolence").value = String(y);
  ui.el("starter-lover").checked = kind === "lover";
  ui.el("starter-foe").checked = kind === "enemy";
  ui.el("starter-answer-form").dispatch("submit");
}

function startGuide() {
  const ui = mount();
  ui.el("starter-try").dispatch("click");
  return ui;
}

function complete(ui, kind = "lover") {
  answer(ui, "Alex", 85, 10);
  answer(ui, "Blair", 42, 75);
  answer(ui, "Casey", 74, 22, kind);
  answer(ui, "", 62, 33);
}

test("the homepage appears first and the graph stays empty until everyone is rated", () => {
  const ui = mount();
  assert.equal(ui.el("starter-flow").hidden, true);
  assert.equal(ui.el("auth-details").hidden, false);
  assert.equal(ui.el("starter-try").hidden, false);
  assert.equal(ui.el("starter-graph").hidden, true);
  assert.equal(ui.el("demo-column").classList.contains("starter-active"), false);
  ui.el("starter-try").dispatch("click");
  assert.equal(ui.win.location.hash, "#/try");
  assert.equal(ui.el("starter-flow").hidden, false);
  assert.equal(ui.el("demo-column").hidden, false);
  assert.equal(ui.el("starter-graph").hidden, false);
  assert.equal(ui.el("starter-graph").children.length, 0);
  assert.equal(ui.el("starter-back").disabled, true);
  assert.match(ui.el("starter-description").textContent, /know well/i);
  assert.match(ui.el("starter-title").textContent, /friend/i);
  answer(ui, "Alex", 85, 10);
  assert.equal(ui.el("starter-back").disabled, false);
  assert.match(ui.el("starter-title").textContent, /family/i);
  assert.equal(ui.el("starter-graph").children.length, 0);
  answer(ui, "Blair", 42, 75);
  assert.match(ui.el("starter-title").textContent, /lover or a foe/i);
  assert.equal(ui.el("starter-kind-field").hidden, false);
  assert.equal(ui.el("starter-graph").children.length, 0);
  answer(ui, "Casey", 74, 22, "lover");
  assert.match(ui.el("starter-title").textContent, /yourself/i);
  assert.equal(ui.el("starter-name-field").hidden, true);
  assert.equal(ui.el("starter-graph").children.length, 0);
  answer(ui, "", 62, 33);
  assert.equal(ui.el("starter-graph").hidden, false);
  assert.equal(ui.el("demo-column").hidden, false);
  assert.equal(ui.el("starter-title").hidden, true);
  assert.equal(ui.el("starter-description").textContent, ui.el("auth-intro").textContent);
  assert.equal(ui.el("starter-privacy").hidden, false);
  assert.equal(ui.el("starter-graph").children.length, 4);
  assert.ok(ui.el("starter-graph").children.every(dot => !dot.hidden));
  assert.equal(ui.el("starter-answer-form").hidden, true);
  assert.equal(ui.el("starter-finish-actions").hidden, false);
});

test("save hands off four ratings and the correct relationships without signing in early", () => {
  const ui = startGuide();
  complete(ui);
  assert.equal(ui.api.pendingPeople(), null);
  assert.equal(ui.el("auth-details").hidden, true);
  ui.el("starter-save").dispatch("click");
  assert.equal(ui.win.location.hash, "");
  assert.equal(ui.el("auth-details").hidden, false);
  assert.equal(ui.el("starter-auth-note").hidden, false);
  assert.equal(ui.el("starter-try").hidden, true);
  assert.equal(ui.el("starter-privacy").hidden, true);
  assert.equal(ui.el("starter-graph").hidden, false);
  assert.equal(ui.el("demo-column").classList.contains("starter-active"), true);
  ui.el("starter-skip").dispatch("click");
  assert.equal(ui.el("starter-auth-note").hidden, false);
  assert.equal(ui.el("starter-graph").hidden, false);
  assert.deepEqual(ui.api.pendingPeople(), [
    { name: "Alex", relationship: "friend", x: 85, y: 10 },
    { name: "Blair", relationship: "family", x: 42, y: 75 },
    { name: "Casey", relationship: "lover", x: 74, y: 22 },
    { name: "Me", relationship: "me", x: 62, y: 33 }
  ]);
});

test("foe is represented as enemy in the existing relationship model", () => {
  const ui = startGuide();
  complete(ui, "enemy");
  ui.el("starter-save").dispatch("click");
  assert.equal(ui.api.pendingPeople()[2].relationship, "enemy");
});

test("back and edit permit changing ratings before reveal and after reveal", () => {
  const ui = startGuide();
  answer(ui, "Alex", 85, 10);
  ui.el("starter-back").dispatch("click");
  assert.equal(ui.el("starter-name").value, "Alex");
  answer(ui, "Alex", 40, 35);
  answer(ui, "Blair", 42, 75);
  answer(ui, "Casey", 74, 22, "lover");
  answer(ui, "", 62, 33);
  ui.el("starter-edit").dispatch("click");
  assert.equal(ui.el("starter-graph").hidden, false);
  assert.ok(ui.el("starter-graph").children.every(dot => dot.hidden));
  assert.equal(ui.el("starter-title").hidden, false);
  assert.equal(ui.el("starter-cool").value, "62");
  answer(ui, "", 33, 64);
  assert.ok(ui.el("starter-graph").children.every(dot => !dot.hidden));
  ui.el("starter-save").dispatch("click");
  assert.equal(ui.api.pendingPeople()[0].x, 40);
  assert.equal(ui.api.pendingPeople()[3].y, 64);
});

test("dragging after editing answers changes the current saved dot", () => {
  const ui = startGuide();
  complete(ui);
  ui.el("starter-edit").dispatch("click");
  answer(ui, "", 60, 60);
  const dot = ui.el("starter-graph").children[3];
  dot.dispatch("pointerdown", { clientX: parseFloat(dot.style.left) + 1, clientY: parseFloat(dot.style.top) + 1 });
  dot.dispatch("pointermove");
  dot.dispatch("pointerup");
  ui.el("starter-save").dispatch("click");
  assert.ok(ui.api.pendingPeople()[3].x > 60);
  assert.ok(ui.api.pendingPeople()[3].y > 60);
});

test("ready draft survives refresh and clears only after confirmed account import", () => {
  const ui = startGuide();
  complete(ui);
  ui.el("starter-save").dispatch("click");
  const afterReload = mount(Object.fromEntries(ui.store));
  assert.equal(afterReload.el("auth-details").hidden, false);
  assert.equal(afterReload.el("starter-graph").hidden, false);
  assert.equal(afterReload.el("demo-column").classList.contains("starter-active"), true);
  assert.equal(afterReload.el("starter-try").hidden, true);
  assert.equal(afterReload.el("starter-privacy").hidden, true);
  assert.equal(afterReload.el("starter-graph").children.length, 4);
  afterReload.el("starter-graph").children[0].dispatch("keydown", { key: "ArrowRight" });
  assert.equal(afterReload.api.pendingPeople()[0].x, 87);
  assert.equal(afterReload.api.pendingPeople().length, 4);
  afterReload.api.confirmImported();
  const nextVisit = mount(Object.fromEntries(afterReload.store));
  assert.equal(nextVisit.api.pendingPeople(), null);
  assert.equal(nextVisit.el("auth-details").hidden, false);
  assert.equal(nextVisit.el("starter-try").hidden, false);
});

test("unfinished answers resume during the visit but are discarded on reload", () => {
  const ui = startGuide();
  answer(ui, "Alex", 85, 10);
  assert.equal(ui.api.pendingPeople(), null);
  assert.equal(ui.store.has(DRAFT_KEY), false);
  ui.api.showHomepage();
  ui.el("starter-try").dispatch("click");
  assert.match(ui.el("starter-title").textContent, /family/i);
  const again = mount(Object.fromEntries(ui.store));
  assert.equal(again.el("auth-details").hidden, false);
  assert.equal(again.el("starter-try").hidden, false);
  assert.equal(again.el("starter-graph").hidden, true);
  assert.equal(again.el("demo-column").classList.contains("starter-active"), false);
  again.el("starter-try").dispatch("click");
  assert.equal(again.el("starter-flow").hidden, false);
  assert.equal(again.el("starter-privacy").hidden, false);
  assert.equal(again.el("demo-column").hidden, false);
  assert.equal(again.el("starter-graph").hidden, false);
  assert.equal(again.el("starter-graph").children.length, 0);
  assert.match(again.el("starter-title").textContent, /friend/i);
  assert.equal(again.store.has(DRAFT_KEY), false);
  again.el("starter-skip").dispatch("click");
  assert.equal(again.el("starter-privacy").hidden, true);
  assert.equal(again.el("starter-try").hidden, false);
  assert.equal(again.api.pendingPeople(), null);
});

test("legacy unfinished drafts are removed rather than resumed", () => {
  const legacy = JSON.stringify({
    version: 2, answers: [{ name: "Alex", relationship: "friend", x: 85, y: 10 }],
    step: 1, phase: "questions", ready: false, updatedAt: Date.now()
  });
  const ui = mount({ [DRAFT_KEY]: legacy }, "#/try");
  assert.equal(ui.store.has(DRAFT_KEY), false);
  assert.match(ui.el("starter-title").textContent, /friend/i);
});

test("editing a saved handoff removes it from storage until saved again", () => {
  const ui = startGuide();
  complete(ui);
  ui.el("starter-save").dispatch("click");
  assert.ok(ui.api.pendingPeople());
  ui.win.location.hash = "#/try";
  ui.win.listeners.popstate();
  ui.el("starter-edit").dispatch("click");
  assert.equal(ui.store.has(DRAFT_KEY), false);
  assert.equal(ui.api.pendingPeople(), null);
});

test("the walkthrough route supports direct visits and browser navigation", () => {
  const ui = mount({}, "#/try");
  assert.equal(ui.el("starter-flow").hidden, false);
  answer(ui, "Alex", 85, 10);
  ui.win.location.hash = "";
  ui.win.listeners.popstate();
  assert.equal(ui.el("starter-flow").hidden, true);
  assert.equal(ui.el("starter-try").hidden, false);
  ui.win.location.hash = "#/try";
  ui.win.listeners.popstate();
  assert.equal(ui.el("starter-flow").hidden, false);
  assert.match(ui.el("starter-title").textContent, /family/i);
  ui.api.showHomepage();
  assert.equal(ui.win.location.hash, "");
  assert.equal(ui.el("starter-flow").hidden, true);
});

test("other URL fragments remain available to authentication", () => {
  const ui = mount({}, "#access_token=example");
  assert.equal(ui.el("starter-flow").hidden, true);
  ui.api.showHomepage();
  assert.equal(ui.win.location.hash, "#access_token=example");
});

test("the personalized graph zooms, pans, resets, and keeps ratings unchanged", () => {
  const ui = startGuide();
  complete(ui);
  const graph = ui.el("starter-graph");
  const dot = graph.children[1];
  const original = { left: dot.style.left, top: dot.style.top };
  graph.dispatch("wheel", { deltaY: -500, deltaMode: 0, clientX: 201, clientY: 201 });
  assert.equal(ui.el("starter-footer").hidden, false);
  assert.notEqual(dot.style.left, original.left);
  const zoomedLeft = dot.style.left;
  graph.dispatch("keydown", { key: "ArrowRight", shiftKey: true });
  assert.notEqual(dot.style.left, zoomedLeft);
  graph.dispatch("pointerdown", { clientX: 200, clientY: 200 });
  graph.dispatch("pointermove", { clientX: 220, clientY: 200 });
  graph.dispatch("pointerup");
  ui.el("starter-reset").dispatch("click");
  assert.equal(ui.el("starter-footer").hidden, true);
  assert.deepEqual({ left: dot.style.left, top: dot.style.top }, original);
  ui.el("starter-save").dispatch("click");
  assert.deepEqual(ui.api.pendingPeople().map(({ x, y }) => [x, y]),
    [[85, 10], [42, 75], [74, 22], [62, 33]]);
});

test("dragging an offscreen person starts from their actual rating", () => {
  const ui = startGuide();
  complete(ui);
  const graph = ui.el("starter-graph");
  graph.dispatch("wheel", { deltaY: -500, deltaMode: 0, clientX: 201, clientY: 201 });
  const dot = graph.children[0];
  const x = parseFloat(dot.style.left) + 1;
  const y = parseFloat(dot.style.top) + 1;
  dot.dispatch("pointerdown", { clientX: x, clientY: y });
  dot.dispatch("pointermove", { clientX: x - 10, clientY: y });
  dot.dispatch("pointerup");
  ui.el("starter-save").dispatch("click");
  const person = ui.api.pendingPeople()[0];
  assert.ok(person.x >= 80 && person.x < 85);
  assert.equal(person.y, 10);
});

test("duplicate names and reserved Me cannot be used for another person", () => {
  const ui = startGuide();
  answer(ui, "Alex", 50, 50);
  ui.el("starter-name").value = "alex";
  ui.el("starter-answer-form").dispatch("submit");
  assert.equal(ui.el("starter-step").textContent, "Step 2 of 4");
  assert.match(ui.el("starter-error").textContent, /already rated/i);
  ui.el("starter-name").value = "Me";
  ui.el("starter-answer-form").dispatch("submit");
  assert.match(ui.el("starter-error").textContent, /reserved/i);
});

test("lover or foe is required at the third step", () => {
  const ui = startGuide();
  answer(ui, "Alex", 50, 50);
  answer(ui, "Blair", 50, 50);
  ui.el("starter-name").value = "Casey";
  ui.el("starter-answer-form").dispatch("submit");
  assert.match(ui.el("starter-error").textContent, /choose lover or foe/i);
  assert.equal(ui.el("starter-step").textContent, "Step 3 of 4");
});

test("stale draft ratings expire rather than import silently", () => {
  const old = JSON.stringify({
    version: 2, ready: true, phase: "reveal", step: 3,
    updatedAt: Date.now() - 8 * 24 * 60 * 60 * 1000,
    answers: [
      { name: "A", relationship: "friend", x: 50, y: 50 },
      { name: "B", relationship: "family", x: 50, y: 50 },
      { name: "C", relationship: "enemy", x: 50, y: 50 },
      { name: "Me", relationship: "me", x: 50, y: 50 }
    ]
  });
  const ui = mount({ [DRAFT_KEY]: old });
  assert.equal(ui.el("starter-graph").hidden, true);
  assert.equal(ui.el("starter-graph").children.length, 0);
  assert.equal(ui.api.pendingPeople(), null);
  assert.equal(ui.store.get(DRAFT_KEY), undefined);
});
