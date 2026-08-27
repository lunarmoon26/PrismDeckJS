export interface DeckThemeColors {
  background: string;
  surface: string;
  primary: string;
  accent: string;
  success: string;
  warning: string;
  danger: string;
}

export const DECK_THEMES = [
  {
    id: 'edge',
    label: 'Edge',
    colors: { background: '#06101E', surface: '#122238', primary: '#F2F7FC', accent: '#89B8D8', success: '#7FC7B2', warning: '#C9D9E8', danger: '#E7957B' },
  },
  {
    id: 'edge-light',
    label: 'Office',
    colors: { background: '#FFFFFF', surface: '#F2F2F2', primary: '#5B9BD5', accent: '#ED7D31', success: '#70AD47', warning: '#44546A', danger: '#C00000' },
  },
  {
    id: 'mecha',
    label: 'Organic',
    colors: { background: '#F7F7F2', surface: '#E2E5D5', primary: '#70AD47', accent: '#4472C4', success: '#548235', warning: '#44546A', danger: '#C55A11' },
  },
  {
    id: 'neon',
    label: 'Ion',
    colors: { background: '#FFFFFF', surface: '#DDEBF7', primary: '#4472C4', accent: '#00B0F0', success: '#70AD47', warning: '#44546A', danger: '#ED7D31' },
  },
  {
    id: 'metropolis',
    label: 'Executive',
    colors: { background: '#FFFFFF', surface: '#D9E2F3', primary: '#1F4E78', accent: '#ED7D31', success: '#70AD47', warning: '#44546A', danger: '#C00000' },
  },
  {
    id: 'sakura',
    label: 'Pastel',
    colors: { background: '#FFFDFD', surface: '#FFEAF2', primary: '#718392', accent: '#CD8A9B', success: '#70AD47', warning: '#44546A', danger: '#C55A11' },
  },
  {
    id: 'mono',
    label: 'Grayscale',
    colors: { background: '#FFFFFF', surface: '#E7E6E6', primary: '#44546A', accent: '#A5A5A5', success: '#7F8C8D', warning: '#595959', danger: '#C00000' },
  },
] as const;

export type DeckThemeId = (typeof DECK_THEMES)[number]['id'];

export function isDeckThemeId(value: string | null): value is DeckThemeId {
  return DECK_THEMES.some((theme) => theme.id === value);
}

export function deckTheme(themeId: DeckThemeId) {
  return DECK_THEMES.find((theme) => theme.id === themeId) ?? DECK_THEMES[0];
}
