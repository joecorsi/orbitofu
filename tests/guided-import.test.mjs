import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Exercise the actual account import helpers without needing a Supabase connection.
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const start = html.indexOf("      function starterGraphData(guests) {");
const end = html.indexOf("      async function loadGraphs(load) {", start);
assert.ok(start >= 0 && end > start, "account import helpers are present");
const helpers = html.slice(start, end);
const guests = [
  { name: "Alex", relationship: "friend", x: 15, y: 22 },
  { name: "Blair", relationship: "family", x: 35, y: 42 },
  { name: "Casey", relationship: "enemy", x: 57, y: 81 },
  { name: "Me", relationship: "me", x: 67, y: 75 }
];

function starterGraph(answers) {
  let sequence = 0;
  const initialState = () => ({
    traits: [
      { id: "lame-cool" },
      { id: "benevolent-malevolent" },
      { id: "other" }
    ],
    people: []
  });
  const makeId = () => "person-" + ++sequence;
  return new Function("initialState", "makeId", "COLORS", helpers +
    "\nreturn starterGraphData;")(initialState, makeId,
    ["#111111", "#222222", "#333333", "#444444"])(answers);
}

test("imports exactly three relationship-labeled people into a new graph", () => {
  const graph = starterGraph(guests);
  assert.equal(graph.people.length, 3);
  assert.deepEqual(graph.people.map(person => person.relationship), ["friend", "family", "enemy"]);
  assert.deepEqual(graph.people.map(person => person.name), ["Alex", "Blair", "Casey"]);
  assert.deepEqual(graph.people.map(person => [
    person.values["lame-cool"], person.values["benevolent-malevolent"], person.values.other
  ]), [[15, 22, 50], [35, 42, 50], [57, 81, 50]]);
  assert.equal(graph.people.some(person => person.name === "Me"), false);
});

test("shared Me profile gets only the two new ratings, preserving other traits", async () => {
  const writes = [];
  const client = { from(table) {
    assert.equal(table, "me_profiles");
    return { async upsert(payload, options) {
      writes.push({ payload, options });
      return { error: null };
    } };
  } };
  const initialMe = { id: "__me__", name: "Me", color: "#145c92",
    relationshipColors: { friend: "#abcdef" }, values: { other: 92, "lame-cool": 10 } };
  const updated = await new Function("client", "currentUser", "initialMe", "guests",
    helpers + "\nlet mePerson = initialMe;\nreturn saveStarterMe(guests).then(() => mePerson);")(
    client, { id: "user-1" }, initialMe, guests
  );
  assert.deepEqual(updated.values, {
    other: 92, "lame-cool": 67, "benevolent-malevolent": 75
  });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].payload.user_id, "user-1");
  assert.deepEqual(updated.relationshipColors, { friend: "#abcdef" });
  assert.equal(writes[0].options.onConflict, "user_id");
});

test("failed Me save rejects rather than pretending import finished", async () => {
  const client = { from() {
    return { async upsert() { return { error: new Error("Access denied") }; } };
  } };
  const initialMe = { id: "__me__", name: "Me", values: {} };
  const action = new Function("client", "currentUser", "initialMe", "guests",
    helpers + "\nlet mePerson = initialMe;\nreturn saveStarterMe(guests);")(
    client, { id: "user-1" }, initialMe, guests
  );
  await assert.rejects(action, /Access denied/);
});

test("account relationship colors use defaults and reject malformed saved values", () => {
  const start = html.indexOf("      function normalizeRelationshipColors(colors)");
  const end = html.indexOf("      const DEFAULT_CONFIG", start);
  assert.ok(start >= 0 && end > start);
  const defaults = { friend: "#009b4f", enemy: "#382110", lover: "#f25416", family: "#7441a6" };
  const normalize = new Function("RELATIONSHIP_COLORS",
    html.slice(start, end) + "\nreturn normalizeRelationshipColors;")(defaults);
  assert.deepEqual(normalize(undefined), defaults);
  assert.deepEqual(normalize({ friend: "#abcdef" }), { ...defaults, friend: "#abcdef" });
  assert.throws(() => normalize({ friend: "red" }), /relationship colors/);
  assert.throws(() => normalize({ stranger: "#123456" }), /relationship colors/);
  assert.throws(() => normalize(null), /relationship colors/);
});

