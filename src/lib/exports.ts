import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import * as XLSX from "xlsx";
import type { AiDeepDive, PropertyFacts, RentComp, SaleComp, ScenarioResult, UnderwritingInputs } from "../types";

export async function exportPdf(elementId: string, filename = "underwriteai-report.pdf") {
  const el = document.getElementById(elementId);
  if (!el) throw new Error("Report element not found.");
  const canvas = await html2canvas(el, { scale: 2 });
  const imgData = canvas.toDataURL("image/png");

  const pdf = new jsPDF("p", "pt", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let y = 0;
  pdf.addImage(imgData, "PNG", 0, y, imgWidth, imgHeight);
  while (imgHeight + y > pageHeight) {
    y -= pageHeight;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", 0, y, imgWidth, imgHeight);
  }
  pdf.save(filename);
}

function sheetFromKeyValue(obj: Record<string, any>) {
  const rows = Object.entries(obj).map(([k, v]) => ({ key: k, value: v }));
  return XLSX.utils.json_to_sheet(rows);
}

export function exportXlsx(args: {
  filename?: string;
  facts: PropertyFacts;
  inputs: UnderwritingInputs;
  results: ScenarioResult[];
  rentComps: RentComp[];
  saleComps: SaleComp[];
  sensitivity: { rentDeltas: number[]; vacancyDeltas: number[]; grid: { cashFlowMonthly: number; dscr: number }[][] };
  memo?: AiDeepDive | null;
}) {
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, sheetFromKeyValue(args.facts as any), "Property");
  XLSX.utils.book_append_sheet(wb, sheetFromKeyValue(args.inputs as any), "Assumptions");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(args.results as any), "Results");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(args.rentComps as any), "RentalComps");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(args.saleComps as any), "SalesComps");

  const sensRows: any[] = [];
  for (let i = 0; i < args.sensitivity.rentDeltas.length; i++) {
    for (let j = 0; j < args.sensitivity.vacancyDeltas.length; j++) {
      sensRows.push({
        rentDelta: args.sensitivity.rentDeltas[i],
        vacancyDelta: args.sensitivity.vacancyDeltas[j],
        cashFlowMonthly: args.sensitivity.grid[i][j].cashFlowMonthly,
        dscr: args.sensitivity.grid[i][j].dscr,
      });
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sensRows), "Sensitivity");

  if (args.memo) XLSX.utils.book_append_sheet(wb, sheetFromKeyValue(args.memo as any), "Memo");

  XLSX.writeFile(wb, args.filename || "underwriteai-report.xlsx");
}

export function exportCsv(filename: string, rows: Record<string, any>[]) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
