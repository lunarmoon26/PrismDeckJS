# Import compatibility

## Supported first-release path

PPTX import targets text, pictures, basic shapes, groups flattened into slide
space, tables, common charts, themes, masters, layouts, speaker notes, and
placeholder inheritance. Complex DrawingML, EMF, SmartArt, and unsupported chart
features may use a fallback representation and always emit a warning.

ODP import targets `draw:page`, master-page dimensions, text frames, images,
rectangles, ellipses, lines, groups, and basic tables. ODF animations and complex
charts are retained only as unsupported-source warnings in the first release.

## Local Dickinson compatibility corpus

The original files remain outside git. Tests opt in through:

```text
PRISMDECK_COMPAT_SAMPLE_PPTX=/absolute/path/Dickinson_Sample_Slides.pptx
PRISMDECK_COMPAT_TEMPLATE_PPTX=/absolute/path/Dickinson_Template_red.pptx
```

Expected SHA-256 values:

```text
ac7f2627645042190df3244cc25929f4b006d144fc2cac520e79ab376197bbbf  Dickinson_Sample_Slides.pptx
5dbca2b0714001a76edb6e7c8096ca2ef39fb6fcb02c0c89dd2ab6355075a9ff  Dickinson_Template_red.pptx
```

The sample deck establishes coverage for 4:3 fitting, nine slides, inherited
placeholder geometry, two themes, ten layouts, EMF/JPEG/PNG media, notes, a
table, and a stacked column chart backed by an embedded workbook. The template
establishes that zero-slide files with masters and layouts import as templates
and can instantiate a new slide.