test("relationship color picker saves the account profile and rolls back a failed save", async () => {
  const start = html.indexOf('      el.colorForm.addEventListener("submit"');
  const end = html.indexOf("      for (const [controls, axis]", start);
  assert.ok(start >= 0 && end > start);
  const writes = [];
  const notices = [];
  const dialog = { close() { this.closed = true; } };
  const el = { colorForm: { addEventListener(_type, fn) { this.submit = fn; } }, colorDialog: dialog,
    saveColor: {}, cancelColor: {}, colorFields: {}, colorNotice: {} };
  const profile = { relationshipColors: { friend: "#009b4f", family: "#7441a6" } };
  let fail = false;
  const helpers = {
    schedulePersonSave(person) { writes.push(JSON.parse(JSON.stringify(person))); },
    async flushPendingSave() { if (fail) throw new Error("offline"); },
    recordHistory() {}, drawChart() {}, setSaveStatus() {}, reportError() {},
    showNotice(_target, message) { notices.push(message); }
  };
  const setup = new Function("el", "profile", "helpers", `
    const { schedulePersonSave, flushPendingSave, recordHistory, drawChart, setSaveStatus, reportError, showNotice } = helpers;
    let mePerson = profile, colorPerson = null, colorRelationship = null, colorDraft = "", savingColor = false;
    let colorButton = { style: {} };
    ${html.slice(start, end)}
    return (relationship, color) => { colorRelationship = relationship; colorDraft = color; return el.colorForm.submit({ preventDefault() {} }); };
  `)(el, profile, helpers);
  await setup("friend", "#abcdef");
  assert.equal(profile.relationshipColors.friend, "#abcdef");
  assert.equal(writes.at(-1).relationshipColors.friend, "#abcdef");
  assert.equal(dialog.closed, true);
  dialog.closed = false;
  fail = true;
  await setup("family", "#123456");
  assert.equal(profile.relationshipColors.family, "#7441a6");
  assert.equal(writes.at(-1).relationshipColors.family, "#7441a6");
  assert.equal(dialog.closed, false);
  assert.match(notices.at(-1), /offline/);
});

test("hover and selection highlight labels without drawing dotted dot outlines", () => {
  const start = html.indexOf("        const drawHighlight = index => {");
  const end = html.indexOf("        if (focusedIndex", start);
  assert.ok(start >= 0 && end > start);
  const labels = [];
  const arcs = [];
  const context = { setLineDash() {}, beginPath() {}, arc(...args) { arcs.push(args); }, stroke() {} };
  const highlight = new Function("state", "drawLabel", "context", "plotted", "personDotRadius", "selectedIndex",
    html.slice(start, end) + "\nreturn drawHighlight;")(
    { hideNames: false }, (...args) => labels.push(args), context,
    [{ point: { x: 10, y: 20 } }, { point: { x: 30, y: 40 } }], 6, 1
  );
  highlight(0);
  highlight(1);
  assert.deepEqual(labels, [[0, true], [1, true]]);
  assert.deepEqual(arcs, []);
});

test("hovered and selected dots match the proximity pulse peak", () => {
  const start = html.indexOf("        const drawDot = index => {");
  const end = html.indexOf("        plotted.forEach", start);
  assert.ok(start >= 0 && end > start);
  const dots = [];
  const context = {
    beginPath() {}, arc(x, y, radius) { dots.push({ radius, border: this.lineWidth }); },
    fill() {}, stroke() {}
  };
  const plotted = [0, 1, 2, 3].map(id => ({
    person: { id, color: "#123456" }, point: { x: id, y: id }, sticky: false
  }));
  const draw = new Function("context", "plotted", "hoveredIndex", "hoveredPersonId", "selectedIndex",
    "focusedIndex", "pulses", "state", "personDotBorderWidth", "personDotRadius",
    html.slice(start, end) + "\nreturn drawDot;")(
    context, plotted, 0, 0, 1, -1, [{ person: plotted[2].person, scale: 1.5 }], { colorByRelationship: false }, 2, 6
  );
  [0, 1, 2, 3].forEach(draw);
  assert.deepEqual(dots, [
    { radius: 9, border: 3 }, { radius: 9, border: 3 },
    { radius: 9, border: 3 }, { radius: 6, border: 2 }
  ]);
});

