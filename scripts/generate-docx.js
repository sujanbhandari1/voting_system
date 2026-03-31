const fs = require("fs");
const path = require("path");
const {
  AlignmentType,
  Document,
  HeadingLevel,
  LineRuleType,
  Packer,
  Paragraph,
  SimpleField,
  Table,
  TableOfContents,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} = require("docx");

const ROOT = path.join(__dirname, "..");
const INPUT_MD = path.join(ROOT, "docs", "Project_Documentation.md");
const OUTPUT_DOCX = path.join(ROOT, "docs", "Project_Documentation.docx");

function splitIntoLines(markdown) {
  return markdown.replace(/\r\n/g, "\n").split("\n");
}

function parseInline(text) {
  const runs = [];
  let i = 0;

  while (i < text.length) {
    const boldStart = text.indexOf("**", i);
    const codeStart = text.indexOf("`", i);

    const next = [boldStart, codeStart].filter((value) => value !== -1).sort((a, b) => a - b)[0];
    if (next === undefined) {
      if (text.slice(i)) {
        runs.push(new TextRun(text.slice(i)));
      }
      break;
    }

    if (next > i) {
      runs.push(new TextRun(text.slice(i, next)));
    }

    if (next === boldStart) {
      const end = text.indexOf("**", boldStart + 2);
      if (end === -1) {
        runs.push(new TextRun(text.slice(boldStart)));
        break;
      }
      const content = text.slice(boldStart + 2, end);
      runs.push(new TextRun({ text: content, bold: true }));
      i = end + 2;
      continue;
    }

    if (next === codeStart) {
      const end = text.indexOf("`", codeStart + 1);
      if (end === -1) {
        runs.push(new TextRun(text.slice(codeStart)));
        break;
      }
      const content = text.slice(codeStart + 1, end);
      runs.push(
        new TextRun({
          text: content,
          font: "Courier New"
        })
      );
      i = end + 1;
      continue;
    }
  }

  return runs.length ? runs : [new TextRun("")];
}

function isTableLine(line) {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.includes("|");
}

function isTableSeparator(line) {
  const trimmed = line.trim();
  if (!isTableLine(trimmed)) {
    return false;
  }
  const cells = trimmed.slice(1, -1).split("|").map((cell) => cell.trim());
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function parseTable(lines, startIndex) {
  const header = lines[startIndex].trim();
  const separator = lines[startIndex + 1]?.trim();
  if (!isTableLine(header) || !isTableSeparator(separator)) {
    return null;
  }

  const rows = [];
  let index = startIndex;
  while (index < lines.length && isTableLine(lines[index])) {
    rows.push(lines[index].trim());
    index += 1;
  }

  const parsed = rows.map((row) =>
    row
      .slice(1, -1)
      .split("|")
      .map((cell) => cell.trim())
  );

  const [headerCells] = parsed;
  const bodyRows = parsed.slice(2);

  return {
    table: { headerCells, bodyRows },
    nextIndex: index
  };
}

function paragraphFromText(text, options = {}) {
  const { heading, bullet, alignment } = options;

  if (heading) {
    return new Paragraph({
      heading,
      children: parseInline(text)
    });
  }

  if (bullet) {
    return new Paragraph({
      bullet: { level: 0 },
      children: parseInline(text)
    });
  }

  return new Paragraph({
    alignment: alignment || AlignmentType.JUSTIFIED,
    children: parseInline(text)
  });
}

function codeBlockParagraphs(codeText) {
  const codeLines = codeText.replace(/\r\n/g, "\n").split("\n");
  const paragraphs = [];

  for (const line of codeLines) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: line,
            font: "Courier New"
          })
        ]
      })
    );
  }

  return paragraphs;
}

function docxTableFromMarkdown(table) {
  const { headerCells, bodyRows } = table;

  const makeCell = (text, isHeader) =>
    new TableCell({
      width: { size: 100 / headerCells.length, type: WidthType.PERCENTAGE },
      children: [
        new Paragraph({
          children: [
            new TextRun({
              text,
              bold: Boolean(isHeader)
            })
          ]
        })
      ]
    });

  const headerRow = new TableRow({
    children: headerCells.map((cell) => makeCell(cell, true))
  });

  const body = bodyRows.map(
    (row) =>
      new TableRow({
        children: headerCells.map((_, index) => makeCell(row[index] || "", false))
      })
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...body]
  });
}

