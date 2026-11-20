import ExcelJS from "exceljs";
import type {FactSheetData, ReportedReturns} from "@/lib/reconciliation/engine";

export type StoredPdfRecord = {
  importId: string;
  filename: string;
  uploadedAt: string | null;
  status: string | null;
  errorMessage: string | null;
  data: FactSheetData | null;
};

const periods: {key: keyof ReportedReturns; label: string}[] = [
  {key:"ytd",label:"YTD"},
  {key:"oneMonth",label:"1 month"},
  {key:"threeMonth",label:"3 months"},
  {key:"sixMonth",label:"6 months"},
  {key:"oneYear",label:"1 year"},
  {key:"threeYear",label:"3 years"},
  {key:"fiveYear",label:"5 years"},
  {key:"tenYear",label:"10 years"},
  {key:"sinceLaunch",label:"Since launch"}
];
type Column = {header:string; key:string; width:number; percent?:boolean};

const cleanText=(s:unknown):string=>{
  const value=String(s??"").replace(/[\u0000-\u001F\u007F]/g," ").trim();
  // Never let source-controlled content become a formula on opening the Excel file.
  return /^[=+@-]/.test(value)?"'"+value:value;
};
const pct=(n:number|null|undefined):number|string=>
  typeof n==="number"&&Number.isFinite(n)?n:"N/A";
const textOrNA=(value:unknown)=>value==null||String(value).trim()===""?"N/A":cleanText(value);
const details=(parts:{name:string;percentage:number}[]|null|undefined)=>
  !parts?.length?"N/A":parts.map(x=>cleanText(x.name)+" ("+x.percentage+"%)").join("; ");

function prepareSheet(sheet:ExcelJS.Worksheet,cols:Column[]){
  sheet.columns=cols.map(c=>({header:c.header,key:c.key,width:c.width}));
  sheet.views=[{state:"frozen",ySplit:1}];
  sheet.autoFilter={from:{row:1,column:1},to:{row:1,column:cols.length}};
  const header=sheet.getRow(1);
  header.height=34;
  header.font={name:"Aptos",size:10,bold:true,color:{argb:"FFFFFFFF"}};
  header.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF193A55"}};
  header.alignment={vertical:"middle",wrapText:true};
  header.eachCell(cell=>cell.border={bottom:{style:"medium",color:{argb:"FF18A999"}}});
  for(const col of cols){
    if(col.percent)sheet.getColumn(col.key).numFmt='0.00"%"';
  }
}
function finishSheet(sheet:ExcelJS.Worksheet){
  sheet.eachRow((row,index)=>{
    if(index===1)return;
    row.height=20;
    row.font={name:"Aptos",size:10,color:{argb:"FF172B3D"}};
    row.alignment={vertical:"middle"};
    if(index%2===0)row.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFF1F6F9"}};
  });
  sheet.pageSetup={orientation:"landscape",fitToPage:true,fitToWidth:1,fitToHeight:0};
  sheet.headerFooter.oddFooter="Omega Financial Management · Official source PDFs · &P / &N";
}