test("saved graph menu lists current targets even when modes are disabled", () => {
  const start = html.indexOf("      function axisScore(person, axis, range) {");
  const end = html.indexOf("      function chartPoint(person, bounds, range) {", start);
  assert.ok(start >= 0 && end > start);
  const window = {};
  new Function("window", "document", readFileSync(new URL("../proximity.js", import.meta.url), "utf8"))(window, {});
  const me = { values: { x: 80, y: 25 } };
  const people = [
    { name: "same", values: { x: 79, y: 25 } },
    { name: "vertical", values: { x: 21, y: 25 } },
    { name: "horizontal", values: { x: 80, y: 75 } },
    { name: "hidden", hidden: true, values: { x: 20, y: 25 } }
  ];
  const names = Object.fromEntries(["closest", "furthest", "verticalSymmetry", "horizontalSymmetry"]
    .map(mode => [mode, { textContent: "", title: "" }]));
  const checks = Object.fromEntries(Object.keys(names)
    .map(mode => [mode, { checked: false, parentElement: { querySelector: () => names[mode] } }]));
  const toggle = { firstElementChild: {}, getAttribute() {}, setAttribute() {} };
  const menu = { hidden: false };
  const update = new Function("state", "mePerson", "proximityChecks", "el", "chartAxisTransition",
    "isPersonVisibleOnGraph", "findProximity", "setProximityLabel", "AGE_AXIS", "ageRange",
    html.slice(start, end) + "\nreturn updateProximity;")(
    { xTrait: "x", yTrait: "y", people }, me, checks, { proximityToggle: toggle, proximityMenu: menu },
    { point: (_id, point) => point }, person => !person.hidden,
    window.thePearProximity.findProximity, window.thePearProximity.setProximityLabel, "__age__", () => null
  );
  assert.deepEqual(update(), []);
  assert.deepEqual(Object.values(names).map(name => name.textContent), ["same", "vertical", "vertical", "horizontal"]);
  checks.verticalSymmetry.checked = true;
  assert.equal(update()[0].person.name, "vertical");
  assert.equal(toggle.firstElementChild.textContent, "Vertical symmetry: vertical");
  checks.horizontalSymmetry.checked = true;
  assert.deepEqual(update().map(result => result.person.name), ["vertical", "horizontal"]);
  assert.equal(toggle.firstElementChild.textContent, "Proximity");
  checks.horizontalSymmetry.checked = false;
  me.values.x = 50;
  assert.deepEqual(update(), []);
  assert.equal(toggle.firstElementChild.textContent, "No opposite-side match");
  assert.equal(names.verticalSymmetry.textContent, "");
  assert.equal(names.horizontalSymmetry.textContent, "horizontal");
  me.values.y = 50;
  update();
  assert.equal(names.horizontalSymmetry.textContent, "");
});

test("overlapping proximity lines hit the topmost visible line", () => {
  const start = html.indexOf("      function proximityAtPoint(point) {");
  const end = html.indexOf("      function updatePersonSliders(", start);
  assert.ok(start >= 0 && end > start);
  const lines = [
    { mode: "closest", from: {}, to: {}, progress: 1 },
    { mode: "furthest", from: {}, to: {}, progress: 0.5 }
  ];
  const atPoint = new Function("chartProximityLines", "proximityHitContext", "hitProximityLine",
    html.slice(start, end) + "\nreturn proximityAtPoint;")(
    lines, {}, (_context, _from, _to, _mode, _progress, point) => point.hit
  );
  assert.equal(atPoint({ hit: true }).mode, "furthest");
  assert.equal(atPoint({ hit: false }), null);
});

