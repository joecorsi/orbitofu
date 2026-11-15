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
    values: { other: 92, "lame-cool": 10 } };
  const updated = await new Function("client", "currentUser", "initialMe", "guests",
    helpers + "\nlet mePerson = initialMe;\nreturn saveStarterMe(guests).then(() => mePerson);")(
    client, { id: "user-1" }, initialMe, guests
  );
  assert.deepEqual(updated.values, {
    other: 92, "lame-cool": 67, "benevolent-malevolent": 75
  });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].payload.user_id, "user-1");
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

const navigationStart = html.indexOf("      async function openHomepage(");
const navigationEnd = html.indexOf("      el.homeLink.addEventListener", navigationStart);
assert.ok(navigationStart >= 0 && navigationEnd > navigationStart, "homepage navigation helpers are present");
const navigation = html.slice(navigationStart, navigationEnd);

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
