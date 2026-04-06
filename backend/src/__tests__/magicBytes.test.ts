import { detectFileType, validateMagicBytes } from '../infrastructure/magicBytes';

describe('detectFileType', () => {
  it('detects PDF from magic bytes', () => {
    const buf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00]);
    expect(detectFileType(buf)).toBe('application/pdf');
  });

  it('detects DOCX from magic bytes', () => {
    const buf = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]);
    expect(detectFileType(buf)).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
  });

  it('returns null for unknown bytes', () => {
    const buf = Buffer.from([0x00, 0x01, 0x02, 0x03]);
    expect(detectFileType(buf)).toBeNull();
  });

  it('returns null for buffer shorter than 4 bytes', () => {
    const buf = Buffer.from([0x25, 0x50]);
    expect(detectFileType(buf)).toBeNull();
  });

  it('returns null for empty buffer', () => {
    const buf = Buffer.alloc(0);
    expect(detectFileType(buf)).toBeNull();
  });
});

describe('validateMagicBytes', () => {
  it('returns true when magic bytes match declared PDF MIME', () => {
    const buf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00]);
    expect(validateMagicBytes(buf, 'application/pdf')).toBe(true);
  });

  it('returns true when magic bytes match declared DOCX MIME', () => {
    const buf = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]);
    expect(
      validateMagicBytes(
        buf,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).toBe(true);
  });

  it('returns false when PDF magic bytes mismatch declared DOCX MIME', () => {
    const buf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00]);
    expect(
      validateMagicBytes(
        buf,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).toBe(false);
  });

  it('returns false when DOCX magic bytes mismatch declared PDF MIME', () => {
    const buf = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]);
    expect(validateMagicBytes(buf, 'application/pdf')).toBe(false);
  });

  it('returns false for unknown buffer regardless of declared MIME', () => {
    const buf = Buffer.from([0x00, 0x00, 0x00, 0x00]);
    expect(validateMagicBytes(buf, 'application/pdf')).toBe(false);
  });

  it('returns false for buffer shorter than 4 bytes', () => {
    const buf = Buffer.from([0x25, 0x50]);
    expect(validateMagicBytes(buf, 'application/pdf')).toBe(false);
  });
});
