// @vitest-environment jsdom

import { strToU8, zipSync } from 'fflate';
import { describe, expect, test } from 'vitest';
import { elementWorldTransform, importPresentation, validateDeckDocument } from '../src/index';

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
  xmlns:anim="urn:oasis:names:tc:opendocument:xmlns:animation:1.0"
  xmlns:smil="urn:oasis:names:tc:opendocument:xmlns:smil-compatible:1.0">
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
    <style:style style:name="Table1" style:family="table">
      <style:table-properties fo:background-color="#f8fafc"/>
    </style:style>
    <style:style style:name="TableColumn1" style:family="table-column">
      <style:table-column-properties style:column-width="2in"/>
    </style:style>
    <style:style style:name="TableColumn2" style:family="table-column">
      <style:table-column-properties style:column-width="3in"/>
    </style:style>
    <style:style style:name="TableHeaderRow" style:family="table-row">
      <style:table-row-properties style:row-height="0.5in"/>
    </style:style>
    <style:style style:name="TableBodyRow" style:family="table-row">
      <style:table-row-properties style:row-height="0.375in"/>
    </style:style>
    <style:style style:name="TableHeaderCell" style:family="table-cell">
      <style:table-cell-properties fo:background-color="#334455" fo:border="1pt solid #112233" fo:padding="6pt" style:vertical-align="middle"/>
      <style:text-properties fo:color="#ffffff" fo:font-weight="bold"/>
    </style:style>
    <style:style style:name="TableBodyCell" style:family="table-cell">
      <style:table-cell-properties fo:background-color="#eef2ff" fo:border="1pt solid #94a3b8" fo:padding="4pt"/>
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
          <table:table table:style-name="Table1">
            <table:table-column table:style-name="TableColumn1"/>
            <table:table-column table:style-name="TableColumn2"/>
            <table:table-header-rows>
              <table:table-row table:style-name="TableHeaderRow">
                <table:table-cell table:style-name="TableHeaderCell" table:number-columns-spanned="2"><text:p>Summary</text:p></table:table-cell>
                <table:covered-table-cell/>
              </table:table-row>
            </table:table-header-rows>
            <table:table-row table:style-name="TableBodyRow">
              <table:table-cell table:style-name="TableBodyCell"><text:p>Revenue</text:p></table:table-cell>
              <table:table-cell table:style-name="TableBodyCell"><text:p>42</text:p></table:table-cell>
            </table:table-row>
          </table:table>
        </draw:frame>
        <draw:frame draw:name="Revenue Chart" svg:x="0.75in" svg:y="5.25in" svg:width="2in" svg:height="1.5in">
          <draw:object xlink:href="./Object 1" xlink:type="simple"/>
        </draw:frame>
        <presentation:notes><draw:frame><draw:text-box><text:p>Speaker note</text:p></draw:text-box></draw:frame></presentation:notes>
        <anim:par>
          <anim:animate smil:targetElement="Title" smil:attributeName="opacity" smil:from="0" smil:to="1" smil:dur="300ms" smil:fill="freeze"/>
        </anim:par>
        <anim:par presentation:node-type="after-previous">
          <anim:animateTransform smil:targetElement="Title" smil:type="scale" smil:dur="160ms" smil:repeatCount="2"/>
        </anim:par>
        <anim:par presentation:node-type="after-previous">
          <anim:animateTransform smil:targetElement="Rectangle" smil:type="scale" smil:by="1.2 1.2" smil:dur="160ms"/>
        </anim:par>
        <anim:par presentation:node-type="on-click">
          <anim:animateMotion smil:targetElement="Title" smil:path="M 0 0 L 0.2 -0.1" smil:dur="400ms"/>
        </anim:par>
        <anim:par presentation:node-type="after-previous">
          <anim:animate smil:targetElement="Title" smil:attributeName="opacity" smil:from="1" smil:to="0" smil:dur="250ms"/>
        </anim:par>
        <anim:transitionFilter smil:targetElement="Title"/>
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
  <manifest:file-entry manifest:full-path="Object 1/" manifest:media-type="application/vnd.oasis.opendocument.chart"/>
  <manifest:file-entry manifest:full-path="Object 1/content.xml" manifest:media-type="text/xml"/>
  <manifest:file-entry manifest:full-path="Object 1/META-INF/manifest.xml" manifest:media-type="text/xml"/>
</manifest:manifest>`;

const chartContentXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content
  xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:chart="urn:oasis:names:tc:opendocument:xmlns:chart:1.0"
  xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">
  <office:body>
    <office:chart>
      <chart:chart chart:class="chart:bar">
        <chart:title><text:p>Quarterly Revenue</text:p></chart:title>
        <chart:legend chart:legend-position="end"/>
        <chart:plot-area>
          <chart:axis chart:dimension="x" chart:name="primary-x">
            <chart:title><text:p>Quarter</text:p></chart:title>
            <chart:categories table:cell-range-address="local-table.A2:A4"/>
          </chart:axis>
          <chart:axis chart:dimension="y" chart:name="primary-y">
            <chart:title><text:p>Revenue</text:p></chart:title>
          </chart:axis>
          <chart:series
            chart:class="chart:bar"
            chart:label-cell-address="local-table.B1"
            chart:values-cell-range-address="local-table.B2:B4"/>
        </chart:plot-area>
        <table:table table:name="local-table">
          <table:table-row>
            <table:table-cell office:value-type="string"><text:p>Quarter</text:p></table:table-cell>
            <table:table-cell office:value-type="string"><text:p>Sales</text:p></table:table-cell>
          </table:table-row>
          <table:table-row>
            <table:table-cell office:value-type="string"><text:p>Q1</text:p></table:table-cell>
            <table:table-cell office:value-type="float" office:value="12"><text:p>12</text:p></table:table-cell>
          </table:table-row>
          <table:table-row>
            <table:table-cell office:value-type="string"><text:p>Q2</text:p></table:table-cell>
            <table:table-cell office:value-type="float" office:value="18"><text:p>18</text:p></table:table-cell>
          </table:table-row>
          <table:table-row>
            <table:table-cell office:value-type="string"><text:p>Q3</text:p></table:table-cell>
            <table:table-cell office:value-type="float" office:value="15"><text:p>15</text:p></table:table-cell>
          </table:table-row>
        </table:table>
      </chart:chart>
    </office:chart>
  </office:body>
</office:document-content>`;

