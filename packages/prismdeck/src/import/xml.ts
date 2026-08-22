export function parseXmlDocument(xml: string, source = 'XML document'): Document {
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  const parserError = document.getElementsByTagName('parsererror')[0];
  if (parserError) throw new Error(`Invalid ${source}: ${parserError.textContent ?? 'parse error'}`);
  return document;
}

export function localName(node: Node): string {
  return (node as Element).localName || node.nodeName.split(':').at(-1) || '';
}

export function childElements(node: ParentNode, name?: string): Element[] {
  return Array.from(node.children).filter((child) => !name || localName(child) === name);
}

export function firstDescendant(node: ParentNode, name: string): Element | undefined {
  return Array.from((node as Document | Element).getElementsByTagName('*')).find(
    (element) => localName(element) === name,
  );
}

export function descendants(node: ParentNode, name: string): Element[] {
  return Array.from((node as Document | Element).getElementsByTagName('*')).filter(
    (element) => localName(element) === name,
  );
}

export function attributeByLocalName(element: Element, name: string): string | undefined {
  return Array.from(element.attributes).find((attribute) => localName(attribute) === name)?.value;
}

export function resolvePackagePath(sourcePart: string, target: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return target;
  const segments = `${sourcePart.slice(0, sourcePart.lastIndexOf('/') + 1)}${target}`.split('/');
  const normalized: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === '.') continue;
    if (segment === '..') normalized.pop();
    else normalized.push(segment);
  }
  return normalized.join('/');
}

export function relationshipsPath(sourcePart: string): string {
  const slash = sourcePart.lastIndexOf('/');
  const directory = slash >= 0 ? sourcePart.slice(0, slash) : '';
  const fileName = slash >= 0 ? sourcePart.slice(slash + 1) : sourcePart;
  return `${directory ? `${directory}/` : ''}_rels/${fileName}.rels`;
}

export interface PackageRelationship {
  id: string;
  type: string;
  target: string;
  resolvedTarget: string;
  external: boolean;
}

export function parseRelationships(xml: string, sourcePart: string): Map<string, PackageRelationship> {
  const document = parseXmlDocument(xml, `${sourcePart} relationships`);
  const relationships = new Map<string, PackageRelationship>();
  for (const element of Array.from(document.documentElement.children)) {
    const id = element.getAttribute('Id');
    const target = element.getAttribute('Target');
    if (!id || !target) continue;
    const external = element.getAttribute('TargetMode') === 'External';
    relationships.set(id, {
      id,
      type: (element.getAttribute('Type') ?? '').split('/').at(-1) ?? '',
      target,
      resolvedTarget: external ? target : resolvePackagePath(sourcePart, target),
      external,
    });
  }
  return relationships;
}

export function parseLength(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const match = /^(-?[0-9]*\.?[0-9]+)(cm|mm|in|pt|pc|px)?$/i.exec(value.trim());
  if (!match) return undefined;
  const number = Number(match[1]);
  switch ((match[2] ?? 'px').toLowerCase()) {
    case 'cm':
      return number * (96 / 2.54);
    case 'mm':
      return number * (96 / 25.4);
    case 'in':
      return number * 96;
    case 'pt':
      return number * (96 / 72);
    case 'pc':
      return number * 16;
    default:
      return number;
  }
}

export function normalizeColor(value: string | undefined, fallback: string): string {
  if (!value || value === 'none' || value === 'transparent') return fallback;
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    return `#${Array.from(value.slice(1), (character) => `${character}${character}`).join('')}`;
  }
  if (/^#[0-9a-f]{4}$/i.test(value)) {
    return `#${Array.from(value.slice(1), (character) => `${character}${character}`).join('')}`;
  }
  if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value)) return value;
  if (/^[0-9a-f]{6,8}$/i.test(value)) return `#${value}`;
  return fallback;
}
