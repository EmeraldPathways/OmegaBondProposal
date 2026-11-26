import test from "node:test";
import assert from "node:assert/strict";
import {renderToBuffer} from "@react-pdf/renderer";
import {getDocumentProxy} from "unpdf";
import WorkbookProposalPDF,{type WorkbookProposalData} from "../src/lib/pdf/workbook-proposal.tsx";

test("A4 PDF can render uploaded-workbook returns and PDF factsheet metadata without price histories",async()=>{
  const data:WorkbookProposalData={
    client:"Sample Client",adviser:"Omega Financial Management",
    objective:"Illustrative portfolio discussion; source verification required.",
    investment:100000,workbookFilename:"Omega Fund FactSheets Performance Nov 2026.xlsx",
    preparedDate:"23 November 2026",
    portfolios:[{id:"a",title:"Portfolio A",description:"Diversified investment selection",
      funds:[{
        id:"test-fund",name:"Aviva Fixed ESG 60 Series 1",provider:"Aviva",
        weight:100,allocatedAmount:100000,
        returns:{ytd:10,oneMonth:1,threeMonth:2,sixMonth:5,
          oneYear:14.56,threeYear:32.75,fiveYear:null,tenYear:null,sinceLaunch:49.2},
        factsheet:{
          filename:"Aviva Fixed ESG 60 Series 1.pdf",
          title:"Aviva Fixed ESG 60 Series 1",
          date:"9 November 2026",moneyMateId:"25007852",baseCurrency:"EUR",
          objective:"To pursue capital growth over the longer term.",
          strategy:"Global equities and bonds in a managed strategic allocation.",
          riskRating:null,amcPct:0.65,civPct:0.01,
          chartPages:["Historical growth chart (page 2)"]
        }
      }]
    }]
  };
  const primary=data.portfolios[0].funds[0];
  primary.weight=33;
  primary.allocatedAmount=33000;
  data.portfolios[0].funds.push(
    {...primary,id:"zurich-fund",provider:"Zurich",name:"Zurich International Equity",
      weight:33,allocatedAmount:33000,
      returns:{...primary.returns,oneYear:10.19,threeYear:36.40}},
    {...primary,id:"standard-fund",provider:"Standard Life",
      name:"Standard Life Vanguard Global Bond Index Fund",
      weight:34,allocatedAmount:34000,
      returns:{...primary.returns,oneYear:-2.05,threeYear:6.09,fiveYear:-9.26}}
  );
  const bytes=await renderToBuffer(WorkbookProposalPDF({data}));
  assert.ok(bytes.byteLength>3000,"PDF must contain a real rendered document");
  assert.equal(Buffer.from(bytes).subarray(0,4).toString("ascii"),"%PDF");
  const serialized=Buffer.from(bytes).toString("latin1");
  const pageCount=(serialized.match(/\/Type\s*\/Page(?!s)\b/g)??[]).length;
  // Fund allocations appear on the cover; the next page contains details.
  assert.equal(pageCount,2,"Three-fund proposal should have no redundant overview page");
  assert.ok(serialized.includes("/Type /Page"));
  const pdfDocument=await getDocumentProxy(new Uint8Array(bytes));
  try{
    assert.equal(pdfDocument.numPages,2);
    const coverPage=await pdfDocument.getPage(1);
    const coverText=await coverPage.getTextContent();
    const cover=coverText.items.map(item=>"str" in item?item.str:"").join(" ");
    for(const heading of [
      "Initial investment","Prepared for","Prepared by",
      "Portfolio options","Selected funds","Objective",
      "Portfolio allocation",
      "Fund allocations and reported cumulative returns","10 YEARS",
      "Aviva Fixed ESG 60 Series 1","Zurich International Equity"
    ])assert.ok(cover.includes(heading),
      "First A4 page must contain "+heading);
    const labelY=(label:string)=>{
      const match=coverText.items.find(item=>"str" in item&&item.str===label);
      assert.ok(match&&"transform" in match,
        "Expected PDF position for "+label);
      return match.transform[5];
    };
    // The cover's metadata moves to a compact two-row layout beside
    // the investment amount rather than a large vertical hero.
    assert.ok(labelY("Initial investment")-labelY("Selected funds")<50,
      "Initial investment panel must be vertically compact");
    const detailsPage=await pdfDocument.getPage(2);
    const extracted=await detailsPage.getTextContent();
    const details=extracted.items.map(item=>"str" in item?item.str:"").join(" ");
    for(const heading of [
      "Fund details","Aviva Fixed ESG 60 Series 1","Zurich International Equity"
    ])assert.ok(details.includes(heading),"Fund-details page must contain "+heading);
    assert.ok(!details.includes("Cumulative fund performance"),
      "There must be no redundant portfolio overview chart page");
  }finally{
    const disposable=pdfDocument as unknown as {destroy?:()=>Promise<void>};
    if(typeof disposable.destroy==="function")await disposable.destroy();
  }

});

