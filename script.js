// ===== CONFIGURATION =====
const BASE_HEIGHT = 224;
const widescreen = false;
const BASE_WIDTH = widescreen ? 384 : 256;
const FRAME_DURATION = 1000 / 60; // 60 FPS
const useCRT = false; // Toggle this to enable/disable CRT shader
let WALK_SPEED = 1.5;
let DIAGONAL_SPEED = 1;

// ===== GAME CANVAS SETUP =====
let gameCanvas, ctx;
if (!useCRT) {
  gameCanvas = document.createElement("canvas");
  gameCanvas.width = BASE_WIDTH;
  gameCanvas.height = BASE_HEIGHT;
  ctx = gameCanvas.getContext("2d");
  document.body.style.margin = "0";
  document.body.style.overflow = "hidden";
  document.body.style.backgroundColor = "black";
  document.body.appendChild(gameCanvas);

  function resizeCanvas() {
    const scaleX = window.innerWidth / BASE_WIDTH;
    const scaleY = window.innerHeight / BASE_HEIGHT;
    const scale = Math.min(scaleX, scaleY);

    gameCanvas.style.width = `${BASE_WIDTH * scale}px`;
    gameCanvas.style.height = `${BASE_HEIGHT * scale}px`;
    gameCanvas.style.position = "absolute";
    gameCanvas.style.left = `${(window.innerWidth - BASE_WIDTH * scale) / 2}px`;
    gameCanvas.style.top = `${(window.innerHeight - BASE_HEIGHT * scale) / 2}px`;
  }
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();
} else {
  // Offscreen canvas for CRT rendering
  gameCanvas = document.createElement("canvas");
  gameCanvas.style.display = "none";
  gameCanvas.width = BASE_WIDTH;
  gameCanvas.height = BASE_HEIGHT;
  ctx = gameCanvas.getContext("2d");
}

// ===== GLOBAL STATE =====
let playerx = 100;
let playery = 100;
const keys = {};

const mapImage = new Image();
mapImage.crossOrigin = "anonymous";
mapImage.src = "map.png";

const collisionImage = new Image();
collisionImage.crossOrigin = "anonymous";
collisionImage.src = "collision.png"; // Black = solid, White = walkable

// ===== INPUT HANDLING =====
window.addEventListener("keydown", e => keys[e.key] = true);
window.addEventListener("keyup", e => keys[e.key] = false);

// ===== UTILS =====
function getCollisionPixel(x, y) {
  const tempCanvas = document.createElement("canvas");
  const tempCtx = tempCanvas.getContext("2d");
  tempCanvas.width = collisionImage.width;
  tempCanvas.height = collisionImage.height;
  tempCtx.drawImage(collisionImage, 0, 0);
  return tempCtx.getImageData(x, y, 1, 1).data;
}

function isWalkable(x, y) {
  if (!collisionImage.complete) return true; // No collision yet
  const pixel = getCollisionPixel(Math.floor(x), Math.floor(y));
  return pixel[0] > 127; // Treat dark pixels as blocked
}

let walkFrameToggle = false;

function update() {
  let dx = 0;
  let dy = 0;

  if (keys["ArrowUp"]) dy -= 1;
  if (keys["ArrowDown"]) dy += 1;
  if (keys["ArrowLeft"]) dx -= 1;
  if (keys["ArrowRight"]) dx += 1;

  let isDiagonal = dx !== 0 && dy !== 0;

  if (isDiagonal) {
    dx *= DIAGONAL_SPEED;
    dy *= DIAGONAL_SPEED;
  } else if (dx !== 0 || dy !== 0) {
    const speed = walkFrameToggle ? (WALK_SPEED * 2) * 2/3 : (WALK_SPEED * 2) * 1/3;
    dx *= speed;
    dy *= speed;
  }
  walkFrameToggle = !walkFrameToggle;

  let nextX = playerx + dx;
  let nextY = playery + dy;

  if (isWalkable(nextX, nextY)) {
    playerx = nextX;
    playery = nextY;
  }
}

