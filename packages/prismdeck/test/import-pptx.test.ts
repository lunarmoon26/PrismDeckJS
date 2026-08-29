// @vitest-environment jsdom

import { strToU8, zipSync } from 'fflate';
import { describe, expect, test } from 'vitest';
import { elementWorldTransform, importPresentation, validateDeckDocument } from '../src/index';

const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
</Types>`;

const presentation = (includeSlide: boolean) => `<?xml version="1.0" encoding="UTF-8"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  ${includeSlide ? '<p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst>' : '<p:sldIdLst/>'}
  <p:sldSz cx="9144000" cy="6858000" type="screen4x3"/>
</p:presentation>`;

const presentationRelationships = (includeSlide: boolean) => `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  ${includeSlide ? '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>' : ''}
</Relationships>`;

const slide = `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
    <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
    <p:sp>
      <p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
      <p:spPr><a:xfrm><a:off x="914400" y="457200"/><a:ext cx="7315200" cy="914400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
      <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="2400" b="1"/><a:t>Synthetic deck</a:t></a:r></a:p></p:txBody>
    </p:sp>
    <p:pic>
      <p:nvPicPr><p:cNvPr id="3" name="Pixel"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>
      <p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>
      <p:spPr><a:xfrm><a:off x="914400" y="1828800"/><a:ext cx="1828800" cy="1828800"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
    </p:pic>
    <p:grpSp>
      <p:nvGrpSpPr><p:cNvPr id="4" name="Group 1"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="4572000" y="3657600"/><a:ext cx="1828800" cy="914400"/><a:chOff x="0" y="0"/><a:chExt cx="914400" cy="914400"/></a:xfrm></p:grpSpPr>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="5" name="Grouped shape"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
        <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Grouped</a:t></a:r></a:p></p:txBody>
      </p:sp>
    </p:grpSp>
    <p:sp>
      <p:nvSpPr><p:cNvPr id="6" name="Flat text"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
      <p:spPr><a:xfrm><a:off x="914400" y="5486400"/><a:ext cx="2743200" cy="457200"/></a:xfrm></p:spPr>
      <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Planar text</a:t></a:r></a:p></p:txBody>
    </p:sp>
  </p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`;

const timelineSlide = slide.replace(
  '</p:sld>',
  `<p:timing><p:tnLst><p:par><p:cTn nodeType="tmRoot"><p:childTnLst>
    <p:animEffect filter="fade"><p:cBhvr><p:cTn dur="300" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="2"/></p:tgtEl></p:cBhvr></p:animEffect>
    <p:par><p:cTn nodeType="afterEffect"><p:childTnLst>
      <p:animScale><p:cBhvr><p:cTn dur="160" repeatCount="2"/><p:tgtEl><p:spTgt spid="2"/></p:tgtEl></p:cBhvr></p:animScale>
    </p:childTnLst></p:cTn></p:par>
    <p:par><p:cTn nodeType="clickEffect"><p:childTnLst>
      <p:animMotion path="M 0 0 L 0.2 -0.1 E"><p:cBhvr><p:cTn dur="400"/><p:tgtEl><p:spTgt spid="2"/></p:tgtEl></p:cBhvr></p:animMotion>
      <p:par><p:cTn nodeType="afterEffect"><p:childTnLst>
        <p:animEffect filter="fade" transition="out"><p:cBhvr><p:cTn dur="250"/><p:tgtEl><p:spTgt spid="2"/></p:tgtEl></p:cBhvr></p:animEffect>
      </p:childTnLst></p:cTn></p:par>
    </p:childTnLst></p:cTn></p:par>
    <p:animRot><p:cBhvr><p:cTn dur="120"/><p:tgtEl><p:spTgt spid="2"/></p:tgtEl></p:cBhvr></p:animRot>
    <p:animScale><p:by x="120000" y="120000"/><p:cBhvr><p:cTn dur="120"/><p:tgtEl><p:spTgt spid="2"/></p:tgtEl></p:cBhvr></p:animScale>
  </p:childTnLst></p:cTn></p:par></p:tnLst></p:timing></p:sld>`,
);

const semanticSlide = `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
    <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
    <p:graphicFrame>
      <p:nvGraphicFramePr><p:cNvPr id="2" name="Merged quarterly table"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>
      <p:xfrm><a:off x="457200" y="457200"/><a:ext cx="5486400" cy="1371600"/></p:xfrm>
      <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl>
        <a:tblPr firstRow="1" bandRow="1"/>
        <a:tblGrid><a:gridCol w="1828800"/><a:gridCol w="2743200"/><a:gridCol w="914400"/></a:tblGrid>
        <a:tr h="457200">
          <a:tc gridSpan="2"><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Region / Quarter</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc>
          <a:tc hMerge="1"><a:txBody><a:bodyPr/><a:lstStyle/><a:p/></a:txBody><a:tcPr/></a:tc>
          <a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Revenue</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc>
        </a:tr>
        <a:tr h="365760">
          <a:tc rowSpan="2"><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>North</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc>
          <a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Q1</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc>
          <a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>42</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc>
        </a:tr>
        <a:tr h="548640">
          <a:tc vMerge="1"><a:txBody><a:bodyPr/><a:lstStyle/><a:p/></a:txBody><a:tcPr/></a:tc>
          <a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Q2</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc>
          <a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>57</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc>
        </a:tr>
      </a:tbl></a:graphicData></a:graphic>
    </p:graphicFrame>
    <p:graphicFrame>
      <p:nvGraphicFramePr><p:cNvPr id="3" name="Revenue and margin chart"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>
      <p:xfrm><a:off x="457200" y="2286000"/><a:ext cx="8229600" cy="4114800"/></p:xfrm>
      <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart r:id="rId2"/></a:graphicData></a:graphic>
    </p:graphicFrame>
  </p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`;

const combinationChart = `<?xml version="1.0" encoding="UTF-8"?>
<c:chartSpace xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:chart>
    <c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Revenue and margin</a:t></a:r></a:p></c:rich></c:tx><c:layout/><c:overlay val="0"/></c:title>
    <c:plotArea>
      <c:layout/>
      <c:barChart>
        <c:barDir val="col"/><c:grouping val="stacked"/><c:varyColors val="0"/>
        <c:ser>
          <c:idx val="0"/><c:order val="0"/>
          <c:tx><c:strRef><c:f>Data!$B$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>Hardware</c:v></c:pt></c:strCache></c:strRef></c:tx>
          <c:cat><c:strRef><c:f>Data!$A$2:$A$4</c:f><c:strCache><c:ptCount val="3"/><c:pt idx="0"><c:v>Q1</c:v></c:pt><c:pt idx="1"><c:v>Q2</c:v></c:pt><c:pt idx="2"><c:v>Q3</c:v></c:pt></c:strCache></c:strRef></c:cat>
          <c:val><c:numRef><c:f>Data!$B$2:$B$4</c:f><c:numCache><c:formatCode>$#,##0</c:formatCode><c:ptCount val="3"/><c:pt idx="0"><c:v>30</c:v></c:pt><c:pt idx="1"><c:v>42</c:v></c:pt><c:pt idx="2"><c:v>55</c:v></c:pt></c:numCache></c:numRef></c:val>
        </c:ser>
        <c:ser>
          <c:idx val="1"/><c:order val="1"/>
          <c:tx><c:strRef><c:f>Data!$C$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>Services</c:v></c:pt></c:strCache></c:strRef></c:tx>
          <c:cat><c:strRef><c:f>Data!$A$2:$A$4</c:f><c:strCache><c:ptCount val="3"/><c:pt idx="0"><c:v>Q1</c:v></c:pt><c:pt idx="1"><c:v>Q2</c:v></c:pt><c:pt idx="2"><c:v>Q3</c:v></c:pt></c:strCache></c:strRef></c:cat>
          <c:val><c:numRef><c:f>Data!$C$2:$C$4</c:f><c:numCache><c:formatCode>$#,##0</c:formatCode><c:ptCount val="3"/><c:pt idx="0"><c:v>12</c:v></c:pt><c:pt idx="1"><c:v>18</c:v></c:pt><c:pt idx="2"><c:v>21</c:v></c:pt></c:numCache></c:numRef></c:val>
        </c:ser>
        <c:overlap val="100"/><c:axId val="100"/><c:axId val="200"/>
      </c:barChart>
      <c:lineChart>
        <c:grouping val="standard"/><c:varyColors val="0"/>
        <c:ser>
          <c:idx val="2"/><c:order val="2"/>
          <c:tx><c:strRef><c:f>Data!$D$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>Margin</c:v></c:pt></c:strCache></c:strRef></c:tx>
          <c:marker><c:symbol val="circle"/><c:size val="6"/></c:marker>
          <c:cat><c:strRef><c:f>Data!$A$2:$A$4</c:f><c:strCache><c:ptCount val="3"/><c:pt idx="0"><c:v>Q1</c:v></c:pt><c:pt idx="1"><c:v>Q2</c:v></c:pt><c:pt idx="2"><c:v>Q3</c:v></c:pt></c:strCache></c:strRef></c:cat>
          <c:val><c:numRef><c:f>Data!$D$2:$D$4</c:f><c:numCache><c:formatCode>0%</c:formatCode><c:ptCount val="3"/><c:pt idx="0"><c:v>0.25</c:v></c:pt><c:pt idx="2"><c:v>0.4</c:v></c:pt></c:numCache></c:numRef></c:val>
          <c:smooth val="0"/>
        </c:ser>
        <c:axId val="100"/><c:axId val="300"/>
      </c:lineChart>
      <c:catAx>
        <c:axId val="100"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/>
        <c:numFmt formatCode="General" sourceLinked="1"/><c:tickLblPos val="nextTo"/><c:crossAx val="200"/><c:crosses val="autoZero"/>
      </c:catAx>
      <c:valAx>
        <c:axId val="200"/><c:scaling><c:orientation val="minMax"/><c:max val="100"/><c:min val="0"/></c:scaling><c:delete val="0"/><c:axPos val="l"/>
        <c:numFmt formatCode="$#,##0" sourceLinked="0"/><c:tickLblPos val="nextTo"/><c:crossAx val="100"/><c:crosses val="autoZero"/><c:crossBetween val="between"/>
      </c:valAx>
      <c:valAx>
        <c:axId val="300"/><c:scaling><c:orientation val="minMax"/><c:max val="1"/><c:min val="0"/></c:scaling><c:delete val="0"/><c:axPos val="r"/>
        <c:numFmt formatCode="0%" sourceLinked="0"/><c:tickLblPos val="nextTo"/><c:crossAx val="100"/><c:crosses val="max"/><c:crossBetween val="between"/>
      </c:valAx>
    </c:plotArea>
    <c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>
    <c:plotVisOnly val="1"/><c:dispBlanksAs val="span"/><c:showDLblsOverMax val="0"/>
  </c:chart>