test("multi-portfolio PDF has one cover and one detail page per three-fund portfolio",async()=>{
  const details={
    filename:null,title:null,date:null,objective:null,strategy:null,
    moneyMateId:null,baseCurrency:null,riskRating:null,
    amcPct:null,civPct:null,chartPages:[]
  };
  const returns={ytd:10,oneMonth:1,threeMonth:4,sixMonth:6,
    oneYear:12,threeYear:35,fiveYear:60,tenYear:90,sinceLaunch:92};
  const portfolios=Array.from({length:3},(_,i)=>({
    id:"portfolio-"+i,title:"Portfolio "+String.fromCharCode(65+i),
    description:"Diversified allocation",
    funds:Array.from({length:3},(_,j)=>({
      id:"fund-"+i+"-"+j,name:"Fund option "+(j+1)+" for portfolio "+(i+1),
      provider:"Aviva",weight:j===2?34:33,allocatedAmount:(j===2?34:33)*2000,
      returns,factsheet:details
    }))
  }));
  const data:WorkbookProposalData={
    client:"Sample Client",adviser:"Omega Financial Management",
    objective:"Review diversified investment opportunities.",
    investment:200000,workbookFilename:"Current workbook",
    preparedDate:"24 November 2026",portfolios
  };
  const bytes=await renderToBuffer(WorkbookProposalPDF({data}));
  const document=await getDocumentProxy(new Uint8Array(bytes));
  try{
    assert.equal(document.numPages,4,
      "Three portfolios must have one cover and three fund-details pages");
    const coverPage=await document.getPage(1);
    const text=await coverPage.getTextContent();
    const cover=text.items.map(item=>"str" in item?item.str:"").join(" ");
    for(const label of ["Portfolio A","Portfolio B","Portfolio C",
      "Initial investment","Fund allocations and reported cumulative returns"])
      assert.ok(cover.includes(label),"Cover is missing "+label);
  }finally{
    const disposable=document as unknown as {destroy?:()=>Promise<void>};
    if(typeof disposable.destroy==="function")await disposable.destroy();
  }
});

test("New Ireland saved factsheet data appears in the generated client PDF",async()=>{
  const returns={ytd:4,oneMonth:1,threeMonth:2,sixMonth:3,
    oneYear:5,threeYear:15,fiveYear:20,tenYear:null,sinceLaunch:30};
  const data:WorkbookProposalData={
    client:"Sample Client",adviser:"Omega Financial Management",
    objective:"Compare balanced growth funds.",investment:80000,
    workbookFilename:"Omega Fund Performance.xlsx",preparedDate:"24 November 2026",
    portfolios:[{id:"ni",title:"New Ireland option",description:"Balanced approach",
      funds:[{id:"new-ireland-prime",name:"PRIME 5",provider:"New Ireland",
        weight:100,allocatedAmount:80000,returns,
        factsheet:{filename:"New Ireland PRIME 5.pdf",title:"PRIME 5",
          date:"09 November 2026",
          objective:"The PRIME 5 fund seeks long-term capital growth.",
          description:"The PRIME 5 fund seeks long-term capital growth.",
          strategy:null,riskRating:null,riskProfile:"Medium to High Risk",
          managedBy:"State Street Investment Management",
          managementStyle:"Passively managed",assetMix:"Equities and bonds",
          taxStatus:"Gross",sfdrClass:"Article 8",
          riskFactors:["Currency Risk","Liquidity Risk"],
          riskDisclosure:"Investment capital is not guaranteed.",
          chargesDisclosure:"Charges may reduce your investment return.",
          moneyMateId:null,baseCurrency:null,amcPct:null,civPct:null,chartPages:[]}
      }]}]
  };
  const bytes=await renderToBuffer(WorkbookProposalPDF({data}));
  const doc=await getDocumentProxy(new Uint8Array(bytes));
  try{
    const parts:string[]=[];
    for(let i=1;i<=doc.numPages;i++){
      const page=await doc.getPage(i);
      const text=await page.getTextContent();
      parts.push(text.items.map(item=>"str" in item?item.str:"").join(" "));
    }
    const full=parts.join(" ");
    for(const expected of [
      "The PRIME 5 fund seeks long-term capital growth",
      "Medium to High Risk","State Street Investment Management",
      "Passively managed","Equities and bonds","Article 8",
      "Currency Risk","Liquidity Risk",
      "Investment capital is not guaranteed",
      "Charges may reduce your investment return"
    ])assert.ok(full.includes(expected),"New Ireland PDF detail missing: "+expected);
  }finally{
    const disposable=doc as unknown as {destroy?:()=>Promise<void>};
    if(typeof disposable.destroy==="function")await disposable.destroy();
  }
});

