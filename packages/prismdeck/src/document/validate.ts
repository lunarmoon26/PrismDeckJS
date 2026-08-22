import type { ErrorObject } from 'ajv';
import Ajv2020 from 'ajv/dist/2020';
import schema from '../../schema/prismdeck.schema.json';
import type { DeckDocument, DeckElement } from './types';

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateSchema = ajv.compile<DeckDocument>(schema);

export class DeckValidationError extends Error {
  readonly issues: readonly ErrorObject[];

  constructor(message: string, issues: readonly ErrorObject[] = []) {
    super(message);
    this.name = 'DeckValidationError';
    this.issues = issues;
  }
}

function assertElementSpecific(element: DeckElement): void {
  switch (element.type) {
    case 'text':
      if (typeof element.text !== 'string' || !element.style) {
        throw new DeckValidationError(`Text element ${element.id} is missing text or style`);
      }
      break;
    case 'image':
      if (!element.assetId) {
        throw new DeckValidationError(`Image element ${element.id} is missing assetId`);
      }
      break;
    case 'shape':
      if (!element.shape || !element.fill || !element.stroke) {
        throw new DeckValidationError(`Shape element ${element.id} is incomplete`);
      }
      break;
    case 'table':
      if (
        !Array.isArray(element.rows) ||
        !Number.isInteger(element.headerRows) ||
        !element.fill ||
        !element.stroke ||
        !element.textStyle
      ) {
        throw new DeckValidationError(`Table element ${element.id} is incomplete`);
      }
      break;
    case 'chart':
      if (!Array.isArray(element.categories) || !Array.isArray(element.series)) {
        throw new DeckValidationError(`Chart element ${element.id} is incomplete`);
      }
      break;
    case 'unsupported':
      if (!element.reason) {
        throw new DeckValidationError(`Unsupported element ${element.id} is missing a reason`);
      }
      break;
    default: {
      const neverElement: never = element;
      throw new DeckValidationError(`Unknown element type: ${String(neverElement)}`);
    }
  }
}

export function validateDeckDocument(value: unknown): asserts value is DeckDocument {
  if (!validateSchema(value)) {
    throw new DeckValidationError('Invalid PrismDeck document', validateSchema.errors ?? []);
  }

  for (const layout of value.layouts) {
    for (const element of layout.elements) assertElementSpecific(element);
  }
  for (const slide of value.slides) {
    for (const element of slide.elements) assertElementSpecific(element);
  }
}

export function isDeckDocument(value: unknown): value is DeckDocument {
  try {
    validateDeckDocument(value);
    return true;
  } catch {
    return false;
  }
}