</c:chartSpace>`;

const layout = `<?xml version="1.0" encoding="UTF-8"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="titleOnly" preserve="1">
  <p:cSld name="Title Only"><p:spTree>
    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
    <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
    <p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="914400" y="457200"/><a:ext cx="7315200" cy="914400"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>
  </p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>`;

const master = `<?xml version="1.0" encoding="UTF-8"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld name="Master"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>
  <p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/>
  <p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles/>
</p:sldMaster>`;

const theme = `<?xml version="1.0" encoding="UTF-8"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office">
  <a:themeElements>
    <a:clrScheme name="Office"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="222222"/></a:dk2><a:lt2><a:srgbClr val="EEEEEE"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme>
    <a:fontScheme name="Office"><a:majorFont><a:latin typeface="Arial"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/></a:minorFont></a:fontScheme>
    <a:fmtScheme name="Office"><a:fillStyleLst/><a:lnStyleLst/><a:effectStyleLst/><a:bgFillStyleLst/></a:fmtScheme>
  </a:themeElements>
</a:theme>`;

function fixture(
  includeSlide: boolean,
  variant: 'basic' | 'semantic' = 'basic',
  chartXml = combinationChart,
  slideXml?: string,
): ArrayBuffer {
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      variant === 'semantic'
        ? contentTypes.replace(
            '</Types>',
            '  <Override PartName="/ppt/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>\n</Types>',
          )
        : contentTypes,
    ),
    'ppt/presentation.xml': strToU8(presentation(includeSlide)),
    'ppt/_rels/presentation.xml.rels': strToU8(presentationRelationships(includeSlide)),
    'ppt/slideLayouts/slideLayout1.xml': strToU8(layout),
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels': strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`),
    'ppt/slideMasters/slideMaster1.xml': strToU8(master),
    'ppt/slideMasters/_rels/slideMaster1.xml.rels': strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`),
    'ppt/theme/theme1.xml': strToU8(theme),
  };
  if (includeSlide) {
    files['ppt/slides/slide1.xml'] = strToU8(slideXml ?? (variant === 'semantic' ? semanticSlide : slide));
    files['ppt/slides/_rels/slide1.xml.rels'] = strToU8(
      variant === 'semantic'
        ? `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/></Relationships>`
        : `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/pixel.png"/></Relationships>`,
    );
    if (variant === 'semantic') files['ppt/charts/chart1.xml'] = strToU8(chartXml);
    else files['ppt/media/pixel.png'] = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  }
  const bytes = zipSync(files);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

