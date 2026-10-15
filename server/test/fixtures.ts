import { crc32, deflateRawSync } from 'node:zlib';
// Small, valid-enough files for upload tests, built in code so no binaries live in the repo.

/** JPEG with an EXIF APP1 segment: Make = "BGBCam", GPS 20°52'N 92°16'E (≈ Teknaf). */
export function jpegWithExif(): Buffer {
  const tiff = Buffer.alloc(148);
  tiff.write('II', 0, 'latin1'); // little-endian
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4); // IFD0 offset

  const entry = (at: number, tag: number, type: number, count: number, value: number) => {
    tiff.writeUInt16LE(tag, at);
    tiff.writeUInt16LE(type, at + 2);
    tiff.writeUInt32LE(count, at + 4);
    tiff.writeUInt32LE(value, at + 8);
  };
  const ASCII = 2, LONG = 4, RATIONAL = 5;

  // IFD0 @8: Make, GPSInfo pointer
  tiff.writeUInt16LE(2, 8);
  entry(10, 0x010f, ASCII, 7, 38); // Make -> "BGBCam\0" @38
  entry(22, 0x8825, LONG, 1, 46); // GPS IFD @46
  tiff.writeUInt32LE(0, 34); // no next IFD
  tiff.write('BGBCam\0', 38, 'latin1');

  // GPS IFD @46: LatRef, Lat, LonRef, Lon
  tiff.writeUInt16LE(4, 46);
  entry(48, 0x0001, ASCII, 2, 0);
  tiff.write('N\0', 56, 'latin1');
  entry(60, 0x0002, RATIONAL, 3, 100);
  entry(72, 0x0003, ASCII, 2, 0);
  tiff.write('E\0', 80, 'latin1');
  entry(84, 0x0004, RATIONAL, 3, 124);
  tiff.writeUInt32LE(0, 96);

  const rationals = (at: number, values: number[]) =>
    values.forEach((v, i) => {
      tiff.writeUInt32LE(v, at + i * 8);
      tiff.writeUInt32LE(1, at + i * 8 + 4);
    });
  rationals(100, [20, 52, 0]);
  rationals(124, [92, 16, 0]);

  const exifHeader = Buffer.from('Exif\0\0', 'latin1');
  const app1Length = Buffer.alloc(2);
  app1Length.writeUInt16BE(2 + exifHeader.length + tiff.length);
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1]), app1Length, exifHeader, tiff, Buffer.from([0xff, 0xd9])]);
}

export const pdf = () => Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n', 'latin1');

export const png = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);

/** An HTML page pretending to be a photo. */
export const htmlDisguisedAsJpeg = () => Buffer.from('<html><script>alert(1)</script></html>', 'utf8');

/** A JPEG-looking file of the given size in MB. */
export const bigJpeg = (mb: number) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(Math.ceil(mb * 1024 * 1024))]);

// A ZIP package built in memory (stored or deflated entries), for Office/OpenDocument uploads
function zip(files: [name: string, content: string, deflate?: boolean][]): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, content, deflate] of files) {
    const raw = Buffer.from(content, 'utf8');
    const data = deflate ? deflateRawSync(raw) : raw;
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(deflate ? 8 : 0, 10);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(raw.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    central.push(cd, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cdBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cdBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cdBuf, end]);
}

const CORE_XML =
  '<?xml version="1.0"?><cp:coreProperties xmlns:cp="x" xmlns:dc="y" xmlns:dcterms="z"><dc:title>Seizure report</dc:title>' +
  '<dc:creator>Capt. Rahim</dc:creator><cp:lastModifiedBy>Lt. Karim</cp:lastModifiedBy>' +
  '<dcterms:created xsi:type="dcterms:W3CDTF">2026-10-01T03:00:00Z</dcterms:created><dcterms:modified>2026-10-02T05:30:00Z</dcterms:modified></cp:coreProperties>';

/** A minimal Word document (.docx) with document properties */
export const docx = () =>
  zip([
    ['[Content_Types].xml', '<Types/>'],
    ['word/document.xml', '<w:document/>', true],
    ['docProps/core.xml', CORE_XML, true],
  ]);
/** The same with a VBA project (.docm): must be refused */
export const docm = () => zip([['[Content_Types].xml', '<Types/>'], ['word/document.xml', '<w:document/>'], ['word/vbaProject.bin', 'VBA']]);
/** An ordinary ZIP archive: not an accepted document */
export const plainZip = () => zip([['notes.txt', 'hello']]);
