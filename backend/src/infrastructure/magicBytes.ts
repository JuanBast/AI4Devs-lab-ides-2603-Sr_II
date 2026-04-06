// Magic byte signatures for allowed file types
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF
const DOCX_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // PK (ZIP-based format)

export type AllowedMimeType =
  | 'application/pdf'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function detectFileType(buffer: Buffer): AllowedMimeType | null {
  if (buffer.length < 4) return null;
  const header = buffer.subarray(0, 4);
  if (header.equals(PDF_MAGIC)) return 'application/pdf';
  if (header.equals(DOCX_MAGIC)) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  return null;
}

export function validateMagicBytes(buffer: Buffer, declaredMimeType: string): boolean {
  const detected = detectFileType(buffer);
  if (!detected) return false;
  return detected === declaredMimeType;
}