describe('PPTX importer', () => {
  test('detects and maps a basic OOXML presentation', async () => {
    const result = await importPresentation(fixture(true));
    validateDeckDocument(result.document);

    expect(result.document.kind).toBe('presentation');
    expect(result.document.size).toEqual({ width: 960, height: 720 });
    expect(result.document.layouts).toHaveLength(1);
    expect(result.document.slides).toHaveLength(1);
    expect(result.document.slides[0]?.elements.map((element) => element.type)).toEqual(['shape', 'image', 'shape', 'text']);
    expect(result.document.slides[0]?.elements.map((element) => element.transform.z)).toEqual([0, 0, 0, 0]);
    expect(result.document.slides[0]?.elements.map((element) => element.renderOrder)).toEqual([1, 2, 3, 4]);
    expect(result.document.slides[0]?.elements[2]).toMatchObject({
      name: 'Grouped shape',
      frame: { x: 0.5, y: expect.closeTo(0.5333, 3), width: 0.2, height: expect.closeTo(0.1333, 3) },
    });
    const importedText = result.document.slides[0]?.elements.find((element) => element.type === 'text');
    const importedImage = result.document.slides[0]?.elements.find((element) => element.type === 'image');
    expect(importedText && elementWorldTransform(importedText, result.document.size).size.depth).toBe(0);
    expect(importedImage && elementWorldTransform(importedImage, result.document.size).size.depth).toBe(0);
    expect(result.assets.size).toBe(1);
  });

  test('maps a zero-slide OOXML file as a template', async () => {
    const result = await importPresentation(fixture(false), { sourceName: 'template.pptx' });
    validateDeckDocument(result.document);

    expect(result.document.kind).toBe('template');
    expect(result.document.slides).toHaveLength(0);
    expect(result.document.layouts).toHaveLength(1);
  });

  test('maps the focused PowerPoint timeline subset and reports unsupported effects', async () => {
    const result = await importPresentation(fixture(true, 'basic', combinationChart, timelineSlide));
    validateDeckDocument(result.document);

    const timeline = result.document.slides[0]?.timeline;
    expect(timeline?.clips.map((clip) => [clip.kind, clip.trigger])).toEqual([
      ['entrance', 'on-enter'],
      ['emphasis', 'after-previous'],
      ['motion', 'on-click'],
      ['exit', 'after-previous'],
    ]);
    expect(timeline?.clips[2]).toMatchObject({
      effect: 'path', path: { from: { x: 0, y: 0 }, to: { x: 0.2, y: -0.1 } },
    });
    expect(result.document.slides[0]?.elements[0]?.source?.nativeId).toBe('2');
    expect(result.report.warnings).toContainEqual(expect.objectContaining({
      code: 'PPTX_ANIMATION_EFFECT_UNSUPPORTED',
      slideIndex: 0,
      sourcePart: 'ppt/slides/slide1.xml',
    }));
    expect(result.report.warnings.filter((warning) => warning.code === 'PPTX_ANIMATION_EFFECT_UNSUPPORTED')).toHaveLength(2);
  });

  test('maps semantic DrawingML tables and combination charts', async () => {
    const result = await importPresentation(fixture(true, 'semantic'));
    validateDeckDocument(result.document);

    const table = result.document.slides[0]?.elements.find((element) => element.type === 'table');
    const chart = result.document.slides[0]?.elements.find((element) => element.type === 'chart');
    if (table?.type !== 'table' || chart?.type !== 'chart') throw new Error('Expected a semantic table and chart');

    expect(table.columns).toEqual([192, 288, 96]);
    expect(table.rows).toMatchObject([
      {
        height: 48,
        cells: [
          { column: 0, text: 'Region / Quarter', columnSpan: 2, header: true },
          { column: 2, text: 'Revenue', header: true },
        ],
      },
      {
        height: expect.closeTo(38.4, 10),
        cells: [
          { column: 0, text: 'North', rowSpan: 2 },
          { column: 1, text: 'Q1' },
          { column: 2, text: '42' },
        ],
      },
      {
        height: expect.closeTo(57.6, 10),
        cells: [
          { column: 1, text: 'Q2' },
          { column: 2, text: '57' },
        ],
      },
    ]);

    expect(chart.plots).toMatchObject([
      {
        type: 'bar',
        grouping: 'stacked',
        direction: 'column',
        axisIds: ['100', '200'],
        series: [
          {
            name: 'Hardware',
            points: [
              { label: 'Q1', value: 30 },
              { label: 'Q2', value: 42 },
              { label: 'Q3', value: 55 },
            ],
          },
          {
            name: 'Services',
            points: [
              { label: 'Q1', value: 12 },
              { label: 'Q2', value: 18 },
              { label: 'Q3', value: 21 },
            ],
          },
        ],
      },
      {
        type: 'line',
        grouping: 'standard',
        axisIds: ['100', '300'],
        series: [
          {
            name: 'Margin',
            points: [
              { label: 'Q1', value: 0.25 },
              { label: 'Q2', value: null },
              { label: 'Q3', value: 0.4 },
            ],
          },
        ],
      },
    ]);
    expect(chart.axes).toMatchObject([
      { id: '100', kind: 'category', position: 'bottom', visible: true, numberFormat: 'General' },
      { id: '200', kind: 'value', position: 'left', visible: true, numberFormat: '$#,##0', minimum: 0, maximum: 100 },
      { id: '300', kind: 'value', position: 'right', visible: true, numberFormat: '0%', minimum: 0, maximum: 1 },
    ]);
    expect(chart.legend).toMatchObject({ visible: true, position: 'bottom', overlay: false });
    expect(chart.displayBlanksAs).toBe('span');
  });

  test('bounds oversized chart cache indexes and reports truncation', async () => {
    const oversizedChart = combinationChart.replace(
      '<c:ptCount val="1"/><c:pt idx="0"><c:v>Hardware</c:v></c:pt>',
      '<c:ptCount val="1000000000"/><c:pt idx="1000000000"><c:v>Hardware</c:v></c:pt>',
    );
    const result = await importPresentation(fixture(true, 'semantic', oversizedChart));

    validateDeckDocument(result.document);
    expect(result.report.warnings).toContainEqual(expect.objectContaining({ code: 'PPTX_CHART_DATA_TRUNCATED' }));
  });

  test('bounds oversized table spans and reports truncation', async () => {
    const oversizedTable = semanticSlide.replace('gridSpan="2"', 'gridSpan="1000000000"');
    const result = await importPresentation(fixture(true, 'semantic', combinationChart, oversizedTable));

    validateDeckDocument(result.document);
    const table = result.document.slides[0]?.elements.find((element) => element.type === 'table');
    expect(table?.type === 'table' ? table.columns : []).toHaveLength(1_000);
    expect(result.report.warnings).toContainEqual(expect.objectContaining({ code: 'PPTX_TABLE_TRUNCATED' }));
  });
});
