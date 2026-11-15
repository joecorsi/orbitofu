import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../proximity.js", import.meta.url), "utf8");
const window = {};
new Function("window", "document", source)(window, {});
const { findProximity, setProximityLabel, drawProximityLine, drawProximityCanvas } = window.thePearProximity;

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

function drawingContext() {
  const calls = [];
  const context = { calls };
  for (const method of ["save", "restore", "beginPath", "moveTo", "lineTo", "arc", "closePath", "setTransform", "clearRect"]) {
    context[method] = (...args) => calls.push([method, ...args]);
  }
  context.stroke = () => calls.push(["stroke", context.lineWidth, context.strokeStyle]);
  return context;
}

test("closest slot has ten-pixel radius ends centered on the dots and a two-pixel outline", () => {
  const context = drawingContext();
  drawProximityLine(context, { x: 10, y: 20 }, { x: 40, y: 20 }, "closest");
  assert.deepEqual(context.calls.filter(call => call[0] === "moveTo" || call[0] === "lineTo"), [
    ["moveTo", 10, 30], ["lineTo", 40, 30], ["lineTo", 10, 10]
  ]);
  assert.deepEqual(context.calls.filter(call => call[0] === "arc"), [
    ["arc", 40, 20, 10, Math.PI / 2, -Math.PI / 2, true],
    ["arc", 10, 20, 10, -Math.PI / 2, Math.PI / 2, true]
  ]);
  assert.deepEqual(context.calls.find(call => call[0] === "stroke"), ["stroke", 2, "rgba(0, 0, 0, 0.23)"]);
});

test("closest slot rotates with the dots and handles coincident points", () => {
  const diagonal = drawingContext();
  drawProximityLine(diagonal, { x: 2, y: 3 }, { x: 12, y: 13 }, "closest");
  const start = diagonal.calls.find(call => call[0] === "moveTo");
  assert.ok(Math.abs(start[1] - (2 - Math.SQRT1_2 * 10)) < 1e-10);
  assert.ok(Math.abs(start[2] - (3 + Math.SQRT1_2 * 10)) < 1e-10);
  const coincident = drawingContext();
  drawProximityLine(coincident, { x: 8, y: 9 }, { x: 8, y: 9 }, "closest");
  assert.deepEqual(coincident.calls.filter(call => call[0] === "arc").map(call => call.slice(1, 4)), [[8, 9, 10], [8, 9, 10]]);
});

test("furthest retains its wavy line and canvas forwards the proximity mode", () => {
  const context = drawingContext();
  drawProximityCanvas({}, context, 100, 100, { x: 0, y: 0 }, { x: 20, y: 0 }, "furthest");
  assert.equal(context.calls.some(call => call[0] === "arc"), false);
  assert.ok(context.calls.some(call => call[0] === "lineTo" && Math.abs(call[2]) > 0.1));
  assert.equal(context.calls.find(call => call[0] === "stroke")[1], 1);
  const closest = drawingContext();
  drawProximityCanvas({}, closest, 100, 100, { x: 0, y: 0 }, { x: 20, y: 0 }, "closest");
  assert.equal(closest.calls.filter(call => call[0] === "arc").length, 2);
});
