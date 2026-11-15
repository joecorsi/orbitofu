import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../proximity.js", import.meta.url), "utf8");
const window = {};
new Function("window", "document", source)(window, {});
const { findProximity, setProximityLabel, drawProximityLine, drawProximityCanvas, hitProximityLine } = window.thePearProximity;

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

test("symmetry finds the closest reflection on the opposite side of the selected axis", () => {
  const people = [
    { name: "same side", x: 0.79, y: 0.25 },
    { name: "vertical", x: 0.21, y: 0.25 },
    { name: "horizontal", x: 0.8, y: 0.76 },
    { name: "hidden", x: 0.2, y: 0.25, hidden: true },
    { name: "on axis", x: 0.5, y: 0.25 }
  ];
  const center = { x: 0.5, y: 0.5 };
  const point = person => person.hidden ? null : person;
  const me = { x: 0.8, y: 0.25 };
  assert.equal(findProximity(people, me, "verticalSymmetry", point, center).name, "vertical");
  assert.equal(findProximity(people, me, "horizontalSymmetry", point, center).name, "horizontal");
  assert.equal(findProximity(people, { x: 0.5, y: 0.25 }, "verticalSymmetry", point, center), null);
  assert.equal(findProximity(people, { x: 0.8, y: 0.5 }, "horizontalSymmetry", point, center), null);
  assert.equal(findProximity([people[0], people[4]], me, "verticalSymmetry", point, center), null);
  assert.equal(findProximity([{ x: 0.8, y: 0.25 }], { x: 0.2, y: 0.25 },
    "verticalSymmetry", point, center).x, 0.8);
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
  setProximityLabel(toggle, "verticalSymmetry", "Alex");
  assert.equal(toggle.firstElementChild.textContent, "Vertical symmetry: Alex");
  assert.equal(attributes["aria-label"], "Current vertical symmetry: Alex");
  setProximityLabel(toggle, "horizontalSymmetry", undefined);
  assert.equal(toggle.firstElementChild.textContent, "No opposite-side match");
  setProximityLabel(toggle, "horizontalSymmetry", undefined, "Me needs an age");
  assert.equal(toggle.firstElementChild.textContent, "Me needs an age");
  setProximityLabel(toggle, "both", "Alex");
  assert.equal(toggle.firstElementChild.textContent, "Proximity");
  assert.equal(attributes["aria-label"], "Proximity");
  setProximityLabel(toggle, null, undefined);
  assert.equal(toggle.firstElementChild.textContent, "Proximity");
});

