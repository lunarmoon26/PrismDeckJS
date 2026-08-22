// @vitest-environment jsdom

import { strToU8, zipSync } from 'fflate';
import { describe, expect, test } from 'vitest';
import { importPresentation, validateDeckDocument } from '../src/index';

const contentXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content
  xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"
  xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0"
  xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
  xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"
  xmlns:xlink="http://www.w3.org/1999/xlink"
  xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"
  xmlns:anim="urn:oasis:names:tc:opendocument:xmlns:animation:1.0">
  <office:automatic-styles>
    <style:style style:name="dp1" style:family="drawing-page">
      <style:drawing-page-properties draw:fill="solid" draw:fill-color="#112233"/>
    </style:style>
    <style:style style:name="gr1" style:family="graphic">
      <style:graphic-properties draw:fill="solid" draw:fill-color="#ddeeff" draw:stroke="solid" svg:stroke-color="#223344" svg:stroke-width="1pt"/>
    </style:style>
    <style:style style:name="P1" style:family="paragraph">
      <style:paragraph-properties fo:text-align="center"/>
      <style:text-properties fo:font-size="24pt" fo:color="#123456" fo:font-weight="bold"/>
    </style:style>
  </office:automatic-styles>
  <office:body>
    <office:presentation>
      <draw:page draw:name="ODP Slide" draw:style-name="dp1" draw:master-page-name="Default">
        <draw:frame draw:name="Title" draw:text-style-name="P1" presentation:class="title" svg:x="1in" svg:y="0.5in" svg:width="8in" svg:height="1in">
          <draw:text-box><text:p text:style-name="P1">Hello <text:span>ODP</text:span></text:p></draw:text-box>
        </draw:frame>
        <draw:frame draw:name="Picture" svg:x="1in" svg:y="2in" svg:width="2in" svg:height="2in">
          <draw:image xlink:href="Pictures/pixel.png" xlink:type="simple"/>
        </draw:frame>
        <draw:rect draw:name="Rectangle" draw:style-name="gr1" svg:x="3.5in" svg:y="2in" svg:width="2in" svg:height="1in"><text:p>Box</text:p></draw:rect>
        <draw:ellipse draw:name="Ellipse" draw:style-name="gr1" svg:x="6in" svg:y="2in" svg:width="1in" svg:height="1in"/>
        <draw:line draw:name="Line" draw:style-name="gr1" svg:x1="3.5in" svg:y1="3.5in" svg:x2="7in" svg:y2="3.5in"/>
        <draw:g draw:name="Group" svg:x="0.75in" svg:y="4.25in">
          <draw:rect draw:name="Grouped rectangle" draw:style-name="gr1" svg:x="0.25in" svg:y="0.25in" svg:width="1in" svg:height="0.5in"/>
        </draw:g>
        <draw:frame draw:name="Table" svg:x="3in" svg:y="4in" svg:width="5in" svg:height="2in">
          <table:table>
            <table:table-header-rows><table:table-row><table:table-cell><text:p>Header</text:p></table:table-cell></table:table-row></table:table-header-rows>
            <table:table-row><table:table-cell><text:p>Value</text:p></table:table-cell></table:table-row>
          </table:table>
        </draw:frame>
        <presentation:notes><draw:frame><draw:text-box><text:p>Speaker note</text:p></draw:text-box></draw:frame></presentation:notes>
        <anim:par/>
      </draw:page>
    </office:presentation>
  </office:body>
</office:document-content>`;

const stylesXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles
  xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
  xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"
  xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"
  xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0">
  <office:automatic-styles>
    <style:page-layout style:name="PM1"><style:page-layout-properties fo:page-width="10in" fo:page-height="7.5in"/></style:page-layout>
  </office:automatic-styles>
  <office:master-styles>
    <style:master-page style:name="Default" style:display-name="Default" style:page-layout-name="PM1">
      <draw:frame draw:name="Master title" presentation:class="title" presentation:placeholder="true" svg:x="1in" svg:y="0.5in" svg:width="8in" svg:height="1in">
        <draw:text-box><text:p>Title</text:p></draw:text-box>
      </draw:frame>
    </style:master-page>
  </office:master-styles>
</office:document-styles>`;

const manifestXml = `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0">
  <manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.presentation"/>
  <manifest:file-entry manifest:full-path="Pictures/pixel.png" manifest:media-type="image/png"/>
</manifest:manifest>`;

const metaXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0">
  <office:meta><dc:title>Fixture deck</dc:title><meta:initial-creator>PrismDeck test</meta:initial-creator></office:meta>
</office:document-meta>`;

function fixture(): ArrayBuffer {
  const bytes = zipSync({
    mimetype: [strToU8('application/vnd.oasis.opendocument.presentation'), { level: 0 }],
    'content.xml': strToU8(contentXml),
    'styles.xml': strToU8(stylesXml),
    'meta.xml': strToU8(metaXml),
    'META-INF/manifest.xml': strToU8(manifestXml),
    'Pictures/pixel.png': new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
  });
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

describe('ODP importer', () => {
  test('detects and maps the focused browser-safe subset', async () => {
    const result = await importPresentation(fixture());
    validateDeckDocument(result.document);

    expect(result.document.metadata).toMatchObject({ title: 'Fixture deck', author: 'PrismDeck test', sourceFormat: 'odp' });
    expect(result.document.size).toEqual({ width: 960, height: 720 });
    expect(result.document.layouts).toHaveLength(1);
    expect(result.document.slides).toHaveLength(1);
    expect(result.document.slides[0]).toMatchObject({ name: 'ODP Slide', notes: 'Speaker note', background: '#112233' });
    expect(new Set(result.document.slides[0]?.elements.map((element) => element.type))).toEqual(
      new Set(['text', 'image', 'shape', 'table']),
    );
    const groupedFrame = result.document.slides[0]?.elements.find((element) => element.name === 'Grouped rectangle')?.frame;
    expect(groupedFrame?.x).toBeCloseTo(0.1);
    expect(groupedFrame?.y).toBeCloseTo(0.6);
    expect(groupedFrame?.width).toBeCloseTo(0.1);
    expect(groupedFrame?.height).toBeCloseTo(1 / 15);
    expect(result.assets.size).toBe(1);
    expect(result.report.warnings.map((warning) => warning.code)).toContain('ODP_ANIMATION_UNSUPPORTED');
  });
});
