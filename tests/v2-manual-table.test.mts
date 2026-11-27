import test from "node:test";
import assert from "node:assert/strict";
import {
  parseManualDate,parseEuroAmount,parseValuationTable,parseValuationMatrix,parseCashFlowTable
} from "../src/lib/v2-manual-table";
const funds=[{id:"f1",name:"Example Multi-Asset Fund",initialAmount:5000},{id:"f2",name:"Example Balanced Fund",initialAmount:5000}];
test("Irish source-date formats and Excel serials parse correctly",()=>{
  assert.equal(parseManualDate("26/11/2026"),"2026-11-26");
  assert.equal(parseManualDate("Value @ 26/11/2026"),"2026-11-26");
  assert.equal(parseManualDate("44043"),"2020-07-31");
  assert.equal(parseManualDate("11/26/2026"),null);
  assert.equal(parseManualDate("29/02/2025"),null);
});
test("Irish euro values preserve cents but reject ambiguous separators",()=>{
  assert.equal(parseEuroAmount("€1,234.56"),1234.56);
  assert.equal(parseEuroAmount("12,345"),12345);
  assert.equal(parseEuroAmount("12,34"),null);
  assert.equal(parseEuroAmount(""),null);
});
test("pasted dated valuations resolve actual named holdings",()=>{
  const text="Date\tHolding\tMarket value\n26/11/2026\tExample Multi-Asset Fund\t1,250.25\n26/11/2026\tExample Balanced Fund\t1,475.50";
  const parsed=parseValuationTable(text,funds);
  assert.deepEqual(parsed.errors,[]);
  assert.equal(parsed.rows.length,2);
  assert.equal(parsed.rows[0].fundId,"f1");
  assert.equal(parsed.rows[0].value,1250.25);
});
test("pasted valuation matrix matches example sheet header and preserves blanks",()=>{
  const text="Fund Invested\tValue @ 29/03/2022\tValue @ 26/11/2026\nExample Multi-Asset Fund\t1,000.00\t1,250.25\nExample Balanced Fund\t\t1,475.50";
  const parsed=parseValuationMatrix(text,funds);
  assert.deepEqual(parsed.errors,[]);
  assert.equal(parsed.rows.length,3);
  assert.equal(parsed.rows.filter(r=>r.fundId==="f2").length,1);
});
test("matrix refuses unknown fund rather than mixing another policy's values",()=>{
  const parsed=parseValuationMatrix("Fund\tValue @ 26/11/2026\nUnexpected Fund\t100.00",funds);
  assert.equal(parsed.rows.length,0);
  assert.equal(parsed.errors.length,1);
});
test("duplicate dates for same fund are blocked",()=>{
  const parsed=parseValuationTable("2026-11-26\tExample Balanced Fund\t10\n2026-11-26\tExample Balanced Fund\t20",funds);
  assert.ok(parsed.errors.some(e=>e.includes("Duplicate")));
});
test("cashflow paste captures direction, policy allocation and cents",()=>{
  const text="Date\tType\tHolding\tAmount\tNotes\n01/01/2025\tContribution\tPolicy\t100.00\tMonthly\n26/11/2026\tWithdrawal\tExample Balanced Fund\t50.25\tDrawdown";
  const parsed=parseCashFlowTable(text,funds);
  assert.deepEqual(parsed.errors,[]);
  assert.equal(parsed.rows.length,2);
  assert.equal(parsed.rows[0].fundId,null);
  assert.equal(parsed.rows[1].kind,"withdrawal");
  assert.equal(parsed.rows[1].fundId,"f2");
  assert.equal(parsed.rows[1].amount,50.25);
});
test("cashflow import rejects invalid cashflows instead of guessing type",()=>{
  const parsed=parseCashFlowTable("26/11/2026\tTransfer\tPolicy\t500",funds);
  assert.equal(parsed.rows.length,0);
  assert.equal(parsed.errors.length,1);
});