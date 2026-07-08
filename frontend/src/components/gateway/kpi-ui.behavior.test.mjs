import assert from "node:assert/strict";
import { activeProviderEmphasis, downProviderEmphasis, successRateEmphasis } from "./kpi-ui.ts";

assert.equal(successRateEmphasis(100), "emerald");
assert.equal(successRateEmphasis(95), "emerald");
assert.equal(successRateEmphasis(94.9), "amber");
assert.equal(successRateEmphasis(80), "amber");
assert.equal(successRateEmphasis(79.9), "rose");

assert.equal(activeProviderEmphasis(), "emerald");
assert.equal(downProviderEmphasis(0), "emerald");
assert.equal(downProviderEmphasis(2), "rose");

console.log("kpi-ui behavior tests passed");
