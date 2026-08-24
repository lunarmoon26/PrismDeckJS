import {
  DEFAULT_TEXT_STYLE,
  DEFAULT_TRANSFORM,
  type DeckLayout,
  type ElementFrame,
  type ElementPlaceholder,
  type ShapeElement,
  type TextElement,
  type TextStyle,
} from 'prismdeckjs';
import type { DeckThemeColors } from './themes';

interface TextPlaceholderOptions {
  id: string;
  name: string;
  prompt: string;
  frame: ElementFrame;
  placeholder: ElementPlaceholder;
  renderOrder?: number;
  style?: Partial<TextStyle>;
}

interface ObjectPlaceholderOptions {
  id: string;
  name: string;
  prompt: string;
  frame: ElementFrame;
  placeholder: ElementPlaceholder;
  renderOrder?: number;
}

const TITLE_FRAME: ElementFrame = { x: 0.05, y: 0.04, width: 0.9, height: 0.15 };
const CONTENT_FRAME: ElementFrame = { x: 0.05, y: 0.23, width: 0.9, height: 0.67 };

function textPlaceholder(colors: DeckThemeColors, options: TextPlaceholderOptions): TextElement {
  return {
    id: options.id,
    type: 'text',
    name: options.name,
    frame: options.frame,
    transform: { ...DEFAULT_TRANSFORM },
    opacity: 1,
    visible: true,
    renderOrder: options.renderOrder ?? 1,
    text: options.prompt,
    style: {
      ...DEFAULT_TEXT_STYLE,
      fontFamily: 'Arial, Helvetica, sans-serif',
      fontSize: 0.032,
      color: colors.warning,
      lineHeight: 1.35,
      ...options.style,
    },
    placeholder: { ...options.placeholder, prompt: options.prompt },
  };
}

function titlePlaceholder(
  colors: DeckThemeColors,
  id: string,
  frame: ElementFrame = TITLE_FRAME,
  style: Partial<TextStyle> = {},
  placeholderType = 'title',
): TextElement {
  return textPlaceholder(colors, {
    id,
    name: 'Title',
    prompt: 'Click to add title',
    frame,
    placeholder: { type: placeholderType },
    renderOrder: 2,
    style: {
      fontSize: 0.055,
      fontWeight: 600,
      color: colors.primary,
      lineHeight: 1.08,
      ...style,
    },
  });
}

function objectPlaceholder(colors: DeckThemeColors, options: ObjectPlaceholderOptions): ShapeElement {
  return {
    id: options.id,
    type: 'shape',
    name: options.name,
    frame: options.frame,
    transform: { ...DEFAULT_TRANSFORM },
    opacity: 1,
    visible: true,
    renderOrder: options.renderOrder ?? 1,
    shape: 'rectangle',
    fill: colors.surface,
    stroke: colors.primary,
    strokeWidth: 1.5,
    text: options.prompt,
    textStyle: {
      ...DEFAULT_TEXT_STYLE,
      fontFamily: 'Arial, Helvetica, sans-serif',
      fontSize: 0.029,
      fontWeight: 400,
      color: colors.warning,
      align: 'center',
      verticalAlign: 'middle',
      lineHeight: 1.25,
    },
    placeholder: { ...options.placeholder, prompt: options.prompt },
  };
}