test("five funds are laid out as three standardized fund cards then two, without losing page-one returns",async()=>{
  const {fundCardNarrative,FUND_CARD_NARRATIVE_WORDS,paginateFundDetails}=
    await import("../src/lib/pdf/fund-detail-layout.ts");
  const longDescription=Array.from({length:210},(_,i)=>
    "documented"+String(i)).join(" ");
  const abbreviated=fundCardNarrative({
    description:longDescription,
    strategy:"A global portfolio with diversified investment objectives.",
    riskFactors:["Foreign-exchange exposure","Equity volatility"]
  });
  assert.ok(abbreviated.length>0);
  assert.ok(abbreviated[0].text.includes("…"));
  assert.ok(abbreviated.flatMap(f=>f.text.split(/\s+/)).length<=FUND_CARD_NARRATIVE_WORDS);
  const factsheet={
    filename:"Official.pdf",title:"Official Fund",date:"24 November 2026",
    moneyMateId:null,baseCurrency:"EUR",riskRating:3,riskProfile:null,
    objective:null,description:longDescription,
    strategy:"A global investment approach.",managedBy:"Example Fund Manager",
    riskFactors:["Currency risk"],riskDisclosure:null,chargesDisclosure:null,
    amcPct:0.5,civPct:0.1,chartPages:[]
  };
  const returns={ytd:4,oneMonth:2,threeMonth:4,sixMonth:7,
    oneYear:11,threeYear:20,fiveYear:null,tenYear:null,sinceLaunch:30};
  const funds=Array.from({length:5},(_,i)=>({
    id:"fund-"+(i+1),name:"Example Fund "+(i+1),provider:"Zurich",
    weight:20,allocatedAmount:20000,returns,factsheet
  }));
  assert.deepEqual(paginateFundDetails(funds).map(group=>group.length),[3,2]);
  const bytes=await renderToBuffer(WorkbookProposalPDF({data:{
    client:"Test Client",adviser:"Omega Financial Management",
    objective:"Conservative growth",investment:100000,
    workbookFilename:"Current workbook",preparedDate:"24 November 2026",
    portfolios:[{id:"a",title:"Balanced Portfolio",description:"Five-fund selection",funds}]
  }}));
  const doc=await getDocumentProxy(new Uint8Array(bytes));
  try{
    assert.equal(doc.numPages,3,"cover, 3-card details, 2-card details");
    const texts:string[]=[];
    for(let i=1;i<=3;i++){
      const page=await doc.getPage(i);
      const t=await page.getTextContent();
      texts.push(t.items.map(item=>"str" in item?item.str:"").join(" "));
    }
    assert.ok(texts[0].includes("Fund allocations and reported cumulative returns"));
    for(const fund of funds)assert.ok(texts[0].includes(fund.name),
      "Fund must appear in page-one allocations: "+fund.name);
    for(let i=1;i<=3;i++)assert.ok(texts[1].includes("Example Fund "+i),
      "Missing details card for fund "+i);
    for(let i=4;i<=5;i++){
      assert.ok(!texts[1].includes("Example Fund "+i),"Fourth fund spilled onto first detail page");
      assert.ok(texts[2].includes("Example Fund "+i),"Missing next-page card "+i);
    }
    assert.ok(!texts[2].includes("Example Fund 1"));
    assert.ok(!texts[1].includes("documented190"),
      "Fund detail descriptions must not print their unabridged source narrative");
  }finally{
    const disposable=doc as unknown as {destroy?:()=>Promise<void>};
    if(typeof disposable.destroy==="function")await disposable.destroy();
  }
});


test("allocation continuation appears only for funds that cannot fit the cover",async()=>{
  const returns={ytd:10,oneMonth:1,threeMonth:3,sixMonth:6,oneYear:8,
    threeYear:20,fiveYear:32,tenYear:null,sinceLaunch:45};
  const factsheet={filename:null,title:null,date:null,objective:"Long-term growth.",
    description:null,strategy:null,moneyMateId:null,baseCurrency:null,
    riskRating:null,amcPct:null,civPct:null,chartPages:[]};
  const funds=Array.from({length:11},(_,i)=>({
    id:"id-"+i,name:"Overflow Fund "+(i+1),provider:"Zurich",
    weight:i===10?10:9,allocatedAmount:(i===10?10:9)*1000,
    returns,factsheet
  }));
  const bytes=await renderToBuffer(WorkbookProposalPDF({data:{
    client:"Test Client",adviser:"Omega Financial Management",
    objective:"Income and growth",investment:100000,
    workbookFilename:"Current workbook",preparedDate:"24 November 2026",
    portfolios:[{id:"a",title:"Allocation Test",description:"11 funds",funds}]
  }}));
  const doc=await getDocumentProxy(new Uint8Array(bytes));
  try{
    assert.equal(doc.numPages,6,
      "One cover, one allocation continuation and four fund-detail pages");
    const read=async(index:number)=>{
      const text=await (await doc.getPage(index)).getTextContent();
      return text.items.map(item=>"str" in item?item.str:"").join(" ");
    };
    const first=await read(1),second=await read(2);
    for(let n=1;n<=8;n++)assert.ok(first.includes("Overflow Fund "+n));
    for(let n=9;n<=11;n++)assert.ok(second.includes("Overflow Fund "+n));
    assert.ok(second.includes("Remaining fund allocations"));
    assert.ok(!second.includes("Cumulative fund performance"));
  }finally{
    const disposable=doc as unknown as {destroy?:()=>Promise<void>};
    if(typeof disposable.destroy==="function")await disposable.destroy();
  }
});
