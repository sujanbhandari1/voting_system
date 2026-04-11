const fs = require("fs");
const path = require("path");

const PDFDocument = require("pdfkit");

const ROOT = path.join(__dirname, "..");
const INPUT_MD = path.join(ROOT, "docs", "Viva_QA.md");
const OUTPUT_PDF = path.join(ROOT, "docs", "Viva_QA.pdf");

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
}

function isHeading(line) {
  const trimmed = line.trimStart();
  return trimmed.startsWith("# ");
}

function isHeading2(line) {
  const trimmed = line.trimStart();
  return trimmed.startsWith("## ");
}

function isHr(line) {
  return line.trim() === "---";
}

function stripMarkdown(value) {
  return String(value || "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\s+$/g, "");
}

function isQuestionStart(line) {
  return /^\s*\d+\)\s*\*\*Q:/.test(line);
}

function isAnswerStart(line) {
  return /^\s*\*\*A:\*\*/.test(line);
}

function createDoc() {
  return new PDFDocument({
    size: "A4",
    margins: {
      top: 56,
      bottom: 56,
      left: 56,
      right: 56
    },
    info: {
      Title: "Viva Questions & Answers",
      Author: "Blockchain Voting System",
      Subject: "Viva preparation Q&A"
    }
  });
}

function ensureSpace(doc, heightNeeded) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + heightNeeded > bottom) {
    doc.addPage();
  }
}

function writeHeading(doc, text, level) {
  const clean = stripMarkdown(text).replace(/^#+\s*/, "");
  const sizes = { 1: 20, 2: 15 };
  const size = sizes[level] || 12;
  doc.font("Helvetica-Bold").fontSize(size);
  const h = doc.heightOfString(clean, { width: doc.page.width - doc.page.margins.left - doc.page.margins.right });
  ensureSpace(doc, h + 8);
  doc.text(clean, { align: "left" });
  doc.moveDown(0.35);
}

function writeParagraph(doc, text, opts = {}) {
  const clean = stripMarkdown(text);
  if (!clean.trim()) {
    doc.moveDown(0.35);
    return;
  }

  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right - (opts.indent || 0);
  doc.font(opts.bold ? "Helvetica-Bold" : "Helvetica").fontSize(opts.size || 11);
  const h = doc.heightOfString(clean, { width });
  ensureSpace(doc, h + 6);
  doc.text(clean, { width, indent: opts.indent || 0 });
  doc.moveDown(0.15);
}

function writeHr(doc) {
  ensureSpace(doc, 12);
  const x1 = doc.page.margins.left;
  const x2 = doc.page.width - doc.page.margins.right;
  const y = doc.y + 4;
  doc
    .save()
    .moveTo(x1, y)
    .lineTo(x2, y)
    .lineWidth(1)
    .strokeColor("#999999")
    .stroke()
    .restore();
  doc.moveDown(0.6);
}

function generate() {
  if (!fs.existsSync(INPUT_MD)) {
    throw new Error(`Missing input file: ${INPUT_MD}`);
  }

  const markdown = readText(INPUT_MD);
  const lines = markdown.split("\n");

  const doc = createDoc();
  fs.mkdirSync(path.dirname(OUTPUT_PDF), { recursive: true });
  doc.pipe(fs.createWriteStream(OUTPUT_PDF));

  // Title page header
  doc.font("Helvetica-Bold").fontSize(22).text("Viva Questions & Answers", { align: "left" });
  doc.moveDown(0.15);
  doc.font("Helvetica").fontSize(12).fillColor("#333333").text("Blockchain Voting System", { align: "left" });
  doc.moveDown(0.6);
  writeHr(doc);
  doc.fillColor("#000000");

  let buffer = [];
  const flushBuffer = () => {
    if (!buffer.length) return;
    const combined = buffer.join(" ").replace(/\s+/g, " ").trim();
    writeParagraph(doc, combined);
    buffer = [];
  };

  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx];

    if (isHr(line)) {
      flushBuffer();
      writeHr(doc);
      continue;
    }

    if (isHeading(line)) {
      flushBuffer();
      writeHeading(doc, line, 1);
      continue;
    }

    if (isHeading2(line)) {
      flushBuffer();
      writeHeading(doc, line, 2);
      continue;
    }

    if (isQuestionStart(line)) {
      flushBuffer();
      writeParagraph(doc, line, { bold: true, size: 11 });
      continue;
    }

    if (isAnswerStart(line)) {
      flushBuffer();
      writeParagraph(doc, line, { indent: 18, size: 11 });
      doc.moveDown(0.25);
      continue;
    }

    if (line.trim() === "") {
      flushBuffer();
      doc.moveDown(0.15);
      continue;
    }

    // Accumulate normal text to keep wrapping nicer.
    buffer.push(line.trim());
  }

  flushBuffer();
  doc.end();
  return OUTPUT_PDF;
}

try {
  const out = generate();
  console.log(`Generated: ${out}`);
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}

