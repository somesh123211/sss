attribute vec3 position;
attribute vec2 st;

uniform mat4 u_modelViewProjection;

varying vec2 v_st;
varying vec3 v_position;

void main() {
    v_st = st;
    v_position = position;
    gl_Position = u_modelViewProjection * vec4(position, 1.0);
}
