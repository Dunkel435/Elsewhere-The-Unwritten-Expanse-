
(() => {
"use strict";

const canvas = document.getElementById("world");
const ctx = canvas.getContext("2d", { alpha: false });

const brush = document.getElementById("brush");
const brushValue = document.getElementById("brushValue");
const pauseButton = document.getElementById("pause");
const status = document.getElementById("status");
const message = document.getElementById("message");

const CELL = 5;
const W = 180;
const H = 100;

const EMPTY = 0;
const SAND = 1;
const WATER = 2;
const STONE = 3;
const FIRE = 4;
const PLANT = 5;

const COLORS = {
  [SAND]: [236, 190, 91],
  [WATER]: [69, 157, 255],
  [STONE]: [133, 137, 158],
  [FIRE]: [255, 105, 48],
  [PLANT]: [83, 211, 126]
};

let world = new Uint8Array(W * H);
let updated = new Uint8Array(W * H);
let fireAge = new Uint8Array(W * H);

let paused = false;
let selected = SAND;
let pointerDown = false;

const index = (x, y) => y * W + x;
const inside = (x, y) => x >= 0 && x < W && y >= 0 && y < H;

const buffer = document.createElement("canvas");
buffer.width = W;
buffer.height = H;
const bufferCtx = buffer.getContext("2d");

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));

  draw();
}

function draw() {
  const image = bufferCtx.createImageData(W, H);
  const pixels = image.data;

  for (let i = 0; i < world.length; i++) {
    const p = i * 4;
    const type = world[i];

    if (type === EMPTY) {
      pixels[p] = 10;
      pixels[p + 1] = 9;
      pixels[p + 2] = 25;
    } else {
      const color = COLORS[type];
      const variation = ((i * 17) % 17) - 8;

      pixels[p] = Math.max(0, Math.min(255, color[0] + variation));
      pixels[p + 1] = Math.max(0, Math.min(255, color[1] + variation));
      pixels[p + 2] = Math.max(0, Math.min(255, color[2] + variation));
    }

    pixels[p + 3] = 255;
  }

  bufferCtx.putImageData(image, 0, 0);

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#0a0919";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(buffer, 0, 0, canvas.width, canvas.height);
}

function swap(a, b) {
  const temp = world[a];
  world[a] = world[b];
  world[b] = temp;

  const age = fireAge[a];
  fireAge[a] = fireAge[b];
  fireAge[b] = age;

  updated[a] = 1;
  updated[b] = 1;
}

function hasWaterNearby(x, y) {
  const neighbours = [
    [x, y - 1],
    [x - 1, y],
    [x + 1, y],
    [x, y + 1]
  ];

  return neighbours.some(([nx, ny]) =>
    inside(nx, ny) && world[index(nx, ny)] === WATER
  );
}

function moveDown(x, y, type) {
  const from = index(x, y);
  if (y + 1 >= H) return false;

  const below = index(x, y + 1);

  if (world[below] === EMPTY) {
    swap(from, below);
    return true;
  }

  if (type === SAND && world[below] === WATER) {
    swap(from, below);
    return true;
  }

  return false;
}

function simulateFire(x, y, i) {
  // Water extinguishes nearby fire.
  if (hasWaterNearby(x, y)) {
    world[i] = EMPTY;
    fireAge[i] = 0;
    updated[i] = 1;
    return;
  }

  // Flames eventually burn out.
  fireAge[i]++;

  if (fireAge[i] > 35) {
    world[i] = EMPTY;
    fireAge[i] = 0;
    updated[i] = 1;
    return;
  }

  const neighbours = [
    [x, y - 1],
    [x - 1, y],
    [x + 1, y],
    [x, y + 1]
  ];

  // Fire can ignite plants.
  for (const [nx, ny] of neighbours) {
    if (!inside(nx, ny)) continue;

    const ni = index(nx, ny);

    if (world[ni] === PLANT && Math.random() < 0.09) {
      world[ni] = FIRE;
      fireAge[ni] = 0;
      updated[ni] = 1;
    }
  }

  // Flames rise through empty space.
  if (y > 0 && Math.random() < 0.12) {
    const above = index(x, y - 1);

    if (world[above] === EMPTY) {
      swap(i, above);
    }
  }
}

function simulateCell(x, y) {
  const i = index(x, y);
  const type = world[i];

  if (type === EMPTY || updated[i]) return;

  if (type === SAND || type === WATER) {
    if (moveDown(x, y, type)) return;

    const directions = Math.random() < 0.5 ? [-1, 1] : [1, -1];

    for (const dx of directions) {
      const nx = x + dx;

      if (!inside(nx, y + 1)) continue;

      const diagonal = index(nx, y + 1);

      if (
        world[diagonal] === EMPTY ||
        (type === SAND && world[diagonal] === WATER)
      ) {
        swap(i, diagonal);
        return;
      }
    }

    if (type === WATER && Math.random() < 0.7) {
      for (const dx of directions) {
        const nx = x + dx;

        if (inside(nx, y) && world[index(nx, y)] === EMPTY) {
          swap(i, index(nx, y));
          return;
        }
      }
    }
  }

  if (type === FIRE) {
    simulateFire(x, y, i);
  }

  if (type === PLANT) {
    if (Math.random() < 0.025 && y > 0) {
      const above = index(x, y - 1);

      const nearbyWater =
        (x > 0 && world[index(x - 1, y)] === WATER) ||
        (x < W - 1 && world[index(x + 1, y)] === WATER) ||
        (y < H - 1 && world[index(x, y + 1)] === WATER);

      if (nearbyWater && world[above] === EMPTY) {
        world[above] = PLANT;
        updated[above] = 1;
      }
    }
  }
}

