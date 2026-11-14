import { appStorage } from './appStorage';
export const slimeColors = [
  { id: 'blue', label: 'Bleu', swatch: '#3588ee' },
  { id: 'yellow', label: 'Jaune', swatch: '#f9d638' },
  { id: 'red', label: 'Rouge', swatch: '#ed4a50' },
  { id: 'green', label: 'Vert', swatch: '#49cb75' },
  { id: 'white', label: 'Blanc', swatch: '#f4f4f4' },
  { id: 'black', label: 'Noir', swatch: '#313940' },
  { id: 'orange', label: 'Orange', swatch: '#f29138' },
  { id: 'purple', label: 'Violet', swatch: '#a86de5' },
] as const;
export type SlimeColor = typeof slimeColors[number]['id'];
export function slimeColor(value: unknown): SlimeColor {
  return slimeColors.find(c => c.id === value)?.id ?? 'green';
}
export function savedSlimeColor(accountId?: string): SlimeColor {
  return slimeColor(appStorage.getItem(accountId ? `dowze.mascot.${accountId}.color` : 'dowze.mascot.launch-color'));
}
export const slimeAnimations = {
  idle: { row: 0, durations: [280,110,110,140,140,320] },
  right: { row: 1, durations: [120,120,120,120,120,120,120,220] },
  left: { row: 2, durations: [120,120,120,120,120,120,120,220] },
  wave: { row: 3, durations: [140,140,140,280] },
  jump: { row: 4, durations: [140,140,140,140,280] },
  failed: { row: 5, durations: [140,140,140,140,140,140,140,240] },
  waiting: { row: 6, durations: [150,150,150,150,150,260] },
  working: { row: 7, durations: [120,120,120,120,120,220] },
  review: { row: 8, durations: [150,150,150,150,150,280] },
} as const;
export type SlimeAnimation = keyof typeof slimeAnimations;
