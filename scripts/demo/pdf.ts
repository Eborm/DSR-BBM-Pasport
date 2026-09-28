/**
 * Minimale PDF-generator voor de demodocumenten: één A4-pagina met een titel en
 * regels tekst. Genoeg om in elke browser te openen; geen afhankelijkheden.
 */

const escape = (text: string) => text.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");

export function pdf(title: string, lines: string[]): Uint8Array {
  const content = [
    "BT",
    "/F2 18 Tf 56 780 Td",
    `(${escape(title)}) Tj`,
    "/F1 11 Tf 16 TL 0 -12 Td",
    ...lines.map((line) => `T* (${escape(line)}) Tj`),
    "ET",
  ].join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R " +
      "/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  ];

  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xref = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  return new Uint8Array(Buffer.from(body, "latin1"));
}
