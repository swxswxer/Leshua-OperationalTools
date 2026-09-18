import { ArrowLeft, Check, ChevronRight, Copy, Trash2, Wrench, X, createElement } from 'lucide';

const icons = { back: ArrowLeft, check: Check, chevron: ChevronRight, copy: Copy, trash: Trash2, wrench: Wrench, close: X };
export type IconName = keyof typeof icons;

export function icon(name: IconName): string {
  return createElement(icons[name], { width: 18, height: 18, 'stroke-width': 1.8, 'aria-hidden': 'true', focusable: 'false' }).outerHTML;
}

export function setButtonLabel(button: HTMLButtonElement, name: IconName, label: string): void {
  button.innerHTML = icon(name);
  if (label) button.append(document.createTextNode(label));
}
