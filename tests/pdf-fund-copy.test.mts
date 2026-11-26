import test from "node:test";
import assert from "node:assert/strict";
import {
  fundCardNarrative,completeSourceSentences,wholeMetadataItems,wordCount,
  originalFactsheetParagraph
} from "../src/lib/pdf/fund-detail-layout.ts";

test("keeps complete source sentences without adding trailing ellipses",()=>{
  const text="This fund seeks long-term capital growth. It mainly invests in equities. "+
    "It may also invest in a broad range of other assets depending on market conditions.";
  assert.equal(completeSourceSentences(text,12),
    "This fund seeks long-term capital growth. It mainly invests in equities.");
  assert.equal(completeSourceSentences(text,6),
    "This fund seeks long-term capital growth.");
});

test("rejects dangling extraction fragments or overly long unfinished paragraphs",()=>{
  assert.equal(completeSourceSentences(
    "of Investing At New Ireland we classify our wide range of funds...",20),"");
  assert.equal(completeSourceSentences(
    "The fund pursues returns by investing in",20),"");
  assert.equal(completeSourceSentences(
    Array.from({length:80},()=>"investments").join(" "),58),"");
});

test("renders readable short source phrases without adding fund claims",()=>{
  assert.equal(completeSourceSentences("To pursue long-term capital growth",12),
    "To pursue long-term capital growth.");
  assert.equal(completeSourceSentences("Global equities and bonds",10),
    "Global equities and bonds.");
});

test("retains risk information when it fits, rejects incomplete boilerplate",()=>{
  const narrative=fundCardNarrative({
    objective:"The fund seeks growth through a diversified portfolio.",
    strategy:"It invests across bonds and equities.",
    riskFactors:["Currency Risk","Liquidity Risk"],
    riskDisclosure:"Investors may lose some or all of their capital.",
    chargesDisclosure:"Annual charges reduce returns."
  });
  assert.equal(narrative.find(x=>x.label==="Risk information")?.text,
    "Investors may lose some or all of their capital.");
  assert.equal(narrative.find(x=>x.label==="Key risks")?.text,
    "Currency Risk; Liquidity Risk");
  assert.ok(narrative.every(x=>!x.text.includes("…")));
  const broken=fundCardNarrative({
    objective:"The fund seeks growth through a diversified portfolio.",
    riskDisclosure:"of Investing At New Ireland we classify our wide range of funds"
  });
  assert.ok(!broken.some(x=>x.label==="Risk information"));
});

test("never cuts a fund manager name or classification in the metadata row",()=>{
  const entries=[
    "Risk profile: Medium to High Risk",
    "Managed by: Example International Investment Management",
    "Investment style: Active",
    "Asset mix: Equity and fixed income",
    "Currency: EUR"
  ];
  const result=wholeMetadataItems(entries,11);
  assert.equal(result,"Risk profile: Medium to High Risk · Investment style: Active · Currency: EUR");
  assert.ok(!result.includes("Example International"));
  assert.equal(wholeMetadataItems(entries,40),entries.join(" · "));
});

test("limits the entire fund-detail narrative without a partial final section",()=>{
  const narrative=fundCardNarrative({
    objective:"The fund seeks long-term capital growth through a globally diversified portfolio of assets.",
    strategy:"The manager invests across markets using a long-term allocation strategy.",
    riskFactors:["Currency movements","Liquidity restrictions","Market volatility"],
    riskDisclosure:"The value of an investment can fall as well as rise.",
    chargesDisclosure:"Charges are deducted and will reduce returns."
  });
  const allWords=narrative.reduce((sum,entry)=>sum+wordCount(entry.text),0);
  assert.ok(allWords<=85);
  for(const entry of narrative){
    if(entry.label==="Key risks")continue;
    assert.ok(/[.!?]$/.test(entry.text),entry.label+" must end at a sentence boundary");
  }
});


test("single paragraph preserves original complete factsheet sentences beyond former 58-word limit",()=>{
  const text=Array.from({length:18},(_,i)=>
    "The fund statement "+(i+1)+" is a complete investment sentence.").join(" ");
  const result=originalFactsheetParagraph({objective:text,
    description:"Different secondary description."});
  assert.equal(result,text);
  assert.ok(result.includes("statement 18 is a complete investment sentence."));
  assert.ok(!result.includes("secondary description"));
  assert.ok(!result.includes("…"));
});

test("incomplete source endings are excluded without invented investment claims",()=>{
  const source="The SuperCAPP Fund seeks regular returns. "+
    "It invests in equities, bonds and cash. The fund is managed prudently an";
  assert.equal(originalFactsheetParagraph({objective:source}),
    "The SuperCAPP Fund seeks regular returns. It invests in equities, bonds and cash.");
});

test("filters common OCR layout artefacts while preserving intact source sentences",()=>{
  const intro="The fund aims to generate long term capital growth.";
  assert.equal(originalFactsheetParagraph({objective:
    "The fund invests in European veer ow ENENENEIENCIR region only. "+intro+" High Risk Ata Glance"}),
    intro);
  assert.equal(originalFactsheetParagraph({objective:
    "The fund invests worldwide. The fund is managed by Zurich Life. Zurich Global Fund Zurich Global Fund"}),
    "The fund invests worldwide. The fund is managed by Zurich Life.");
  assert.equal(originalFactsheetParagraph({objective:
    "Risk Profile The fund invests in equities and bonds."}),
    "The fund invests in equities and bonds.");
});

test("a complete factsheet phrase without source punctuation remains readable",()=>{
  const bullet="• The Fund aims to grow your investment over the long term through a combination of income and capital growth";
  assert.equal(originalFactsheetParagraph({objective:bullet}),
    "The Fund aims to grow your investment over the long term through a combination of income and capital growth.");
});

test("a missing or unusable objective falls back to original description",()=>{
  assert.equal(originalFactsheetParagraph({objective:"ENENENEIENCIR v= von",description:
    "The fund invests in a diversified range of assets."}),
    "The fund invests in a diversified range of assets.");
  assert.equal(originalFactsheetParagraph({objective:null,description:null}),"");
});
