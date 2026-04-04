import pdfParse from "pdf-parse";
import { createWorker } from "tesseract.js";

async function recognizeWithTesseract(input: Buffer): Promise<string> {
  const worker = await createWorker("eng");

  try {
    const {
      data: { text },
    } = await worker.recognize(input);
    return text.trim();
  } finally {
    await worker.terminate();
  }
}

export async function extractTextFromFile(
  fileBuffer: Buffer,
  mimeType: string
): Promise<string> {
  if (mimeType === "application/pdf") {
    try {
      const pdfOcrText = await recognizeWithTesseract(fileBuffer);
      if (pdfOcrText) {
        return pdfOcrText;
      }
    } catch (error) {
      console.warn("PDF OCR with Tesseract failed, falling back to PDF text parse", error);
    }

    try {
      const parsed = await pdfParse(fileBuffer);
      return parsed.text?.trim() ?? "";
    } catch (error) {
      console.error("PDF text parsing failed", error);
      return "";
    }
  }

  return recognizeWithTesseract(fileBuffer);
}
