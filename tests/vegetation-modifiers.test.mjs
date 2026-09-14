import test from "node:test";
import assert from "node:assert/strict";
import { runModifierBench } from "./helpers/modifier-bench.mjs";

test("modifier ranges agree with independent geometry measurements", () => {
  const result=runModifierBench();
  assert.equal(result.failures,0,result.groups.flatMap(g=>g.failures.map(f=>`${g.name}: ${f}`)).join("\n"));
});