test("hovered proximity label uses the person label style at the line midpoint", () => {
  const raisedStart = html.indexOf("        const drawRaisedLabel = ");
  const raisedEnd = html.indexOf("        const drawLabel = ", raisedStart);
  const labelStart = html.indexOf("        if (hoveredLine && width > 14 && height > 25) {");
  const labelEnd = html.indexOf("        if (awaitingPlacement.length", labelStart);
  assert.ok(raisedStart >= 0 && raisedEnd > raisedStart && labelStart >= 0 && labelEnd > labelStart);
  const calls = [];
  const labelContext = {
    save() {}, restore() {}, beginPath() {}, fill() {},
    measureText: () => ({ width: 100, actualBoundingBoxAscent: 12, actualBoundingBoxDescent: 4 }),
    roundRect(...args) { calls.push(["box", ...args]); },
    stroke() { calls.push(["border", this.strokeStyle]); },
    fillText(...args) { calls.push(["text", this.fillStyle, ...args]); }
  };
  new Function("labelContext", "hoveredLine", "width", "height", "modeLabels",
    html.slice(raisedStart, raisedEnd) + html.slice(labelStart, labelEnd))(
    labelContext, { mode: "furthest", name: "Alice", from: { x: 100, y: 100 }, to: { x: 200, y: 200 } },
    400, 400, { furthest: "Furthest" }
  );
  assert.deepEqual(calls, [
    ["box", 94.5, 116.5, 111, 23, 3], ["border", "#000"],
    ["text", "#000", "Furthest: Alice", 100, 132, 100]
  ]);
});

const navigationStart = html.indexOf("      async function openHomepage(");
const navigationEnd = html.indexOf("      el.homeLink.addEventListener", navigationStart);
assert.ok(navigationStart >= 0 && navigationEnd > navigationStart, "homepage navigation helpers are present");
const navigation = html.slice(navigationStart, navigationEnd);

test("hidden traits keep scores and selected axes use visible alternatives or age", () => {
  const start = html.indexOf("      function isValidState(value)");
  const end = html.indexOf("      function showNotice(", start);
  assert.ok(start >= 0 && end > start);
  const normalize = new Function("AGE_AXIS", "COLORS", "FUNNY_TRAIT", "RELATIONSHIP_COLORS", "modeLabels",
    html.slice(start, end) + "\nreturn normalizeState;")("__age__", ["#111111"], {}, {},
    { closest: "Closest", furthest: "Furthest", verticalSymmetry: "Vertical symmetry", horizontalSymmetry: "Horizontal symmetry" });
  const base = {
    funnyTraitMigrated: true,
    traits: [{ id: "a", name: "A", hidden: true }, { id: "b", name: "B" }, { id: "c", name: "C" }],
    people: [{ id: "p", name: "Person", values: { a: 12, b: 34, c: 56 } }],
    xTrait: "a", yTrait: "b"
  };
  const hidden = normalize(base);
  assert.deepEqual(hidden.proximityModes, []);
  assert.deepEqual([hidden.xTrait, hidden.yTrait], ["c", "b"]);
  assert.equal(hidden.people[0].values.a, 12);
  assert.equal(hidden.traits[0].hidden, true);
  const allHidden = normalize({ ...base, traits: base.traits.map(trait => ({ ...trait, hidden: true })) });
  assert.deepEqual([allHidden.xTrait, allHidden.yTrait], ["__age__", "__age__"]);
  const shown = normalize({ ...hidden, traits: hidden.traits.map(trait => ({ ...trait, hidden: false })) });
  assert.equal(shown.people[0].values.a, 12);
  const saved = ["closest", "horizontalSymmetry"];
  const restored = normalize({ ...base, proximityModes: saved });
  assert.deepEqual(restored.proximityModes, saved);
  assert.notEqual(restored.proximityModes, saved);
  assert.throws(() => normalize({ ...base, proximityModes: ["unknown"] }), /expected format/);
  assert.throws(() => normalize({ ...base, proximityModes: "closest" }), /expected format/);
  assert.throws(() => normalize({ ...base, traits: [{ id: "a", name: "A", hidden: "yes" }] }), /expected format/);
});

