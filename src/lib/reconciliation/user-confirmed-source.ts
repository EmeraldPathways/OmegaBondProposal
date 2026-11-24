import {pdfFilenameFundKey,workbookNameKey} from "./workbook-source";
import type {FactSheetData} from "./engine";

/** Explicitly accepted fund↔PDF associations. This is not issuer verification. */
const acceptedZurichFiles=new Set([
  "Zurich Global Select Growth.pdf",
  "Zurich Indexed Emerging Mkts Equity.pdf",
]);

export type ConfirmedSourceAssociation={
  basis:"user_confirmed_exact_filename";
  fundName:string;
  fundProvider:"Zurich";
  sourceFilename:string;
  detectedProvider:string|null;
  confirmedOn:"2026-11-24";
};

export function isUserConfirmedSource(
  fundName:string,provider:string,filename:string
):boolean{
  return provider==="Zurich"&&acceptedZurichFiles.has(filename)&&
    pdfFilenameFundKey(filename)===workbookNameKey(fundName);
}

export function createUserConfirmedSource(
  fundName:string,provider:string,filename:string,detectedProvider:string|null
):ConfirmedSourceAssociation|null{
  if(!isUserConfirmedSource(fundName,provider,filename))return null;
  return {basis:"user_confirmed_exact_filename",fundName,
    fundProvider:"Zurich",sourceFilename:filename,
    detectedProvider,confirmedOn:"2026-11-24"};
}

export function hasUserConfirmedSource(
  doc:FactSheetData|null,fundName:string,provider:string,filename:string
):boolean{
  const approval=doc?.confirmedSourceAssociation;
  return isUserConfirmedSource(fundName,provider,filename)&&
    approval?.basis==="user_confirmed_exact_filename"&&
    approval.fundName===fundName&&
    approval.fundProvider===provider&&
    approval.sourceFilename===filename;
}
