// ===== CONFIGURATION =====
const BASE_HEIGHT    = 224;
const widescreen     = false;
const BASE_WIDTH     = widescreen ? 384 : 256;
const FRAME_DURATION = 1000 / 60; // 60 FPS
let useCRT           = false;
let WALK_SPEED       = 1.5;
let DIAGONAL_SPEED   = 1;           // hard‐lock to 1px per axis

// ===== SETUP CANVAS =====
const gameCanvas = document.createElement("canvas");
gameCanvas.width  = BASE_WIDTH;
gameCanvas.height = BASE_HEIGHT;
const ctx = gameCanvas.getContext("2d");
document.body.style.cssText = "margin:0;overflow:hidden;background:#000";
document.body.appendChild(gameCanvas);

function resizeCanvas() {
  const scale = Math.min(
    window.innerWidth  / BASE_WIDTH,
    window.innerHeight / BASE_HEIGHT
  );
  Object.assign(gameCanvas.style, {
    width:    `${BASE_WIDTH * scale}px`,
    height:   `${BASE_HEIGHT * scale}px`,
    position: `absolute`,
    left:     `${(window.innerWidth  - BASE_WIDTH  * scale) / 2}px`,
    top:      `${(window.innerHeight - BASE_HEIGHT * scale) / 2}px`
  });
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// ===== GLOBAL STATE =====
let playerX = 100,
    playerY = 100;
let walkFrame = 0,
    walkTimer = 0;
let direction = "down";
let straightStepToggle = false;   // ← toggle for straight steps
const keys = {};
const directionMap = {
  down:0, "down-right":1, right:2, "up-right":3,
  up:4, "up-left":5, left:6, "down-left":7
};

// ===== LOAD IMAGES =====
const assets = {
  map:       new Image(),
  collision: new Image(),
  player:    new Image()
};
assets.map.src       = "assets/map.png";
assets.collision.src = "assets/collision.png";
assets.player.src    = "assets/player.png";

// collision offscreen cache
const collisionCanvas = document.createElement("canvas");
const collisionCtx    = collisionCanvas.getContext("2d");
assets.collision.onload = () => {
  collisionCanvas.width  = assets.collision.width;
  collisionCanvas.height = assets.collision.height;
  collisionCtx.drawImage(assets.collision, 0, 0);
};

// ===== INPUT =====
window.addEventListener("keydown", e => keys[e.key] = true);
window.addEventListener("keyup",   e => keys[e.key] = false);

// ===== UTILITIES: per-pixel check (temporary) =====
function getCollisionPixel(x, y) {
  const tempCanvas = document.createElement("canvas");
  const tempCtx    = tempCanvas.getContext("2d");
  tempCanvas.width  = assets.collision.width;
  tempCanvas.height = assets.collision.height;
  tempCtx.drawImage(assets.collision, 0, 0);
  return tempCtx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
}
function isWalkable(x, y) {
  if (!assets.collision.complete) return true;
  return getCollisionPixel(x, y)[0] > 127;
}

// ===== UPDATE + RENDER =====
function update() {
  const dx = (keys.ArrowRight|0) - (keys.ArrowLeft|0);
  const dy = (keys.ArrowDown |0) - (keys.ArrowUp  |0);

  if (dx || dy) {
    // set direction
    if (dx>0 && dy>0)       direction = "down-right";
    else if (dx>0 && dy<0)  direction = "up-right";
    else if (dx<0 && dy>0)  direction = "down-left";
    else if (dx<0 && dy<0)  direction = "up-left";
    else if (dx>0)          direction = "right";
    else if (dx<0)          direction = "left";
    else if (dy>0)          direction = "down";
    else                    direction = "up";

    // compute integer step
    let stepX = 0, stepY = 0;
    if (dx && dy) {
      // diagonal: always 1px each axis
      stepX = dx * DIAGONAL_SPEED;
      stepY = dy * DIAGONAL_SPEED;
    } else {
      // straight: toggle between 1px/2px
      straightStepToggle = !straightStepToggle;
      const s = straightStepToggle ? 2 : 1;
      stepX = dx * s;
      stepY = dy * s;
    }

    const nx = playerX + stepX;
    const ny = playerY + stepY;
    if (isWalkable(nx, ny)) {
      playerX = nx;
      playerY = ny;
      walkTimer++;
      if (walkTimer >= 8) {
        walkTimer = 0;
        walkFrame = (walkFrame === 1 ? 2 : 1);
      }
    }

  } else {
    // idle
    walkTimer = 0;
    walkFrame = 0;
  }
}

function renderWorld() {
  const ox = BASE_WIDTH/2  - playerX;
  const oy = BASE_HEIGHT/2 - playerY;
  ctx.drawImage(assets.map, ox, oy);
}

function renderPlayer() {
  if (!assets.player.complete) return;
  const cx = BASE_WIDTH/2 - 16;
  const cy = BASE_HEIGHT/2 - 16;
  const sx = walkFrame * 32;
  const sy = directionMap[direction] * 32;
  ctx.drawImage(assets.player, sx, sy, 32, 32, cx, cy, 32, 32);
}

function render() {
  ctx.clearRect(0, 0, BASE_WIDTH, BASE_HEIGHT);
  renderWorld();
  renderPlayer();
}

// ===== GAME LOOP =====
function loop() {
  update();
  render();
  setTimeout(loop, FRAME_DURATION);
}

// start when all assets are loaded
Promise.all(
  Object.values(assets).map(img =>
    img.complete ? Promise.resolve() : new Promise(r => img.onload = r)
  )
).then(loop);

// CRT stuff
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
