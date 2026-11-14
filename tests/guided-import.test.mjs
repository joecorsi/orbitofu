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
