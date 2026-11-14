import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../guided-intro.js", import.meta.url), "utf8");
const DRAFT_KEY = "the-pear-first-graph-v1";
const DISMISSED_KEY = "the-pear-intro-dismissed-v1";

function mount(initialStorage = {}) {
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
      this.value = "";
      this.children = [];
      this.className = "";
      this.listeners = {};
      this.style = { setProperty() {} };
      this.classList = { add() {}, remove() {}, toggle() {} };
      this.clientWidth = 400;
      this.clientHeight = 400;
      this.clientLeft = 1;
      this.clientTop = 1;
    }
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
    dispatch(type, props = {}) {
      for (const fn of this.listeners[type] ?? []) {
        fn({ preventDefault() {}, pointerId: 1, isPrimary: true, button: 0,
          clientX: 305, clientY: 90, ...props });
      }
    }
    append(...items) { this.children.push(...items); }
    querySelector(selector) {
      return this.children.find(child => child.className === selector.slice(1));
    }
    setAttribute() {}
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
  el("starter-progress").children = [new Element("span"), new Element("span"), new Element("span")];
  const win = {};
  const ResizeObserverStub = class { observe() {} };
  new Function("document", "window", "localStorage", "ResizeObserver", source)(
    doc, win, storage, ResizeObserverStub
  );
  return { el, store, api: win.thePearStarter };
}

function addPerson(ui, name) {
  ui.el("starter-name").value = name;
  ui.el("starter-name-form").dispatch("submit");
  ui.el("starter-continue").dispatch("click");
}

test("a guest can place three people and sign in only when ready to save", () => {
  const ui = mount();
  assert.equal(ui.el("starter-flow").hidden, false);
  assert.equal(ui.el("auth-details").hidden, true);
  ui.el("starter-name").value = "Alex";
  ui.el("starter-name-form").dispatch("submit");
  const point = ui.el("starter-graph").children.find(child => child.className.includes("starter-person"));
  point.dispatch("pointerdown");
  point.dispatch("pointermove");
  point.dispatch("pointerup");
  ui.el("starter-continue").dispatch("click");
  addPerson(ui, "Blair");
  addPerson(ui, "Casey");
  assert.equal(ui.el("starter-finish-actions").hidden, false);
  const saved = JSON.parse(ui.store.get(DRAFT_KEY));
  assert.equal(saved.people.length, 3);
  assert.ok(saved.people[0].x > 50);
  assert.ok(saved.people[0].y > 50);
  assert.equal(ui.api.pendingPeople(), null, "the draft isn't yet approved for import");

  ui.el("starter-save").dispatch("click");
  assert.equal(ui.el("auth-details").hidden, false);
  assert.equal(ui.el("starter-auth-note").hidden, false);
  assert.deepEqual(ui.api.pendingPeople().map(person => person.name), ["Alex", "Blair", "Casey"]);
});

test("a ready draft survives reload and clears only after successful import", () => {
  const ui = mount();
  for (const name of ["A", "B", "C"]) addPerson(ui, name);
  ui.el("starter-save").dispatch("click");
  const afterReload = mount(Object.fromEntries(ui.store));
  assert.equal(afterReload.el("auth-details").hidden, false);
  assert.equal(afterReload.api.pendingPeople().length, 3);
  afterReload.api.confirmImported();
  const nextVisit = mount(Object.fromEntries(afterReload.store));
  assert.equal(nextVisit.api.pendingPeople(), null);
  assert.equal(nextVisit.el("auth-details").hidden, false);
  assert.equal(nextVisit.store.get(DISMISSED_KEY), "1");
});

test("skip is remembered but visitors can reopen the experience", () => {
  const ui = mount();
  ui.el("starter-skip").dispatch("click");
  const again = mount(Object.fromEntries(ui.store));
  assert.equal(again.el("auth-details").hidden, false);
  again.el("starter-try").dispatch("click");
  assert.equal(again.el("starter-flow").hidden, false);
  assert.equal(again.store.get(DISMISSED_KEY), undefined);
});

test("duplicate names do not add another person", () => {
  const ui = mount();
  addPerson(ui, "Alex");
  ui.el("starter-name").value = "aLeX";
  ui.el("starter-name-form").dispatch("submit");
  assert.equal(JSON.parse(ui.store.get(DRAFT_KEY)).people.length, 1);
  assert.match(ui.el("starter-error").textContent, /already on your graph/i);
});

test("expired drafts do not silently import", () => {
  const expired = JSON.stringify({
    version: 1, ready: true, phase: "done",
    updatedAt: Date.now() - 8 * 24 * 60 * 60 * 1000,
    people: [{ name: "A", x: 50, y: 50 }, { name: "B", x: 50, y: 50 }, { name: "C", x: 50, y: 50 }]
  });
  const ui = mount({ [DRAFT_KEY]: expired });
  assert.equal(ui.el("starter-flow").hidden, false);
  assert.equal(ui.api.pendingPeople(), null);
});
