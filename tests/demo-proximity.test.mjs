import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const start = html.indexOf("      function findProximity(");
const end = html.indexOf("      function setupProximityMenu(", start);
assert.ok(start >= 0 && end > start, "shared proximity helpers are present");
const { findProximity, setProximityLabel } = new Function(
  html.slice(start, end) + "\nreturn { findProximity, setProximityLabel };"
)();

test("closest and furthest use both graph axes and skip hidden people", () => {
  const people = [
    { name: "near", x: 2, y: 1 },
    { name: "hidden", x: 20, y: 20, hidden: true },
    { name: "far", x: 4, y: 3 }
  ];
  const point = person => person.hidden ? null : person;
  assert.equal(findProximity(people, { x: 0, y: 0 }, "closest", point).name, "near");
  assert.equal(findProximity(people, { x: 0, y: 0 }, "furthest", point).name, "far");
  assert.equal(findProximity(people, { x: 0, y: 0 }, null, point), null);
  assert.equal(findProximity(people, { x: 0, y: 0 }, "closest", () => null), null);
});

test("proximity label reflects the active mode and empty results", () => {
  const attributes = {};
  const toggle = {
    firstElementChild: { textContent: "" },
    getAttribute: name => attributes[name],
    setAttribute: (name, value) => { attributes[name] = value; }
  };
  setProximityLabel(toggle, "furthest", "Alex");
  assert.equal(toggle.firstElementChild.textContent, "Furthest: Alex");
  assert.equal(attributes["aria-label"], "Current furthest: Alex");
  setProximityLabel(toggle, "closest", undefined);
  assert.equal(toggle.firstElementChild.textContent, "No visible people");
  setProximityLabel(toggle, null, undefined);
  assert.equal(toggle.firstElementChild.textContent, "Proximity");
});
