// Moving the muffin: a joystick wherever you put your thumb, or WASD and the
// arrow keys. The hop is the button in the corner, or Space or Shift.
import type { Input } from './run';

/** How far (CSS px) the thumb goes from where it landed for full speed. */
const STICK = 46;

export class Controls {
  /** The on-screen stick while a thumb is down, for drawing. */
  stick: { ox: number; oy: number; x: number; y: number } | null = null;
  private pointer: number | null = null;
  private keys = new Set<string>();
  private hopQueued = false;
  enabled = true;

  constructor(private area: HTMLElement, hopButton: HTMLElement) {
    area.addEventListener('pointerdown', (e) => {
      if (!this.enabled || this.pointer !== null) return;
      if ((e.target as HTMLElement).closest('button')) return;
      this.pointer = e.pointerId;
      const p = this.pt(e);
      this.stick = { ox: p.x, oy: p.y, x: p.x, y: p.y };
      area.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    area.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.pointer || !this.stick) return;
      const p = this.pt(e);
      const dx = p.x - this.stick.ox;
      const dy = p.y - this.stick.oy;
      const d = Math.hypot(dx, dy);
      // Drag past the edge and the stick follows your thumb.
      if (d > STICK * 1.6) {
        this.stick.ox += (dx / d) * (d - STICK * 1.6);
        this.stick.oy += (dy / d) * (d - STICK * 1.6);
      }
      this.stick.x = p.x;
      this.stick.y = p.y;
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.pointer) return;
      this.pointer = null;
      this.stick = null;
    };
    area.addEventListener('pointerup', end);
    area.addEventListener('pointercancel', end);
    hopButton.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.hopQueued = true;
    });
    window.addEventListener('keydown', (e) => {
      if (e.repeat && (e.key === ' ' || e.key === 'Shift')) return;
      const k = e.key.toLowerCase();
      if (k === ' ' || k === 'shift') {
        this.hopQueued = true;
        if (k === ' ') e.preventDefault();
        return;
      }
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        this.keys.add(k);
        if (k.startsWith('arrow')) e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.reset());
  }

  private pt(e: PointerEvent): { x: number; y: number } {
    const r = this.area.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  reset(): void {
    this.keys.clear();
    this.pointer = null;
    this.stick = null;
    this.hopQueued = false;
  }

  /** This frame's input. The hop fires once per press. */
  read(): Input {
    let x = 0;
    let y = 0;
    const k = this.keys;
    if (k.has('a') || k.has('arrowleft')) x -= 1;
    if (k.has('d') || k.has('arrowright')) x += 1;
    if (k.has('w') || k.has('arrowup')) y -= 1;
    if (k.has('s') || k.has('arrowdown')) y += 1;
    if (this.stick) {
      const dx = this.stick.x - this.stick.ox;
      const dy = this.stick.y - this.stick.oy;
      const d = Math.hypot(dx, dy);
      // A little dead zone, then full speed at the edge of the stick.
      if (d > 6) {
        const m = Math.min(1, (d - 6) / (STICK - 6));
        x = (dx / d) * m;
        y = (dy / d) * m;
      }
    }
    const hop = this.hopQueued;
    this.hopQueued = false;
    return { x, y, hop };
  }
}
