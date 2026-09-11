precision highp float;

uniform sampler2D u_colormap;
uniform float u_opacity;
uniform float u_minVal;
uniform float u_maxVal;

varying vec2 v_st;
varying vec3 v_position;

void main() {
    // Normalization and sample
    float norm = clamp((v_position.z - u_minVal) / max(0.001, u_maxVal - u_minVal), 0.0, 1.0);
    vec4 color = texture2D(u_colormap, vec2(norm, 0.5));
    gl_FragColor = vec4(color.rgb, color.a * u_opacity);
}
