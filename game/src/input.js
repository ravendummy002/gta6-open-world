// Input for Solmar: keyboard state, pointer-lock mouse look, and firing.
// The game asks this module what the player is doing; it never reads the DOM.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.wheelDelta = 0;
    this.locked = false;
    this.canvas = canvas;
    this.onPauseKey = null; // called on Escape/P
    this.onAnyKey = null; // called on any keydown (start screen)
    this._pressed = new Set(); // edge-triggered keys, consumed per frame

    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (!e.repeat) {
        this._pressed.add(e.code);
        if (this.onAnyKey) this.onAnyKey(e.code);
        if ((e.code === 'Escape' || e.code === 'KeyP') && this.onPauseKey) this.onPauseKey();
      }
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    canvas.addEventListener('mousedown', (e) => {
      // Only fire when the pointer is already locked: the click that locks
      // the pointer must not also fire the pistol.
      if (e.button === 0 && this.locked) this.mouseDown = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.wheelDelta += e.deltaY;
    }, { passive: false });
    canvas.addEventListener('click', () => {
      if (!this.locked) canvas.requestPointerLock();
    });
  }

  /** True while the key is held. */
  down(code) {
    return this.keys.has(code);
  }

  /** True once, the frame the key went down. Consumed on read. */
  pressed(code) {
    if (this._pressed.has(code)) {
      this._pressed.delete(code);
      return true;
    }
    return false;
  }

  /** Mouse look delta since the last frame, then cleared. */
  lookDelta() {
    const dx = this.mouseDX;
    const dy = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;
    return { dx, dy };
  }

  /** Wheel scroll since the last frame, then cleared. */
  wheel() {
    const w = this.wheelDelta;
    this.wheelDelta = 0;
    return w;
  }

  /** End-of-frame housekeeping: drop stale edge presses. */
  endFrame() {
    this._pressed.clear();
  }
}
