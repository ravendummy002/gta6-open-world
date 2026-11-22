// Keyboard and mouse state, with pointer lock for the look camera.
// Keys are read by code (WASD etc.); "was pressed" edges are consumed
// once per frame so a single tap never fires twice.

export class Input {
  constructor() {
    this.down = new Set();
    this.pressedQueue = new Set();
    this.lookDX = 0;
    this.lookDY = 0;
    this.mouseDown = false;
    this.mousePressed = false;
    this.locked = false;
    this.element = null;
  }

  attach(element) {
    this.element = element;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.down.add(e.code);
      this.pressedQueue.add(e.code);
      if (e.code === 'Space' || e.code.startsWith('Arrow')) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.down.clear();
    });
    document.addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.lookDX += e.movementX;
        this.lookDY += e.movementY;
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === element;
      // Losing the lock (Esc, Alt-Tab) can swallow keyup events, so
      // clear the held keys rather than driving off with a stuck W.
      if (!this.locked) this.down.clear();
    });
    element.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouseDown = true;
        this.mousePressed = true;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
  }

  isDown(code) {
    return this.down.has(code);
  }

  wasPressed(code) {
    return this.pressedQueue.has(code);
  }

  // Movement axes in camera space: x = strafe right, y = forward.
  moveAxes() {
    let x = 0;
    let y = 0;
    if (this.isDown('KeyA') || this.isDown('ArrowLeft')) x -= 1;
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) x += 1;
    if (this.isDown('KeyW') || this.isDown('ArrowUp')) y += 1;
    if (this.isDown('KeyS') || this.isDown('ArrowDown')) y -= 1;
    return { x, y };
  }

  consumeLook() {
    const out = { dx: this.lookDX, dy: this.lookDY };
    this.lookDX = 0;
    this.lookDY = 0;
    return out;
  }

  endFrame() {
    this.pressedQueue.clear();
    this.mousePressed = false;
  }

  lock() {
    if (!this.element) return;
    try {
      const p = this.element.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (err) {
      // Pointer lock is a nicety; the camera auto-follows without it.
    }
  }

  unlock() {
    if (document.pointerLockElement) {
      try {
        document.exitPointerLock();
      } catch (err) {}
    }
  }
}
