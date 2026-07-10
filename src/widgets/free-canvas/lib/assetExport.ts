import type {
  CanvasEdge,
  CanvasElement,
} from "@/entities/canvas/model/types";
import { getCanvasNodeEditorTitle } from "./editor";

export type CanvasAssetExportFormat = "md" | "docx" | "txt" | "json" | "media";

function safeFileName(value: string): string {
  return (
    value
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, " ")
      .slice(0, 80) || "creativeos-asset"
  );
}

function downloadUrl(url: string, filename: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function downloadBlob(content: BlobPart, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  downloadUrl(url, filename);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadBlobObject(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  downloadUrl(url, filename);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function getUrlExtension(url: string, fallback: string): string {
  if (url.startsWith("data:")) {
    const mediaType = url.slice(5, url.indexOf(";") > -1 ? url.indexOf(";") : undefined);
    const subtype = mediaType.split("/")[1]?.split("+")[0];
    return subtype || fallback;
  }

  try {
    const pathname = new URL(url, window.location.href).pathname;
    const match = pathname.match(/\.([a-z0-9]+)$/i);
    return match?.[1] || fallback;
  } catch {
    return fallback;
  }
}

export function exportCanvasAsset(element: CanvasElement): boolean {
  if (element.kind === "text") {
    return exportCanvasAssetAs(element, "md");
  }

  if (element.kind === "template" || element.kind === "processor") {
    return exportCanvasAssetAs(element, "json");
  }

  return exportCanvasAssetAs(element, "media");
}

export function exportCanvasAssetAs(
  element: CanvasElement,
  format: CanvasAssetExportFormat,
): boolean {
  const title = safeFileName(element.asset?.title || getCanvasNodeEditorTitle(element));

  if (element.kind === "text") {
    if (format === "docx") {
      downloadBlobObject(
        createDocxBlob({
          title: element.asset?.title || getCanvasNodeEditorTitle(element),
          text: element.text || "",
        }),
        `${title}.docx`,
      );
      return true;
    }

    if (format === "txt") {
      downloadBlob(element.text || "", `${title}.txt`, "text/plain;charset=utf-8");
      return true;
    }

    if (format === "json") {
      downloadBlob(
        JSON.stringify(element, null, 2),
        `${title}.json`,
        "application/json;charset=utf-8",
      );
      return true;
    }

    if (format === "md" || format === "media") {
      downloadBlob(element.text || "", `${title}.md`, "text/markdown;charset=utf-8");
      return true;
    }
  }

  if (element.kind === "image" && element.src) {
    downloadUrl(element.src, `${title}.${getUrlExtension(element.src, "png")}`);
    return true;
  }

  if ((element.kind === "video" || element.kind === "audio") && element.src) {
    const fallback = element.kind === "video" ? "mp4" : "mp3";
    downloadUrl(element.src, `${title}.${getUrlExtension(element.src, fallback)}`);
    return true;
  }

  if (element.kind === "template" || element.kind === "processor") {
    downloadBlob(
      JSON.stringify(element, null, 2),
      `${title}.json`,
      "application/json;charset=utf-8",
    );
    return true;
  }

  return false;
}

function getAssetContentReference(element: CanvasElement): Record<string, unknown> {
  if (element.kind === "text") {
    return {
      text: element.text,
      format: "markdown",
    };
  }

  if (element.kind === "image" || element.kind === "video" || element.kind === "audio") {
    return {
      url: element.src,
      prompt: element.prompt,
      label: element.label,
    };
  }

  if (element.kind === "template") {
    return {
      templateId: element.templateId,
      title: element.title,
      props: element.props,
      artifactId: element.artifactId,
    };
  }

  if (element.kind === "processor") {
    return {
      processorId: element.processorId,
      title: element.title,
      config: element.config,
      sourceIds: element.sourceIds,
    };
  }

  return {};
}

function createAssetManifest(params: {
  elements: CanvasElement[];
  edges: CanvasEdge[];
  projectName?: string | null;
}) {
  const assets = params.elements.filter((element) => Boolean(element.asset));
  const assetIds = new Set(assets.map((element) => element.id));

  return {
    schema: "creativeos.asset_manifest.v1",
    exportedAt: new Date().toISOString(),
    projectName: params.projectName || "未命名画布",
    assetCount: assets.length,
    assets: assets.map((element) => ({
      id: element.id,
      kind: element.kind,
      title: element.asset?.title || getCanvasNodeEditorTitle(element),
      asset: element.asset,
      position: {
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
      },
      content: getAssetContentReference(element),
    })),
    relations: params.edges
      .filter((edge) => assetIds.has(edge.sourceId) || assetIds.has(edge.targetId))
      .map((edge) => ({
        id: edge.id,
        sourceId: edge.sourceId,
        targetId: edge.targetId,
      })),
  };
}

const CRC32_TABLE = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function getDosDateTime(date = new Date()): { date: number; time: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      Math.floor(date.getSeconds() / 2),
  };
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const size = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function writeUint16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}

function writeUint32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true);
}

