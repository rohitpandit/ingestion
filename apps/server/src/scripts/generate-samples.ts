import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';

/**
 * Builds the synthetic document set used for demos and manual testing. The
 * data is invented; discrepancies and gaps are planted deliberately so the
 * analysis has something real to find. No customer or banking data is used.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(here, '../../../../samples/generated');

interface Line {
  text: string;
  heading?: boolean;
}

async function writePdf(fileName: string, title: string, lines: Line[]): Promise<void> {
  const doc = new PDFDocument({ size: 'A4', margin: 56 });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  const finished = new Promise<void>((resolve) => doc.on('end', () => resolve()));

  doc.font('Helvetica-Bold').fontSize(16).text(title);
  doc.moveDown(0.8);

  for (const line of lines) {
    if (line.heading) {
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').fontSize(11).text(line.text);
      doc.moveDown(0.2);
      continue;
    }
    doc.font('Helvetica').fontSize(10).text(line.text);
  }

  doc.end();
  await finished;

  await writeFile(path.join(outputDir, fileName), Buffer.concat(chunks));
  console.log(`  wrote ${fileName}`);
}

async function writeText(fileName: string, content: string): Promise<void> {
  await writeFile(path.join(outputDir, fileName), content, 'utf8');
  console.log(`  wrote ${fileName}`);
}

async function main(): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  console.log(`Generating synthetic samples in ${outputDir}`);

  // 1. Loan application form. Spells the company "Northwind Traders Pvt Ltd"
  //    and claims revenue of 4,850,000 for 2025.
  await writePdf('01-loan-application-form.pdf', 'Commercial Loan Application Form', [
    { text: 'Reference Number: APP-2026-00417' },
    { text: 'Application Date: 14/01/2026' },
    { text: 'Applicant Name: Rahul K. Mehta' },
    { text: 'Date of Birth: 08 March 1984' },
    { text: 'Email: rahul.mehta@northwindtraders.example' },
    { text: 'Phone: +91 80 4455 7788' },
    { text: 'Residential Address: 12 Palm Grove, Indiranagar, Bengaluru 560038' },
    { text: 'Business Details', heading: true },
    { text: 'Company Name: Northwind Traders Pvt Ltd' },
    { text: 'Registration Number: CIN-U51909KA2016PTC091233' },
    { text: 'Registered Address: 4th Floor, Orion Park, Whitefield Main Road, Bengaluru 560066' },
    { text: 'Date of Incorporation: 22/07/2016' },
    { text: 'Trade Licence Number: TL-BLR-2016-44821' },
    { text: 'Number of Employees: 48' },
    { text: 'Declared Financials', heading: true },
    { text: 'Annual Revenue 2025: INR 4,850,000' },
    { text: 'Net Profit 2025: INR 612,000' },
    { text: 'Total Assets: INR 7,240,000' },
    { text: 'Facility Requested', heading: true },
    { text: 'Loan Amount: INR 2,500,000' },
    { text: 'Loan Purpose: Working capital for warehouse expansion' },
    // Loan Term is deliberately absent, to exercise the missing-information report.
    { text: 'Interest Rate: 11.25% per annum' },
    { text: 'Collateral: Commercial property at Whitefield, Bengaluru' },
    { text: 'Declaration', heading: true },
    {
      text: 'The applicant shall provide audited financial statements within 30 days of any request by the lender.',
    },
    {
      text: 'The borrower must maintain the trade licence in good standing for the full term of the facility.',
    },
    {
      text: 'The applicant undertakes to notify the lender of any change of registered address within 14 days.',
    },
    { text: 'Signature of Applicant: R. K. Mehta' },
  ]);

  // 2. Financial statement. Revenue disagrees with the application form
  //    (4,610,000 vs 4,850,000) and the address differs by floor.
  await writePdf('02-financial-statement.pdf', 'Audited Financial Statements', [
    { text: 'Company Name: Northwind Traders Private Limited' },
    { text: 'Registration Number: CIN-U51909KA2016PTC091233' },
    { text: 'Registered Address: 6th Floor, Orion Park, Whitefield Main Road, Bengaluru 560066' },
    { text: 'Reporting Period: FY2025' },
    { text: 'Year Ended: 31 March 2025' },
    { text: 'Director: Rahul Kumar Mehta' },
    { text: 'Statement of Profit and Loss', heading: true },
    { text: 'Total Revenue 2025: INR 4,610,000' },
    { text: 'Gross Profit 2025: INR 1,845,000' },
    { text: 'Net Profit 2025: INR 548,500' },
    { text: 'Balance Sheet', heading: true },
    { text: 'Total Assets: INR 7,240,000' },
    { text: 'Total Liabilities: INR 3,118,000' },
    { text: 'Shareholders Equity: INR 4,122,000' },
    { text: 'Comparative Figures', heading: true },
    { text: 'Total Revenue 2024: INR 3,980,000' },
    { text: 'Net Profit 2024: INR 402,000' },
    { text: 'Notes', heading: true },
    {
      text: 'The company must file its annual return no later than 30 September 2026.',
    },
    { text: 'Bank Name: Meridian Commercial Bank' },
    { text: 'Account Number: 7788-4455-0091' },
  ]);

  // 3. Trade licence. Licence number has a transposed digit against the
  //    application form, and the applicant surname is spelled differently.
  await writePdf('03-trade-licence.pdf', 'Municipal Trade Licence', [
    { text: 'Issuing Authority: Bengaluru Municipal Corporation (Synthetic)' },
    { text: 'Licence Number: TL-BLR-2016-44812' },
    { text: 'Licence Type: Wholesale Trading and Distribution' },
    { text: 'Company Name: Northwind Traders Pvt Ltd' },
    { text: 'Registered Address: 4th Floor, Orion Park, Whitefield Main Road, Bengaluru 560066' },
    { text: 'Authorised Signatory: Rahul K. Mehtaa' },
    // No issue date is printed on this licence, which the report should flag.
    { text: 'Valid Until: 04/08/2025' },
    { text: 'Conditions', heading: true },
    {
      text: 'The licence holder shall display this licence at the principal place of business at all times.',
    },
    {
      text: 'The licence holder is required to apply for renewal within 30 days of the expiry date.',
    },
  ]);

  // 4. Peer comparison CSV. Northwind's revenue disagrees with both PDFs,
  //    which exercises entity-scoped alignment across formats.
  await writeText(
    '04-company-financials.csv',
    [
      'company,year,revenue,net profit,total assets,total liabilities,employees',
      'Northwind Traders Pvt Ltd,2025,4610000,548500,7240000,3118000,52',
      'Northwind Traders Pvt Ltd,2024,3980000,402000,6515000,2904000,45',
      'Harbour Logistics LLP,2025,8120000,931000,11480000,5260000,96',
      'Harbour Logistics LLP,2024,7450000,812000,10240000,4980000,91',
      'Cedar Supply Co,2025,2310000,-85000,3120000,2870000,24',
      'Cedar Supply Co,2024,2680000,141000,3340000,2610000,27',
    ].join('\n'),
  );

  // Deliberately broken files, used to demonstrate graceful handling.
  await writeText(
    'invalid-not-really-a-pdf.pdf',
    'This is a plain text file that has been renamed with a .pdf extension.\n',
  );
  await writeText(
    'invalid-corrupt.pdf',
    `%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer truncated here`,
  );
  await writeText('invalid-empty.csv', '');

  console.log('Done.');
}

main().catch((error: unknown) => {
  console.error('Sample generation failed:', error);
  process.exitCode = 1;
});