export function createDefaultLayouts(colors: DeckThemeColors): DeckLayout[] {
  return [
    {
      id: 'layout-title-slide',
      name: 'Title Slide',
      elements: [
        titlePlaceholder(colors, 'layout-title-slide-title', { x: 0.1, y: 0.31, width: 0.8, height: 0.17 }, {
          fontSize: 0.07,
          align: 'center',
          verticalAlign: 'middle',
        }, 'ctrTitle'),
        textPlaceholder(colors, {
          id: 'layout-title-slide-subtitle',
          name: 'Subtitle',
          prompt: 'Click to add subtitle',
          frame: { x: 0.18, y: 0.51, width: 0.64, height: 0.1 },
          placeholder: { type: 'subTitle', index: 1 },
          renderOrder: 1,
          style: { fontSize: 0.035, align: 'center', verticalAlign: 'middle' },
        }),
      ],
    },
    {
      id: 'layout-title-content',
      name: 'Title and Content',
      elements: [
        titlePlaceholder(colors, 'layout-title-content-title'),
        objectPlaceholder(colors, {
          id: 'layout-title-content-body',
          name: 'Content',
          prompt: 'Click to add content',
          frame: CONTENT_FRAME,
          placeholder: { type: 'obj', index: 1 },
        }),
      ],
    },
    {
      id: 'layout-section-header',
      name: 'Section Header',
      elements: [
        titlePlaceholder(colors, 'layout-section-title', { x: 0.08, y: 0.34, width: 0.84, height: 0.16 }, {
          fontSize: 0.064,
          verticalAlign: 'middle',
        }),
        textPlaceholder(colors, {
          id: 'layout-section-subtitle',
          name: 'Section subtitle',
          prompt: 'Click to add section subtitle',
          frame: { x: 0.08, y: 0.52, width: 0.74, height: 0.1 },
          placeholder: { type: 'body', index: 1 },
          style: { fontSize: 0.034 },
        }),
      ],
    },
    {
      id: 'layout-two-content',
      name: 'Two Content',
      elements: [
        titlePlaceholder(colors, 'layout-two-content-title'),
        objectPlaceholder(colors, {
          id: 'layout-two-content-left',
          name: 'Left content',
          prompt: 'Click to add content',
          frame: { x: 0.05, y: 0.23, width: 0.43, height: 0.67 },
          placeholder: { type: 'obj', index: 1 },
        }),
        objectPlaceholder(colors, {
          id: 'layout-two-content-right',
          name: 'Right content',
          prompt: 'Click to add content',
          frame: { x: 0.52, y: 0.23, width: 0.43, height: 0.67 },
          placeholder: { type: 'obj', index: 2 },
        }),
      ],
    },
    {
      id: 'layout-comparison',
      name: 'Comparison',
      elements: [
        titlePlaceholder(colors, 'layout-comparison-title'),
        textPlaceholder(colors, {
          id: 'layout-comparison-left-heading',
          name: 'Left heading',
          prompt: 'Click to add heading',
          frame: { x: 0.05, y: 0.21, width: 0.43, height: 0.09 },
          placeholder: { type: 'body', index: 1 },
          renderOrder: 2,
          style: { fontSize: 0.035, fontWeight: 600, color: colors.primary, align: 'center' },
        }),
        objectPlaceholder(colors, {
          id: 'layout-comparison-left-content',
          name: 'Left content',
          prompt: 'Click to add content',
          frame: { x: 0.05, y: 0.32, width: 0.43, height: 0.58 },
          placeholder: { type: 'obj', index: 2 },
        }),
        textPlaceholder(colors, {
          id: 'layout-comparison-right-heading',
          name: 'Right heading',
          prompt: 'Click to add heading',
          frame: { x: 0.52, y: 0.21, width: 0.43, height: 0.09 },
          placeholder: { type: 'body', index: 3 },
          renderOrder: 2,
          style: { fontSize: 0.035, fontWeight: 600, color: colors.primary, align: 'center' },
        }),
        objectPlaceholder(colors, {
          id: 'layout-comparison-right-content',
          name: 'Right content',
          prompt: 'Click to add content',
          frame: { x: 0.52, y: 0.32, width: 0.43, height: 0.58 },
          placeholder: { type: 'obj', index: 4 },
        }),
      ],
    },
    {
      id: 'layout-title-only',
      name: 'Title Only',
      elements: [titlePlaceholder(colors, 'layout-title-only-title')],
    },
    {
      id: 'layout-blank',
      name: 'Blank',
      elements: [],
    },
    {
      id: 'layout-content-caption',
      name: 'Content with Caption',
      elements: [
        titlePlaceholder(colors, 'layout-content-caption-title', { x: 0.05, y: 0.27, width: 0.3, height: 0.14 }, {
          fontSize: 0.049,
        }),
        textPlaceholder(colors, {
          id: 'layout-content-caption-text',
          name: 'Caption',
          prompt: 'Click to add caption',
          frame: { x: 0.05, y: 0.45, width: 0.3, height: 0.26 },
          placeholder: { type: 'body', index: 1 },
          style: { fontSize: 0.028 },
        }),
        objectPlaceholder(colors, {
          id: 'layout-content-caption-content',
          name: 'Content',
          prompt: 'Click to add content',
          frame: { x: 0.4, y: 0.14, width: 0.55, height: 0.72 },
          placeholder: { type: 'obj', index: 2 },
        }),
      ],
    },
    {
      id: 'layout-picture-caption',
      name: 'Picture with Caption',
      elements: [
        titlePlaceholder(colors, 'layout-picture-caption-title', { x: 0.05, y: 0.27, width: 0.3, height: 0.14 }, {
          fontSize: 0.049,
        }),
        textPlaceholder(colors, {
          id: 'layout-picture-caption-text',
          name: 'Caption',
          prompt: 'Click to add caption',
          frame: { x: 0.05, y: 0.45, width: 0.3, height: 0.26 },
          placeholder: { type: 'body', index: 2 },
          style: { fontSize: 0.028 },
        }),
        objectPlaceholder(colors, {
          id: 'layout-picture-caption-picture',
          name: 'Picture',
          prompt: 'Click to add picture',
          frame: { x: 0.4, y: 0.14, width: 0.55, height: 0.72 },
          placeholder: { type: 'pic', index: 1 },
        }),
      ],
    },
  ];
}
