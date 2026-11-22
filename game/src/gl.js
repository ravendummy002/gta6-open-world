// Raw WebGL renderer, written for this entry — no engine, no library.
// The whole frame is two draw calls: one static buffer holding the
// entire city, one dynamic buffer rebuilt every frame with every car,
// pedestrian, particle and marker in it.

import { VERT_SRC, FRAG_SRC } from './shaders.js';

const FLOATS_PER_VERTEX = 10; // position(3) + normal(3) + colour(4)
const STRIDE_BYTES = FLOATS_PER_VERTEX * 4;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error('Shader compile failed: ' + log);
  }
  return shader;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL is not available in this browser');
    this.gl = gl;

    const program = gl.createProgram();
    gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, VERT_SRC));
    gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error('Shader link failed: ' + gl.getProgramInfoLog(program));
    }
    this.program = program;
    this.attrib = {
      pos: gl.getAttribLocation(program, 'aPos'),
      normal: gl.getAttribLocation(program, 'aNormal'),
      color: gl.getAttribLocation(program, 'aColor'),
    };
    this.uniform = {
      proj: gl.getUniformLocation(program, 'uProj'),
      view: gl.getUniformLocation(program, 'uView'),
      sunDir: gl.getUniformLocation(program, 'uSunDir'),
      fogColor: gl.getUniformLocation(program, 'uFogColor'),
    };

    this.staticBuffer = gl.createBuffer();
    this.dynamicBuffer = gl.createBuffer();
    this.staticCount = 0;

    gl.disable(gl.CULL_FACE); // boxes are wound loosely; draw both sides
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    // Blending for the soft blob shadows; opaque fragments are unaffected.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0); // transparent: the CSS sky shows through
  }

  // Upload the city once. It never changes.
  setStatic(geom) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.staticBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, geom.toFloat32(), gl.STATIC_DRAW);
    this.staticCount = geom.count;
  }

  resize(cssWidth, cssHeight) {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.max(1, Math.round(cssWidth * dpr));
    const h = Math.max(1, Math.round(cssHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.gl.viewport(0, 0, w, h);
    return w / h;
  }

  bindBuffer(buffer) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(this.attrib.pos);
    gl.enableVertexAttribArray(this.attrib.normal);
    gl.enableVertexAttribArray(this.attrib.color);
    gl.vertexAttribPointer(this.attrib.pos, 3, gl.FLOAT, false, STRIDE_BYTES, 0);
    gl.vertexAttribPointer(this.attrib.normal, 3, gl.FLOAT, false, STRIDE_BYTES, 12);
    gl.vertexAttribPointer(this.attrib.color, 4, gl.FLOAT, false, STRIDE_BYTES, 24);
  }

  // Draw one frame: the static city, then the dynamic world.
  frame(proj, view, dynamicGeom) {
    const gl = this.gl;
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uniform.proj, false, proj);
    gl.uniformMatrix4fv(this.uniform.view, false, view);
    // Afternoon sun over the bay, from the south-west and high.
    gl.uniform3f(this.uniform.sunDir, -0.45, 0.75, 0.4);
    // Horizon haze — the same pale blue as the CSS sky's horizon band.
    gl.uniform3f(this.uniform.fogColor, 0.75, 0.89, 0.95);

    this.bindBuffer(this.staticBuffer);
    gl.drawArrays(gl.TRIANGLES, 0, this.staticCount);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamicBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, dynamicGeom.toFloat32(), gl.DYNAMIC_DRAW);
    this.bindBuffer(this.dynamicBuffer);
    gl.drawArrays(gl.TRIANGLES, 0, dynamicGeom.count);
  }
}