function simulate() {
  updated.fill(0);

  for (let y = H - 1; y >= 0; y--) {
    const leftToRight = Math.random() < 0.5;

    for (let n = 0; n < W; n++) {
      const x = leftToRight ? n : W - 1 - n;
      simulateCell(x, y);
    }
  }
}

function paint(event) {
  const rect = canvas.getBoundingClientRect();

  const x = Math.floor((event.clientX - rect.left) / rect.width * W);
  const y = Math.floor((event.clientY - rect.top) / rect.height * H);
  const size = Number(brush.value);

  for (let dy = -size; dy <= size; dy++) {
    for (let dx = -size; dx <= size; dx++) {
      if (dx * dx + dy * dy > size * size) continue;

      const nx = x + dx;
      const ny = y + dy;

      if (!inside(nx, ny)) continue;

      const i = index(nx, ny);

      if (selected === -1) {
        // Eraser removes every material.
        world[i] = EMPTY;
        fireAge[i] = 0;
      } else if (selected === FIRE) {
        // Fire cannot overwrite water, stone or sand.
        if (world[i] === EMPTY || world[i] === PLANT) {
          world[i] = FIRE;
          fireAge[i] = 0;
        }
      } else if (world[i] === EMPTY) {
        world[i] = selected;
      }
    }
  }

  draw();
}

function createStartingWorld() {
  world.fill(EMPTY);
  fireAge.fill(0);

  // Create an original landscape with several sand formations.
  for (let x = 0; x < W; x++) {
    const hill1 = Math.max(0, 17 - Math.abs(x - 38) * 0.55);
    const hill2 = Math.max(0, 8 - Math.abs(x - 100) * 0.5);
    const hill3 = Math.max(0, 13 - Math.abs(x - 150) * 0.5);

    const surface = Math.floor(90 - hill1 - hill2 - hill3);

    for (let y = surface; y < H; y++) {
      world[index(x, y)] = SAND;
    }
  }

  // Add a shallow starting pool where the basin is low.
  for (let x = 62; x < 126; x++) {
    for (let y = 82; y < 89; y++) {
      const i = index(x, y);

      if (world[i] === EMPTY) {
        world[i] = WATER;
      }
    }
  }

  updated.fill(0);
}

function loop() {
  if (!paused) {
    simulate();
    draw();
  }

  requestAnimationFrame(loop);
}

// MATERIAL SELECTION
document.getElementById("materials").addEventListener("click", event => {
  const button = event.target.closest("[data-material]");
  if (!button) return;

  const materials = {
    sand: SAND,
    water: WATER,
    stone: STONE,
    fire: FIRE,
    plant: PLANT,
    erase: -1
  };

  selected = materials[button.dataset.material];

  document.querySelectorAll(".material").forEach(item => {
    item.classList.toggle("selected", item === button);
  });

  message.textContent = button.dataset.material === "erase"
    ? "Eraser selected. Remove any material from the basin."
    : button.dataset.material + " selected. Draw anywhere in the basin.";
});

// DRAWING
canvas.addEventListener("pointerdown", event => {
  pointerDown = true;
  canvas.setPointerCapture(event.pointerId);
  paint(event);
});

canvas.addEventListener("pointermove", event => {
  if (pointerDown) paint(event);
});

canvas.addEventListener("pointerup", () => {
  pointerDown = false;
});

canvas.addEventListener("pointercancel", () => {
  pointerDown = false;
});

canvas.addEventListener("lostpointercapture", () => {
  pointerDown = false;
});

// BRUSH
brush.addEventListener("input", () => {
  brushValue.textContent = brush.value;
});

// PAUSE / RESUME
pauseButton.addEventListener("click", () => {
  paused = !paused;

  pauseButton.textContent = paused ? "▶ Resume" : "Ⅱ Pause";
  status.textContent = paused ? "WORLD PAUSED" : "WORLD ACTIVE";

  message.textContent = paused
    ? "Time has stopped. Your world is waiting."
    : "The elements are moving again.";
});

// CLEAR: completely empty world, preserving current controls.
document.getElementById("clear").addEventListener("click", () => {
  world.fill(EMPTY);
  fireAge.fill(0);
  updated.fill(0);

  draw();
  message.textContent = "The basin is now completely empty.";
});

// RESET: restore the original landscape and controls.
document.getElementById("reset").addEventListener("click", () => {
  createStartingWorld();

  paused = false;
  selected = SAND;

  pauseButton.textContent = "Ⅱ Pause";
  status.textContent = "WORLD ACTIVE";

  document.querySelectorAll(".material").forEach(item => {
    item.classList.toggle("selected", item.dataset.material === "sand");
  });

  brush.value = 4;
  brushValue.textContent = "4";

  draw();
  message.textContent = "The original landscape has been restored.";
});

// INITIALIZE
createStartingWorld();

window.addEventListener("resize", resizeCanvas);

resizeCanvas();
loop();

})();