function createZip(files: Array<{ path: string; data: Uint8Array }>): Blob {
  const encoder = new TextEncoder();
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;
  const { date, time } = getDosDateTime();

  for (const file of files) {
    const nameBytes = encoder.encode(file.path);
    const fileCrc = crc32(file.data);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    writeUint32(localView, 0, 0x04034b50);
    writeUint16(localView, 4, 20);
    writeUint16(localView, 6, 0x0800);
    writeUint16(localView, 8, 0);
    writeUint16(localView, 10, time);
    writeUint16(localView, 12, date);
    writeUint32(localView, 14, fileCrc);
    writeUint32(localView, 18, file.data.length);
    writeUint32(localView, 22, file.data.length);
    writeUint16(localView, 26, nameBytes.length);
    writeUint16(localView, 28, 0);
    localHeader.set(nameBytes, 30);
    localChunks.push(localHeader, file.data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    writeUint32(centralView, 0, 0x02014b50);
    writeUint16(centralView, 4, 20);
    writeUint16(centralView, 6, 20);
    writeUint16(centralView, 8, 0x0800);
    writeUint16(centralView, 10, 0);
    writeUint16(centralView, 12, time);
    writeUint16(centralView, 14, date);
    writeUint32(centralView, 16, fileCrc);
    writeUint32(centralView, 20, file.data.length);
    writeUint32(centralView, 24, file.data.length);
    writeUint16(centralView, 28, nameBytes.length);
    writeUint16(centralView, 30, 0);
    writeUint16(centralView, 32, 0);
    writeUint16(centralView, 34, 0);
    writeUint16(centralView, 36, 0);
    writeUint32(centralView, 38, 0);
    writeUint32(centralView, 42, offset);
    centralHeader.set(nameBytes, 46);
    centralChunks.push(centralHeader);

    offset += localHeader.length + file.data.length;
  }

  const centralDirectory = concatBytes(centralChunks);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  writeUint32(endView, 0, 0x06054b50);
  writeUint16(endView, 4, 0);
  writeUint16(endView, 6, 0);
  writeUint16(endView, 8, files.length);
  writeUint16(endView, 10, files.length);
  writeUint32(endView, 12, centralDirectory.length);
  writeUint32(endView, 16, offset);
  writeUint16(endView, 20, 0);

  const zipBytes = concatBytes([...localChunks, centralDirectory, end]);
  const zipBuffer = zipBytes.buffer.slice(
    zipBytes.byteOffset,
    zipBytes.byteOffset + zipBytes.byteLength,
  ) as ArrayBuffer;

  return new Blob([zipBuffer], {
    type: "application/zip",
  });
}

function encodeTextFile(content: string): Uint8Array {
  return new TextEncoder().encode(content);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function createDocxParagraph(text: string): string {
  const trimmed = text.trimEnd();
  const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
  const content = heading ? heading[2] || "" : trimmed;
  const headingLevel = heading?.[1]?.length;
  const style = heading
    ? `<w:pPr><w:pStyle w:val="Heading${headingLevel || 1}"/></w:pPr>`
    : "";

  if (!content.trim()) {
    return "<w:p/>";
  }

  return [
    "<w:p>",
    style,
    "<w:r>",
    '<w:t xml:space="preserve">',
    escapeXml(content),
    "</w:t>",
    "</w:r>",
    "</w:p>",
  ].join("");
}

function createDocxDocumentXml(params: {
  title: string;
  text: string;
}): string {
  const paragraphs = [
    createDocxParagraph(`# ${params.title}`),
    ...params.text.split(/\r?\n/).map(createDocxParagraph),
  ].join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphs}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

function createDocxStylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:spacing w:after="160" w:line="360" w:lineRule="auto"/></w:pPr>
    <w:rPr><w:sz w:val="24"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:qFormat/>
    <w:rPr><w:b/><w:sz w:val="36"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:qFormat/>
    <w:rPr><w:b/><w:sz w:val="30"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:qFormat/>
    <w:rPr><w:b/><w:sz w:val="26"/></w:rPr>
  </w:style>
</w:styles>`;
}

function createDocxBlob(params: {
  title: string;
  text: string;
}): Blob {
  return createZip([
    {
      path: "[Content_Types].xml",
      data: encodeTextFile(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`),
    },
    {
      path: "_rels/.rels",
      data: encodeTextFile(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`),
    },
    {
      path: "word/_rels/document.xml.rels",
      data: encodeTextFile(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`),
    },
    {
      path: "word/document.xml",
      data: encodeTextFile(createDocxDocumentXml(params)),
    },
    {
      path: "word/styles.xml",
      data: encodeTextFile(createDocxStylesXml()),
    },
    {
      path: "docProps/core.xml",
      data: encodeTextFile(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(params.title)}</dc:title>
  <dc:creator>CreativeOS</dc:creator>
  <cp:lastModifiedBy>CreativeOS</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:modified>
</cp:coreProperties>`),
    },
    {
      path: "docProps/app.xml",
      data: encodeTextFile(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>CreativeOS</Application>
</Properties>`),
    },
  ]);
}