test("proximity selections save together and clear as one change", () => {
  const start = html.indexOf("\n      const proximityControl = setupProximityMenu(");
  const end = html.indexOf("      function openGraphOptions()", start);
  assert.ok(start >= 0 && end > start);
  const element = () => ({
    checked: false, listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; }
  });
  const checks = { closest: element(), furthest: element(), verticalSymmetry: element(), horizontalSymmetry: element() };
  const clear = element();
  const state = { proximityModes: [] };
  const writes = [];
  let stops = 0, draws = 0;
  new Function("el", "proximityChecks", "state", "setupProximityMenu", "drawChart", "scheduleSave",
    html.slice(start, end))(
    { proximityClear: clear, proximityClosest: checks.closest, proximityFurthest: checks.furthest,
      proximityVerticalSymmetry: checks.verticalSymmetry, proximityHorizontalSymmetry: checks.horizontalSymmetry },
    checks, state, () => ({ close() {}, stop() { stops++; } }), () => { draws++; },
    () => writes.push([...state.proximityModes])
  );
  checks.closest.checked = true;
  checks.closest.listeners.change();
  checks.horizontalSymmetry.checked = true;
  checks.horizontalSymmetry.listeners.change();
  assert.deepEqual(writes, [["closest"], ["closest", "horizontalSymmetry"]]);
  clear.listeners.click();
  assert.deepEqual(state.proximityModes, []);
  assert.ok(Object.values(checks).every(input => !input.checked));
  assert.deepEqual(writes.at(-1), []);
  assert.equal(writes.length, 3);
  assert.equal(stops, 1);
  assert.equal(draws, 1);
  clear.listeners.click();
  assert.equal(writes.length, 3);
});

test("render restores saved proximity choices without replaying sweeps", () => {
  const start = html.indexOf("      function render() {");
  const end = html.indexOf("      function setButtonsDisabled(", start);
  assert.ok(start >= 0 && end > start);
  const checks = { closest: { checked: false }, furthest: { checked: false },
    verticalSymmetry: { checked: false }, horizontalSymmetry: { checked: false } };
  const state = { proximityModes: ["closest", "verticalSymmetry"], hiddenRelationships: [] };
  let stops = 0;
  const render = new Function("state", "el", "proximityChecks", "proximityControl", "chartAxisTransition",
    "renderAxes", "renderPeople", "renderDimensions", "drawChart",
    html.slice(start, end) + "\nreturn render;")(
    state, { relationshipColors: {}, showNames: {}, graphRelationships: [] }, checks,
    { stop() { stops++; } }, { stop() {} }, () => {}, () => {}, () => {}, () => {}
  );
  render();
  assert.deepEqual(Object.values(checks).map(input => input.checked), [true, false, true, false]);
  assert.equal(stops, 1);
  render();
  assert.equal(stops, 1);
  state.proximityModes = ["furthest"];
  render();
  assert.deepEqual(Object.values(checks).map(input => input.checked), [false, true, false, false]);
  assert.equal(stops, 2);
});

test("axis menus and shuffle exclude hidden traits", () => {
  const resolveStart = html.indexOf("      function resolveTraitAxes(");
  const resolveEnd = html.indexOf("      function normalizeState(", resolveStart);
  const axesStart = html.indexOf("      function renderAxes()");
  const axesEnd = html.indexOf("      function updatePeopleScrollHint()", axesStart);
  assert.ok(resolveStart >= 0 && resolveEnd > resolveStart && axesStart >= 0 && axesEnd > axesStart);
  const x = { replaceChildren(...options) { this.options = options; } };
  const y = { replaceChildren(...options) { this.options = options; } };
  const state = { traits: [{ id: "a" }, { id: "b", hidden: true }], xTrait: "b", yTrait: "a" };
  const el = { xAxes: [x], yAxes: [y], shuffleAxes: {} };
  const dropdowns = new Map([[x, { sync() {} }], [y, { sync() {} }]]);
  const render = new Function("state", "el", "axisDropdowns", "createOption", "Option", "AGE_AXIS",
    html.slice(resolveStart, resolveEnd) + html.slice(axesStart, axesEnd) + "\nreturn renderAxes;")(
    state, el, dropdowns, trait => ({ value: trait.id }),
    function Option(_name, value) { this.value = value; }, "__age__");
  render();
  assert.deepEqual(x.options.map(option => option.value), ["a", "__age__"]);
  assert.equal(state.xTrait, "a");
  assert.equal(el.shuffleAxes.disabled, true);
  state.traits[1].hidden = false;
  render();
  assert.deepEqual(x.options.map(option => option.value), ["a", "b", "__age__"]);
  assert.equal(el.shuffleAxes.disabled, false);
});