function buildDocFromMarkdown(markdown) {
  const lines = splitIntoLines(markdown);
  const children = [];

  const isFenceStart = (value) => value.trimEnd().startsWith("```");
  const isHr = (value) => value.trim() === "---";
  const isHeading = (value) => {
    const trimmed = value.trimStart();
    return trimmed.startsWith("# ");
  };
  const isHeading2 = (value) => value.trimStart().startsWith("## ");
  const isHeading3 = (value) => value.trimStart().startsWith("### ");
  const isHeading4 = (value) => value.trimStart().startsWith("#### ");
  const isBullet = (value) => value.trimStart().startsWith("- ");

  const isStructuralStart = (value) =>
    isFenceStart(value) ||
    isHr(value) ||
    isHeading(value) ||
    isHeading2(value) ||
    isHeading3(value) ||
    isHeading4(value) ||
    isBullet(value) ||
    isTableLine(value.trim());

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trimEnd();

    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (isFenceStart(line)) {
      const fence = line;
      const fenceLang = fence.slice(3).trim();
      let code = "";
      i += 1;
      while (i < lines.length && !lines[i].trimEnd().startsWith("```")) {
        code += `${lines[i].replace(/\t/g, "    ")}\n`;
        i += 1;
      }
      if (i < lines.length && lines[i].trimEnd().startsWith("```")) {
        i += 1;
      }

      if (fenceLang) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: `Code (${fenceLang})`, bold: true })]
          })
        );
      }

      children.push(...codeBlockParagraphs(code.trimEnd()));
      continue;
    }

    if (isHr(line)) {
      i += 1;
      continue;
    }

    const tableParse = parseTable(lines, i);
    if (tableParse) {
      children.push(docxTableFromMarkdown(tableParse.table));
      children.push(new Paragraph({ text: "" }));
      i = tableParse.nextIndex;
      continue;
    }

    const figureCaptionMatch = line.trim().match(/^Figure:\\s*(.+)$/i);
    if (figureCaptionMatch) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          style: "Caption",
          children: [
            new TextRun("Figure "),
            new SimpleField("SEQ Figure \\* ARABIC"),
            new TextRun(`: ${figureCaptionMatch[1].trim()}`)
          ]
        })
      );
      i += 1;
      continue;
    }

    const tableCaptionMatch = line.trim().match(/^Table:\\s*(.+)$/i);
    if (tableCaptionMatch) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          style: "Caption",
          children: [
            new TextRun("Table "),
            new SimpleField("SEQ Table \\* ARABIC"),
            new TextRun(`: ${tableCaptionMatch[1].trim()}`)
          ]
        })
      );
      i += 1;
      continue;
    }

    if (isHeading(line)) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          heading: HeadingLevel.TITLE,
          children: parseInline(line.slice(2).trim())
        })
      );
      i += 1;
      continue;
    }

    if (isHeading2(line)) {
      const headingText = line.slice(3).trim();
      children.push(paragraphFromText(headingText, { heading: HeadingLevel.HEADING_1 }));

      // Auto fields for Contents / List of Figures / List of Tables.
      if (headingText.toLowerCase() === "contents") {
        children.push(
          new TableOfContents("Contents", {
            hyperlink: true,
            headingStyleRange: "1-2"
          })
        );
      } else if (headingText.toUpperCase() === "LIST OF FIGURES") {
        children.push(
          new Paragraph({
            children: [new SimpleField('TOC \\\\h \\\\z \\\\c \"Figure\"')]
          })
        );
      } else if (headingText.toUpperCase() === "LIST OF TABLES") {
        children.push(
          new Paragraph({
            children: [new SimpleField('TOC \\\\h \\\\z \\\\c \"Table\"')]
          })
        );
      }

      i += 1;
      continue;
    }

    if (isHeading3(line)) {
      children.push(paragraphFromText(line.slice(4).trim(), { heading: HeadingLevel.HEADING_2 }));
      i += 1;
      continue;
    }

    if (isHeading4(line)) {
      children.push(paragraphFromText(line.slice(5).trim(), { heading: HeadingLevel.HEADING_3 }));
      i += 1;
      continue;
    }

    if (isBullet(line)) {
      children.push(paragraphFromText(line.slice(2).trim(), { bullet: true }));
      i += 1;
      continue;
    }

    // Join plain text lines into a single paragraph until a structural line or blank line appears.
    let paragraphText = line.trim();
    i += 1;
    while (i < lines.length) {
      const nextLineRaw = lines[i];
      const nextLine = nextLineRaw.trimEnd();
      if (!nextLine.trim()) {
        break;
      }
      if (isStructuralStart(nextLine)) {
        break;
      }
      paragraphText += ` ${nextLine.trim()}`;
      i += 1;
    }
    children.push(paragraphFromText(paragraphText));
  }

  return new Document({
    styles: {
      default: {
        document: {
          run: {
            font: "Times New Roman",
            size: 24
          },
          paragraph: {
            spacing: {
              line: 360,
              lineRule: LineRuleType.AUTO
            }
          }
        }
      }
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440,
              right: 1440,
              bottom: 1440,
              left: 1440
            }
          }
        },
        children
      }
    ]
  });
}

async function main() {
  if (!fs.existsSync(INPUT_MD)) {
    throw new Error(`Missing input markdown: ${INPUT_MD}`);
  }

  const markdown = fs.readFileSync(INPUT_MD, "utf8");
  const doc = buildDocFromMarkdown(markdown);
  const buffer = await Packer.toBuffer(doc);

  fs.mkdirSync(path.dirname(OUTPUT_DOCX), { recursive: true });
  fs.writeFileSync(OUTPUT_DOCX, buffer);

  process.stdout.write(`Generated ${OUTPUT_DOCX}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