async function createDocxBytes(params: {
  title: string;
  text: string;
}): Promise<Uint8Array> {
  const buffer = await createDocxBlob(params).arrayBuffer();
  return new Uint8Array(buffer);
}

function getAssetFileBase(element: CanvasElement): string {
  return safeFileName(`${element.asset?.title || getCanvasNodeEditorTitle(element)}-${element.id.slice(-6)}`);
}

async function readMediaBytes(src: string): Promise<Uint8Array | null> {
  if (src.startsWith("data:")) {
    const response = await fetch(src);
    return new Uint8Array(await response.arrayBuffer());
  }

  const url = new URL(src, window.location.href);
  if (url.origin !== window.location.origin) return null;

  const response = await fetch(url.href);
  if (!response.ok) return null;
  return new Uint8Array(await response.arrayBuffer());
}

export function exportCanvasAssetManifest(params: {
  elements: CanvasElement[];
  edges: CanvasEdge[];
  projectName?: string | null;
}): number {
  const assets = params.elements.filter((element) => Boolean(element.asset));
  const manifest = createAssetManifest(params);

  downloadBlob(
    JSON.stringify(manifest, null, 2),
    `${safeFileName(params.projectName || "creativeos-assets")}.asset-manifest.json`,
    "application/json;charset=utf-8",
  );

  return assets.length;
}

export async function exportCanvasAssetPackage(params: {
  elements: CanvasElement[];
  edges: CanvasEdge[];
  projectName?: string | null;
}): Promise<{
  assetCount: number;
  fileCount: number;
  skippedMediaCount: number;
}> {
  const assets = params.elements.filter((element) => Boolean(element.asset));
  const files: Array<{ path: string; data: Uint8Array }> = [];
  const manifest = createAssetManifest(params);
  const mediaNotes: Array<{ id: string; title: string; url: string; reason: string }> = [];

  files.push({
    path: "manifest.json",
    data: encodeTextFile(JSON.stringify(manifest, null, 2)),
  });

  for (const element of assets) {
    const base = getAssetFileBase(element);

    if (element.kind === "text") {
      const title = element.asset?.title || getCanvasNodeEditorTitle(element);
      files.push({
        path: `assets/text/${base}.md`,
        data: encodeTextFile(element.text || ""),
      });
      files.push({
        path: `assets/text/${base}.docx`,
        data: await createDocxBytes({
          title,
          text: element.text || "",
        }),
      });
      continue;
    }

    if (element.kind === "template" || element.kind === "processor") {
      files.push({
        path: `assets/json/${base}.json`,
        data: encodeTextFile(JSON.stringify(element, null, 2)),
      });
      continue;
    }

    if ((element.kind === "image" || element.kind === "video" || element.kind === "audio") && element.src) {
      const bytes = await readMediaBytes(element.src).catch(() => null);
      if (bytes) {
        const fallback =
          element.kind === "image" ? "png" : element.kind === "video" ? "mp4" : "mp3";
        files.push({
          path: `assets/media/${base}.${getUrlExtension(element.src, fallback)}`,
          data: bytes,
        });
      } else {
        mediaNotes.push({
          id: element.id,
          title: element.asset?.title || getCanvasNodeEditorTitle(element),
          url: element.src,
          reason: "media_url_not_packaged",
        });
      }
    }
  }

  if (mediaNotes.length > 0) {
    files.push({
      path: "media-url-notes.json",
      data: encodeTextFile(JSON.stringify(mediaNotes, null, 2)),
    });
  }

  const zip = createZip(files);
  downloadBlobObject(
    zip,
    `${safeFileName(params.projectName || "creativeos-assets")}.asset-pack.zip`,
  );

  return {
    assetCount: assets.length,
    fileCount: files.length,
    skippedMediaCount: mediaNotes.length,
  };
}