test("people expand button uses short labels and toggles only visible people", () => {
  const start = html.indexOf("      function updatePeopleExpandButton()");
  const end = html.indexOf("      function updatePeopleSearch()", start);
  assert.ok(start >= 0 && end > start);
  const cards = [{ open: false, hidden: false }, { open: false, hidden: true }];
  const button = {
    firstElementChild: {}, setAttribute() {},
    addEventListener(_type, listener) { this.click = listener; }
  };
  const el = { meRow: { children: [] }, peopleList: { children: cards }, peopleExpandAll: button };
  const update = new Function("el", "graphOpenedPeople",
    html.slice(start, end) + "\nreturn updatePeopleExpandButton;")(el, new Set());
  update();
  assert.equal(button.firstElementChild.textContent, "Expand");
  button.click();
  assert.equal(button.firstElementChild.textContent, "Collapse");
  assert.equal(cards[0].open, true);
  assert.equal(cards[1].open, false);
  button.click();
  assert.equal(button.firstElementChild.textContent, "Expand");
  assert.equal(cards[0].open, false);
});

test("graph edit menu supports keyboard navigation and dismissal", () => {
  const start = html.indexOf("      function closeGraphEditMenu(");
  const end = html.indexOf("      el.accountEmail.addEventListener", start);
  assert.ok(start >= 0 && end > start);
  const document = { activeElement: null, listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; } };
  function element() {
    return {
      listeners: {}, attributes: {},
      addEventListener(type, fn) { this.listeners[type] = fn; },
      setAttribute(name, value) { this.attributes[name] = value; },
      focus() { document.activeElement = this; }
    };
  }
  const toggle = element();
  const items = [element(), element(), element()];
  const menu = { hidden: true, querySelectorAll: () => items };
  const graphEdit = { ...element(), contains: target => [toggle, menu, ...items].includes(target) };
  const el = { graphEdit, graphEditToggle: toggle, graphEditMenu: menu };
  new Function("el", "document", html.slice(start, end))(el, document);

  toggle.listeners.click();
  assert.equal(menu.hidden, false);
  assert.equal(toggle.attributes["aria-expanded"], "true");
  graphEdit.listeners.keydown({ key: "ArrowDown", preventDefault() {} });
  assert.equal(document.activeElement, items[0]);
  graphEdit.listeners.keydown({ key: "End", preventDefault() {} });
  assert.equal(document.activeElement, items[2]);
  graphEdit.listeners.keydown({ key: "Escape", preventDefault() {} });
  assert.equal(menu.hidden, true);
  assert.equal(document.activeElement, toggle);
  assert.equal(toggle.attributes["aria-expanded"], "false");
  toggle.listeners.click();
  document.listeners.pointerdown({ target: {} });
  assert.equal(menu.hidden, true);
});

function navigationHarness({ session = { user: { id: "user-1" } }, saveError = null, pending = null, rememberedGoogle = false, googleError = null } = {}) {
  const calls = [];
  const el = { workspace: { hidden: false }, accountBar: { hidden: false }, authScreen: { hidden: true } };
  const client = { auth: { getSession: async () => ({ data: { session }, error: null }) } };
  const window = { thePearStarter: {
    showHomepage: () => calls.push("homepage"),
    pendingPeople: () => pending
  } };
  const flushPendingSave = async () => {
    calls.push("flush");
    if (saveError) throw saveError;
  };
  const closeMenu = () => {};
  const applySession = async (...args) => { calls.push(["session", ...args]); };
  const drawChart = () => calls.push("draw");
  const localStorage = { getItem: () => rememberedGoogle ? "1" : null };
  const signInWithGoogle = async () => {
    calls.push("google");
    if (googleError) throw googleError;
  };
  const api = new Function("el", "client", "window", "flushPendingSave", "closeAccountMenu",
    "closeGraphEditMenu", "closePeopleFilter", "closeGraphOptions", "closeProximityMenu", "applySession", "drawChart",
    "localStorage", "GOOGLE_SIGN_IN_KEY", "signInWithGoogle",
    `let showingHomepage = false, currentUser = { id: "user-1" }, state = {};
     ${navigation}
     return { openHomepage, returnToAccount };`)(
    el, client, window, flushPendingSave, closeMenu, closeMenu, closeMenu, closeMenu, closeMenu, applySession, drawChart,
    localStorage, "google-sign-in", signInWithGoogle
  );
  return { ...api, el, calls };
}

