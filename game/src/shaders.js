// The game's only shader pair, written for this entry.
// One flat-shaded, vertex-coloured material with a warm sun and distance
// fog: the whole city, every car and every pedestrian is drawn with it,
// so the game renders in two draw calls a frame.

// Lighting is done per vertex: a strong ambient term keeps the shaded
// sides of buildings readable, and the sun adds the modelling.
export const VERT_SRC = `
attribute vec3 aPos;
attribute vec3 aNormal;
attribute vec4 aColor;
uniform mat4 uProj;
uniform mat4 uView;
uniform vec3 uSunDir;
varying vec4 vColor;
varying float vFog;
void main() {
  vec4 view = uView * vec4(aPos, 1.0);
  float ndl = max(dot(normalize(aNormal), normalize(uSunDir)), 0.0);
  float light = 0.62 + 0.38 * ndl;
  vColor = vec4(aColor.rgb * light, aColor.a);
  vFog = clamp((-view.z - 70.0) / 260.0, 0.0, 1.0);
  gl_Position = uProj * view;
}
`;

// Fog fades the far city into the horizon colour, which matches the
// sky gradient painted behind the transparent canvas. The alpha
// channel survives for soft blob shadows under cars and people.
export const FRAG_SRC = `
precision mediump float;
varying vec4 vColor;
varying float vFog;
uniform vec3 uFogColor;
void main() {
  vec3 c = mix(vColor.rgb, uFogColor, vFog);
  gl_FragColor = vec4(c, vColor.a);
}
`;