function drawingContext() {
  const calls = [];
  const context = { calls };
  for (const method of ["save", "restore", "beginPath", "moveTo", "lineTo", "arc", "closePath", "setTransform", "setLineDash", "clearRect"]) {
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

test("closest sweep traces one continuous outline from Me and leaves the completed slot solid", () => {
  const start = drawingContext();
  drawProximityLine(start, { x: 10, y: 20 }, { x: 40, y: 20 }, "closest", 0);
  assert.equal(start.calls.some(call => call[0] === "stroke"), false);
  const halfway = drawingContext();
  drawProximityLine(halfway, { x: 10, y: 20 }, { x: 40, y: 20 }, "closest", 0.5);
  const perimeter = 60 + 20 * Math.PI;
  assert.deepEqual(halfway.calls.find(call => call[0] === "setLineDash"), ["setLineDash", [perimeter / 2, perimeter]]);
  assert.deepEqual(halfway.calls.find(call => call[0] === "moveTo"), ["moveTo", 10, 30]);
  const complete = drawingContext();
  drawProximityLine(complete, { x: 10, y: 20 }, { x: 40, y: 20 }, "closest", 1);
  assert.equal(complete.calls.some(call => call[0] === "setLineDash"), false);
});

test("furthest retains its wavy line and canvas forwards the proximity mode", () => {
  const context = drawingContext();
  drawProximityCanvas({}, context, 100, 100, { x: 0, y: 0 }, [{ to: { x: 20, y: 0 }, mode: "furthest", progress: 1 }]);
  assert.equal(context.calls.some(call => call[0] === "arc"), false);
  assert.ok(context.calls.some(call => call[0] === "lineTo" && Math.abs(call[2]) > 0.1));
  assert.equal(context.calls.find(call => call[0] === "stroke")[1], 1);
  const closest = drawingContext();
  drawProximityCanvas({}, closest, 100, 100, { x: 0, y: 0 }, [{ to: { x: 20, y: 0 }, mode: "closest", progress: 1 }]);
  assert.equal(closest.calls.filter(call => call[0] === "arc").length, 2);
});

test("canvas draws both proximity lines without clearing between them", () => {
  const context = drawingContext();
  drawProximityCanvas({}, context, 100, 100, { x: 0, y: 0 }, [
    { to: { x: 10, y: 0 }, mode: "closest", progress: 1 },
    { to: { x: 20, y: 0 }, mode: "furthest", progress: 1 }
  ]);
  assert.equal(context.calls.filter(call => call[0] === "clearRect").length, 1);
  assert.deepEqual(context.calls.filter(call => call[0] === "stroke").map(call => call[1]), [2, 1]);
});

test("furthest sweep ends on the original wave at the requested progress", () => {
  const context = drawingContext();
  drawProximityLine(context, { x: 0, y: 0 }, { x: 100, y: 0 }, "furthest", 0.275);
  const points = context.calls.filter(call => call[0] === "lineTo");
  const end = points.at(-1);
  assert.ok(Math.abs(end[1] - 27.5) < 1e-10);
  assert.ok(Math.abs(end[2] + 3) < 1e-10);
  assert.ok(points.every(call => call[1] <= 27.5 + 1e-10));
});

test("symmetry uses a doubled wavelength while retaining the sweeping line", () => {
  for (const mode of ["verticalSymmetry", "horizontalSymmetry"]) {
    const context = drawingContext();
    drawProximityLine(context, { x: 0, y: 0 }, { x: 100, y: 0 }, mode, 0.25);
    const points = context.calls.filter(call => call[0] === "lineTo");
    const at15 = points.find(call => call[1] === 15);
    assert.ok(Math.abs(at15[2] + 3) < 1e-10);
    assert.ok(Math.abs(points.at(-1)[1] - 25) < 1e-10);
    assert.ok(Math.abs(points.at(-1)[2] - 3) < 1e-10);
    assert.equal(context.calls.find(call => call[0] === "stroke")[1], 1);
  }
});

test("hover uses the drawn path and highlights it black", () => {
  const context = drawingContext();
  context.isPointInStroke = (x, y) => {
    assert.equal(context.lineWidth, 12);
    assert.deepEqual([x, y], [20, 10]);
    return true;
  };
  assert.equal(hitProximityLine(context, { x: 0, y: 0 }, { x: 40, y: 0 }, "closest", 0.5, { x: 20, y: 10 }), true);
  assert.ok(context.calls.some(call => call[0] === "setLineDash"));
  assert.equal(hitProximityLine(context, { x: 0, y: 0 }, { x: 40, y: 0 }, "closest", 0, { x: 20, y: 10 }), false);
  const highlighted = drawingContext();
  drawProximityLine(highlighted, { x: 0, y: 0 }, { x: 40, y: 0 }, "furthest", 1, true);
  assert.deepEqual(highlighted.calls.find(call => call[0] === "stroke"), ["stroke", 1, "#000"]);
});

test("proximity modes sweep and pulse independently, including cancellation and reduced motion", () => {
  let now = 100;
  let nextId = 0;
  const frames = new Map();
  const motion = { matches: false, addEventListener(_type, listener) { this.change = listener; } };
  const fakeWindow = {
    matchMedia: () => motion, performance: { now: () => now },
    requestAnimationFrame(callback) { const id = ++nextId; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); }
  };
  const document = { addEventListener() {} };
  document.documentElement = { clientWidth: 1000 };
  new Function("window", "document", source)(fakeWindow, document);
  const element = () => ({
    listeners: {}, checked: false,
    addEventListener(type, fn) { this.listeners[type] = fn; },
    setAttribute() {}
  });
  const toggle = element();
  toggle.parentElement = { addEventListener() {} };
  const closest = element();
  const furthest = element();
  const symmetry = element();
  const targets = { closest: "near", furthest: "far" };
  const draws = [];
  const menu = { hidden: true, style: {}, getBoundingClientRect: () => ({ right: 100 }) };
  const control = fakeWindow.thePearProximity.setupProximityMenu(
    toggle, menu, closest, furthest, () => {
      draws.push({
        closest: control.progress("closest"), furthest: control.progress("furthest"),
        near: control.pulseFor("closest", targets.closest), far: control.pulseFor("furthest", targets.furthest)
      });
    }, { verticalSymmetry: symmetry }
  );
  const advance = time => {
    now = time;
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach(callback => callback(time));
  };
  toggle.listeners.click();
  assert.equal(menu.hidden, false);
  assert.equal(draws.length, 1);
  toggle.listeners.click();
  assert.equal(menu.hidden, true);
  const duration = 700 / 1.15;
  closest.checked = true;
  closest.listeners.change();
  advance(100 + duration / 2);
  furthest.checked = true;
  furthest.listeners.change();
  assert.equal(closest.checked, true);
  assert.ok(Math.abs(draws.at(-1).closest - 0.5) < 1e-10);
  assert.equal(draws.at(-1).furthest, 0);
  assert.equal(frames.size, 2);
  advance(100 + duration + 200);
  assert.ok(Math.abs(draws.at(-1).near - 1.5) < 1e-10);
  assert.ok(draws.at(-1).furthest < 1);
  assert.equal(draws.at(-1).far, 1);
  assert.equal(control.pulseFor("closest", "other"), 1);
  closest.checked = false;
  closest.listeners.change();
  assert.equal(draws.at(-1).near, 1);
  assert.equal(frames.size, 1);
  advance(100 + duration / 2 + duration + 200);
  assert.ok(Math.abs(draws.at(-1).far - 1.5) < 1e-10);
  assert.equal(furthest.checked, true);
  motion.matches = true;
  motion.change();
  assert.equal(draws.at(-1).furthest, 1);
  assert.equal(draws.at(-1).far, 1);
  assert.equal(frames.size, 0);
  closest.checked = true;
  closest.listeners.change();
  assert.equal(draws.at(-1).closest, 1);
  assert.equal(frames.size, 0);
  motion.matches = false;
  furthest.checked = false;
  furthest.listeners.change();
  targets.furthest = null;
  furthest.checked = true;
  furthest.listeners.change();
  advance(now + duration + 1);
  targets.furthest = "far";
  advance(now + 100);
  assert.equal(draws.at(-1).far, 1);
  symmetry.checked = true;
  symmetry.listeners.change();
  assert.equal(control.progress("verticalSymmetry"), 0);
  advance(now + duration + 200);
  assert.equal(control.progress("verticalSymmetry"), 1);
  assert.ok(Math.abs(control.pulseFor("verticalSymmetry", "mirror") - 1.5) < 1e-10);
});