test("the logo opens the homepage and sign-in restores an active account", async () => {
  const ui = navigationHarness();
  await ui.openHomepage();
  assert.deepEqual(ui.calls, ["flush", "homepage"]);
  assert.equal(ui.el.workspace.hidden, true);
  assert.equal(ui.el.authScreen.hidden, false);
  assert.equal(ui.el.accountBar.hidden, false);
  await ui.returnToAccount();
  assert.equal(ui.el.workspace.hidden, false);
  assert.equal(ui.el.accountBar.hidden, false);
  assert.equal(ui.calls.at(-1), "draw");
});

test("homepage navigation stops if pending changes cannot be saved", async () => {
  const ui = navigationHarness({ saveError: new Error("Save failed") });
  await assert.rejects(ui.openHomepage(), /Save failed/);
  assert.equal(ui.el.workspace.hidden, false);
  assert.equal(ui.el.authScreen.hidden, true);
});

test("sign-in falls back to options without a session and imports an explicitly saved draft", async () => {
  const expired = navigationHarness({ session: null });
  await expired.openHomepage();
  await expired.returnToAccount();
  assert.deepEqual(expired.calls.at(-1), ["session", null]);
  const session = { user: { id: "user-1" } };
  const ready = navigationHarness({ session, pending: guests });
  await ready.openHomepage();
  await ready.returnToAccount();
  assert.deepEqual(ready.calls.at(-1), ["session", session, true]);
});

test("header sign-in starts Google only when this browser remembers a Google account", async () => {
  const google = navigationHarness({ session: null, rememberedGoogle: true });
  await google.openHomepage();
  await google.returnToAccount(true);
  assert.equal(google.calls.at(-1), "google");

  const firstVisit = navigationHarness({ session: null });
  await firstVisit.openHomepage();
  await firstVisit.returnToAccount(true);
  assert.deepEqual(firstVisit.calls.at(-1), ["session", null]);

  const menu = navigationHarness({ session: null, rememberedGoogle: true });
  await menu.openHomepage();
  await menu.returnToAccount();
  assert.deepEqual(menu.calls.at(-1), ["session", null]);
});

test("Google sign-in errors reach the caller", async () => {
  const ui = navigationHarness({ session: null, rememberedGoogle: true, googleError: new Error("Google unavailable") });
  await assert.rejects(ui.returnToAccount(true), /Google unavailable/);
});

const rememberStart = html.indexOf("      function rememberGoogleSignIn(");
const rememberEnd = html.indexOf("      async function signInWithGoogle(", rememberStart);
assert.ok(rememberStart >= 0 && rememberEnd > rememberStart, "Google preference helper is present");
const rememberGoogleSignIn = new Function("localStorage", "GOOGLE_SIGN_IN_KEY", "console", "showNotice", "el",
  html.slice(rememberStart, rememberEnd) + "\nreturn rememberGoogleSignIn;");

test("only a successful account with Google linked records the preference", () => {
  const writes = [];
  const remember = rememberGoogleSignIn({ setItem: (...args) => writes.push(args) },
    "google-sign-in", console, () => {}, {});
  remember({ app_metadata: { provider: "email", providers: ["email"] } });
  assert.equal(writes.length, 0);
  remember({ app_metadata: { provider: "google" } });
  remember({ identities: [{ provider: "google" }] });
  assert.deepEqual(writes, [["google-sign-in", "1"], ["google-sign-in", "1"]]);
});
