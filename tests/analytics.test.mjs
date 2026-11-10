import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
test("schema contains immutable price key and proposal table",()=>{
  const s=readFileSync(new URL("../src/lib/schema.sql",import.meta.url),"utf8");
  assert.match(s,/PRIMARY KEY\(price_series_id,price_date\)/);
  assert.match(s,/CREATE TABLE proposals/);
});