export function createPdfPerformanceWorkbook(records:StoredPdfRecord[],appOrigin:string):ExcelJS.Workbook{
  const workbook=new ExcelJS.Workbook();
  workbook.creator="Omega Financial Management";
  workbook.subject="Performance extracted from official PDF fund factsheets";
  workbook.description="PDF originals are in private Vercel Blob. Blank or missing numbers are N/A, never estimated.";
  workbook.created=new Date();
  const performance=workbook.addWorksheet("Performance Tables");
  const funds=workbook.addWorksheet("Funds List");

  // Include every calendar year actually published by an uploaded PDF.
  // A baseline of recent years keeps the export consistent even with no annual values.
  const calendarYears=new Set(["2025","2024","2023","2022","2021"]);
  for(const record of records)
    for(const year of Object.keys(record.data?.performance?.calendarYearReturns??{}))
      if(/^20\d{2}$/.test(year))calendarYears.add(year);
  const years=[...calendarYears].sort((a,b)=>Number(b)-Number(a));

  const performanceCols:Column[]=[
    {header:"Provider",key:"provider",width:18},
    {header:"Fund name printed in PDF",key:"title",width:42},
    {header:"Title printed in performance table",key:"performanceTitle",width:42},
    {header:"Original PDF filename",key:"filename",width:42},
    {header:"Performance reporting date",key:"performanceDate",width:23},
    {header:"Reporting date precision",key:"datePrecision",width:20},
    {header:"AMC / fee treatment",key:"feeBasis",width:26},
    {header:"Performance extraction status",key:"performanceStatus",width:24},
    ...periods.map(p=>({header:p.label+" return (%)",key:"r_"+p.key,width:19,percent:true})),
    ...periods.map(p=>({header:p.label+" return convention",key:"kind_"+p.key,width:23})),
    ...periods.map(p=>({header:p.label+" cumulative return (%)",key:"cum_"+p.key,width:24,percent:true})),
    ...years.map(year=>({header:year+" calendar-year return (%)",key:"cal_"+year,width:22,percent:true})),
    {header:"Performance table heading",key:"heading",width:49},
    {header:"Performance table page (PDF)",key:"page",width:18},
    {header:"Performance extraction notes",key:"notes",width:64},
    {header:"Overall PDF extraction warnings",key:"warnings",width:64},
    {header:"Original PDF link (login required)",key:"link",width:70},
    {header:"Private PDF document ID",key:"id",width:40}
  ];
  const fundCols:Column[]=[
    {header:"Provider",key:"provider",width:18},
    {header:"Fund name printed in PDF",key:"title",width:44},
    {header:"Original PDF filename",key:"filename",width:43},
    {header:"MoneyMate ID",key:"moneyMateId",width:19},
    {header:"Launch date",key:"launchDate",width:17},
    {header:"Factsheet date",key:"factsheetDate",width:20},
    {header:"Base currency",key:"currency",width:17},
    {header:"Annual management charge (%)",key:"amc",width:26,percent:true},
    {header:"CIV charge (%)",key:"civ",width:18,percent:true},
    {header:"Risk rating",key:"risk",width:14},
    {header:"Investment objective (PDF)",key:"objective",width:75},
    {header:"Investment strategy (PDF)",key:"strategy",width:75},
    {header:"Top holdings from PDF",key:"holdings",width:85},
    {header:"Asset allocations from PDF",key:"allocations",width:85},
    {header:"Original chart references (PDF pages)",key:"charts",width:65},
    {header:"Fund name evidence",key:"titleEvidence",width:34},
    {header:"PDF pages",key:"pages",width:15},
    {header:"PDF parsing status",key:"pdfStatus",width:22},
    {header:"Performance table status",key:"performanceStatus",width:23},
    {header:"Performance reporting date",key:"performanceDate",width:24},
    {header:"PDF extraction error",key:"parseError",width:38},
    {header:"PDF extraction warnings",key:"warnings",width:65},
    {header:"Uploaded at (UTC)",key:"uploadedAt",width:25},
    {header:"Original PDF link (login required)",key:"link",width:70},
    {header:"Private PDF document ID",key:"id",width:40}
  ];

  prepareSheet(performance,performanceCols);
  prepareSheet(funds,fundCols);

  for(const record of records){
    const d=record.data;
    const p=d?.performance??null;
    const r=p?.returns;
    const c=p?.cumulativeReturns;
    const link=appOrigin+"/api/fund-uploads/"+encodeURIComponent(record.importId)+"/download?view=1";
    const status=p?.status??(record.errorMessage||record.status==="needs_review"?"needs_review":"not_extracted");
    const notes=p?.notes?.join("; ")??"Performance table has not been extracted; run the PDF import or review the original.";
    const perfRow:Record<string,string|number> = {
      provider:textOrNA(d?.providerHint),
      title:textOrNA(d?.title),
      performanceTitle:textOrNA(p?.titleInReturnTable),
      filename:cleanText(record.filename),
      performanceDate:textOrNA(p?.asOf),
      datePrecision:textOrNA(p?.asOfPrecision),
      feeBasis:textOrNA(p?.feeBasis?.replaceAll("_"," ")),
      performanceStatus:status,
      heading:textOrNA(p?.evidenceHeading),
      page:p?.page??"N/A",
      notes:cleanText(notes),
      warnings:cleanText([...(d?.extractionWarnings??[]),record.errorMessage??"",d?.performanceExtractionError??""].filter(Boolean).join("; "))||"None",
      link,id:record.importId
    };
    for(const period of periods){
      perfRow["r_"+period.key]=pct(r?.[period.key]);
      perfRow["kind_"+period.key]=textOrNA(p?.returnKinds?.[period.key]);
      perfRow["cum_"+period.key]=pct(c?.[period.key]);
    }
    for(const year of years)
      perfRow["cal_"+year]=pct(p?.calendarYearReturns?.[year]);
    performance.addRow(perfRow);

    funds.addRow({
      provider:textOrNA(d?.providerHint),
      title:textOrNA(d?.title),
      filename:cleanText(record.filename),
      moneyMateId:textOrNA(d?.moneyMateId),
      launchDate:textOrNA(d?.launchDate),
      factsheetDate:textOrNA(d?.asOf),
      currency:textOrNA(d?.baseCurrency),
      amc:pct(d?.amcPct),civ:pct(d?.civPct),
      risk:d?.riskRating??"N/A",
      objective:textOrNA(d?.objective),
      strategy:textOrNA(d?.strategy),
      holdings:details(d?.holdings),
      allocations:details(d?.allocations),
      charts:d?.chartReferences?.length?d.chartReferences.map(x=>x.label+" (page "+x.page+")").join("; "):"N/A",
      titleEvidence:textOrNA(d?.titleEvidence),
      pages:d?.pageCount??"N/A",
      pdfStatus:record.status??"not_extracted",
      performanceStatus:status,
      performanceDate:textOrNA(p?.asOf),
      parseError:textOrNA(record.errorMessage),
      warnings:cleanText([...(d?.extractionWarnings??[]),d?.performanceExtractionError??""].filter(Boolean).join("; "))||"None",
      uploadedAt:textOrNA(record.uploadedAt),
      link,id:record.importId
    });
  }
  finishSheet(performance);
  finishSheet(funds);
  return workbook;
}