const chartManifestXml = `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0">
  <manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.chart"/>
  <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
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
    'Object 1/content.xml': strToU8(chartContentXml),
    'Object 1/META-INF/manifest.xml': strToU8(chartManifestXml),
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
      new Set(['text', 'image', 'shape', 'table', 'chart']),
    );
    expect(result.document.slides[0]?.elements.every((element) => element.transform.z === 0)).toBe(true);
    expect(result.document.slides[0]?.elements.map((element) => element.renderOrder)).toEqual(
      result.document.slides[0]?.elements.map((_, index) => index),
    );
    const groupedFrame = result.document.slides[0]?.elements.find((element) => element.name === 'Grouped rectangle')?.frame;
    expect(groupedFrame?.x).toBeCloseTo(0.1);
    expect(groupedFrame?.y).toBeCloseTo(0.6);
    expect(groupedFrame?.width).toBeCloseTo(0.1);
    expect(groupedFrame?.height).toBeCloseTo(1 / 15);
    const importedText = result.document.slides[0]?.elements.find((element) => element.type === 'text');
    const importedImage = result.document.slides[0]?.elements.find((element) => element.type === 'image');
    expect(importedText && elementWorldTransform(importedText, result.document.size).size.depth).toBe(0);
    expect(importedImage && elementWorldTransform(importedImage, result.document.size).size.depth).toBe(0);
    const importedTable = result.document.slides[0]?.elements.find((element) => element.type === 'table');
    expect(importedTable?.type).toBe('table');
    if (importedTable?.type !== 'table') throw new Error('Expected imported table');
    expect(importedTable.frame.x).toBeCloseTo(0.3);
    expect(importedTable.frame.y).toBeCloseTo(8 / 15);
    expect(importedTable.frame.width).toBeCloseTo(0.5);
    expect(importedTable.frame.height).toBeCloseTo(4 / 15);
    expect(importedTable.columns).toEqual([192, 288]);
    expect(importedTable.rows.map((row) => row.height)).toEqual([48, 36]);
    expect(importedTable.rows[0]?.cells).toHaveLength(1);
    expect(importedTable.rows[0]?.cells[0]).toMatchObject({
      column: 0,
      text: 'Summary',
      columnSpan: 2,
      header: true,
      style: { fill: '#334455', verticalAlign: 'middle' },
    });
    expect(importedTable.rows[1]?.cells.map((cell) => ({ column: cell.column, text: cell.text }))).toEqual([
      { column: 0, text: 'Revenue' },
      { column: 1, text: '42' },
    ]);
    expect(importedTable.rows[1]?.cells.every((cell) => cell.header !== true)).toBe(true);
    const importedChart = result.document.slides[0]?.elements.find((element) => element.type === 'chart');
    expect(importedChart?.type).toBe('chart');
    if (importedChart?.type !== 'chart') throw new Error('Expected imported chart');
    expect(importedChart.title).toBe('Quarterly Revenue');
    expect(importedChart.legend).toMatchObject({ visible: true, position: 'right', overlay: false });
    expect(importedChart.axes).toEqual([
      expect.objectContaining({ kind: 'category', position: 'bottom', visible: true, title: 'Quarter' }),
      expect.objectContaining({ kind: 'value', position: 'left', visible: true, title: 'Revenue' }),
    ]);
    expect(importedChart.plots).toHaveLength(1);
    expect(importedChart.plots[0]).toMatchObject({
      type: 'bar',
      grouping: 'clustered',
      direction: 'column',
      axisIds: importedChart.axes.map((axis) => axis.id),
    });
    expect(importedChart.plots[0]?.series).toEqual([
      {
        name: 'Sales',
        points: [
          { label: 'Q1', value: 12 },
          { label: 'Q2', value: 18 },
          { label: 'Q3', value: 15 },
        ],
      },
    ]);
    expect(result.assets.size).toBe(1);
    expect(result.document.slides[0]?.timeline?.clips.map((clip) => [clip.kind, clip.trigger])).toEqual([
      ['entrance', 'on-enter'],
      ['emphasis', 'after-previous'],
      ['motion', 'on-click'],
      ['exit', 'after-previous'],
    ]);
    expect(result.document.slides[0]?.timeline?.clips[2]).toMatchObject({
      effect: 'path', path: { from: { x: 0, y: 0 }, to: { x: 0.2, y: -0.1 } },
    });
    expect(result.report.warnings).toContainEqual(expect.objectContaining({
      code: 'ODP_ANIMATION_EFFECT_UNSUPPORTED',
      slideIndex: 0,
      elementId: expect.any(String),
      sourcePart: 'content.xml',
    }));
    expect(result.report.warnings.filter((warning) => warning.code === 'ODP_ANIMATION_EFFECT_UNSUPPORTED')).toHaveLength(2);
  });
});
