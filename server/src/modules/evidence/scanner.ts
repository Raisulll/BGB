// §20 "virus scan hook". Every upload passes through scanUpload() before it is stored.
// No scanner is configured yet: this hook is where a ClamAV (clamd INSTREAM) or vendor AV
// call belongs once BGB names the product. Until then it reports "not scanned" explicitly,
// and that status is saved with the evidence metadata so it is visible, not silently assumed clean.
export interface ScanResult {
  status: 'clean' | 'infected' | 'not_scanned';
  engine?: string;
  signature?: string;
}

export async function scanUpload(_data: Buffer, _fileName: string): Promise<ScanResult> {
  return { status: 'not_scanned' };
}