function renderWorld() {
  const offsetX = BASE_WIDTH / 2 - playerx;
  const offsetY = BASE_HEIGHT / 2 - playery;
  ctx.drawImage(mapImage, offsetX, offsetY);
}

function renderPlayer() {
  const centerX = BASE_WIDTH / 2;
  const centerY = BASE_HEIGHT / 2;
  ctx.fillStyle = "red";
  ctx.fillRect(centerX - 8, centerY - 8, 16, 16);
}

function render() {
  ctx.clearRect(0, 0, BASE_WIDTH, BASE_HEIGHT);
  renderWorld();
  renderPlayer();
}

let lastFrameTime = 0;
function gameLoop(timestamp) {
  if (timestamp - lastFrameTime >= FRAME_DURATION) {
    update();
    render();
    lastFrameTime = timestamp;
  }
  requestAnimationFrame(gameLoop);
}

let assetsLoaded = 0;
function checkAssets() {
  assetsLoaded++;
  if (assetsLoaded === 2) requestAnimationFrame(gameLoop);
}
mapImage.onload = checkAssets;
collisionImage.onload = checkAssets;

// ===== CRT SHADER SETUP =====
if (useCRT) {
  const crtCanvas = document.createElement("canvas");
  crtCanvas.id = "crtCanvas";
  document.body.appendChild(crtCanvas);

  const gl = crtCanvas.getContext("webgl");
  const vertexShaderSource = `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    varying vec2 v_texCoord;
    void main() {
      gl_Position = vec4(a_position, 0, 1);
      v_texCoord = a_texCoord;
    }
  `;

  const fragmentShaderSource = `
    precision mediump float;
    varying vec2 v_texCoord;
    uniform sampler2D u_texture;
    void main() {
      vec4 color = texture2D(u_texture, v_texCoord);
      float scanline = sin(v_texCoord.y * 224.0 * 3.14159) * 0.1;
      color.rgb -= scanline;
      gl_FragColor = color;
    }
  `;

  function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
  }

  function createProgram(gl, vsSource, fsSource) {
    const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    return program;
  }

  const program = createProgram(gl, vertexShaderSource, fragmentShaderSource);
  const positionLoc = gl.getAttribLocation(program, "a_position");
  const texCoordLoc = gl.getAttribLocation(program, "a_texCoord");
  const textureLoc = gl.getUniformLocation(program, "u_texture");

  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      -1, -1, 1, -1, -1, 1,
      -1, 1, 1, -1, 1, 1,
    ]),
    gl.STATIC_DRAW
  );

  const texCoordBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      0, 1, 1, 1, 0, 0,
      0, 0, 1, 1, 1, 0,
    ]),
    gl.STATIC_DRAW
  );

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const originalRender = render;
  render = function () {
    originalRender();

    // Maintain aspect ratio scaling
    const scaleX = window.innerWidth / BASE_WIDTH;
    const scaleY = window.innerHeight / BASE_HEIGHT;
    const scale = Math.min(scaleX, scaleY);

    crtCanvas.width = BASE_WIDTH * scale;
    crtCanvas.height = BASE_HEIGHT * scale;
    crtCanvas.style.width = `${crtCanvas.width}px`;
    crtCanvas.style.height = `${crtCanvas.height}px`;
    crtCanvas.style.position = "absolute";
    crtCanvas.style.left = `${(window.innerWidth - crtCanvas.width) / 2}px`;
    crtCanvas.style.top = `${(window.innerHeight - crtCanvas.height) / 2}px`;

    gl.viewport(0, 0, crtCanvas.width, crtCanvas.height);


    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      gameCanvas
    );

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);

    gl.enableVertexAttribArray(positionLoc);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

    gl.enableVertexAttribArray(texCoordLoc);
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, 0, 0);

    gl.uniform1i(textureLoc, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };
}
