"use strict";
const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
const icon = (name) => '<svg class="icon" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
const dialogs = $$("dialog");
const menu = $("#primary-nav");
const menuToggle = $("#menu-toggle");

function setMenu(open) {
  menu.classList.toggle("open", open);
  menuToggle.setAttribute("aria-expanded", String(open));
  menuToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  menuToggle.innerHTML = icon(open ? "close" : "menu");
}
menuToggle.addEventListener("click", () => setMenu(!menu.classList.contains("open")));
menu.addEventListener("click", () => setMenu(false));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setMenu(false);
});

function showDialog(dialog) {
  setMenu(false);
  for (const other of dialogs) if (other.open && other !== dialog) other.close();
  if (!dialog.open) dialog.showModal();
  document.body.classList.add("locked");
}
for (const dialog of dialogs) {
  dialog.addEventListener("close", () => {
    if (!dialogs.some((other) => other.open)) document.body.classList.remove("locked");
  });
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    )
      dialog.close();
  });
  $("[data-close]", dialog).addEventListener("click", () => dialog.close());
}
$("#nap-toggle").addEventListener("click", (event) => {
  const active = $("#polaroid").classList.toggle("sleeping");
  const toggle = event.currentTarget;
  toggle.setAttribute("aria-pressed", String(active));
  toggle.setAttribute("aria-label", active ? "Turn off nap mode" : "Turn on nap mode");
  toggle.innerHTML = icon(active ? "sun" : "moon") + "<span>" + (active ? "Day mode" : "Nap mode") + "</span>";
  $(".fig-name").textContent = active ? "Five more minutes…" : "Studio cover study";
});

const books = {
  pilates: {
    title: "Pilates, Please",
    pages: [
      { id: "reformer", title: "Reformer time" },
      { id: "ring", title: "The Pilates ring" },
      { id: "cooldown", title: "Post-class nap" },
    ],
  },
  naps: {
    title: "Capy Takes a Napy",
    pages: [
      { id: "picnic", title: "Picnic pause", page: 7 },
      { id: "pool", title: "Poolside snooze", page: 9 },
      { id: "hammock", title: "Hammock hours", page: 12 },
    ],
  },
};
let currentBook = books.pilates;
let scenes = currentBook.pages;
const pencils = [
  ["Terracotta", "#eaa080"],
  ["Matcha", "#a8c994"],
  ["Honey", "#f2d170"],
  ["Lilac", "#c6abd7"],
  ["Pool blue", "#9bcfdb"],
  ["Cocoa", "#b58968"],
  ["Petal pink", "#edb7c3"],
  ["Oat milk", "#f0e2c7"],
];
let selectedPencil = 0;
let sceneIndex = 0;
let paintVersion = 0;
let activeSheet = null;
const studio = $("#studio");
const canvas = $("#page-canvas");
const ctx = canvas.getContext("2d");
const sheets = new Map();
const colorsByScene = new Map(
  Object.values(books).flatMap((book) => book.pages.map((scene) => [scene.id, { fills: new Map(), undo: [] }])),
);
const spacePicker = $("#space-select");
const keyboardControls = $(".keyboard");
function selectPencil(index) {
  selectedPencil = index;
  $$(".swatch").forEach((button, i) => {
    button.setAttribute("aria-pressed", String(i === index));
    button.innerHTML = i === index ? icon("check") : "";
  });
  $("#pencil-name").textContent = pencils[index][0];
}
pencils.forEach(([name, color], index) => {
  const button = document.createElement("button");
  button.className = "swatch";
  button.setAttribute("aria-label", name);
  button.title = name;
  button.style.setProperty("--color", color);
  button.addEventListener("click", () => selectPencil(index));
  $("#swatches").append(button);
});
selectPencil(0);

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Page image could not load"));
    image.src = url;
  });
}
async function readSheet(id) {
  const [lineArt, regions] = await Promise.all([
    loadImage("art/" + id + ".webp"),
    loadImage("art/" + id + "-regions.png"),
  ]);
  const temp = document.createElement("canvas");
  temp.width = lineArt.width;
  temp.height = lineArt.height;
  const context = temp.getContext("2d", { willReadFrequently: true });
  const { width, height } = temp;
  context.drawImage(lineArt, 0, 0);
  const original = context.getImageData(0, 0, width, height);
  context.drawImage(regions, 0, 0);
  const mask = context.getImageData(0, 0, width, height).data;
  const ids = new Uint16Array(width * height);
  const counts = new Map();
  for (let pixel = 0; pixel < ids.length; pixel++) {
    const offset = pixel * 4;
    const number = mask[offset] + mask[offset + 1] * 256;
    ids[pixel] = number;
    if (number) counts.set(number, (counts.get(number) || 0) + 1);
  }
  const ordered = [...counts.keys()].sort((first, second) => counts.get(second) - counts.get(first));
  return { original, ids, ordered, width, height };
}
const paintRGB = pencils.map(([, hex]) => [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16)));
function paint(highlight = keyboardControls.open) {
  if (!activeSheet) return;
  const { original, ids, width, height } = activeSheet;
  const output = new ImageData(new Uint8ClampedArray(original.data), width, height);
  const { fills, undo } = colorsByScene.get(scenes[sceneIndex].id);
  const tint = highlight ? Number(spacePicker.value) : -1;
  for (let pixel = 0; pixel < ids.length; pixel++) {
    const id = ids[pixel];
    const color = id === tint ? [145, 211, 215] : paintRGB[fills.get(id)];
    if (!color) continue;
    const offset = pixel * 4;
    const shade = original.data[offset] / 255;
    for (let channel = 0; channel < 3; channel++) output.data[offset + channel] = shade * color[channel];
  }
  ctx.putImageData(output, 0, 0);
  $("#undo").disabled = !undo.length;
  $("#clear").disabled = !fills.size;
}
async function displayScene(index) {
  $("#export-panel").hidden = true;
  const version = ++paintVersion;
  sceneIndex = (index + scenes.length) % scenes.length;
  const scene = scenes[sceneIndex];
  activeSheet = null;
  $("#paint-loading").hidden = false;
  $("#paint-loading").textContent = "Opening page…";
  $("#scene-name").textContent = scene.title;
  $("#page-counter").textContent = sceneIndex + 1 + " of " + scenes.length;
  canvas.setAttribute("aria-label", scene.title + ", coloring page from " + currentBook.title);
  for (const id of ["undo", "clear", "save-art", "fill-space"]) $("#" + id).disabled = true;
  spacePicker.replaceChildren();
  if (!sheets.has(scene.id)) sheets.set(scene.id, readSheet(scene.id));
  try {
    const sheet = await sheets.get(scene.id);
    if (version !== paintVersion) return;
    activeSheet = sheet;
    canvas.width = sheet.width;
    canvas.height = sheet.height;
    const options = document.createDocumentFragment();
    sheet.ordered.forEach((value, rank) => options.append(new Option("Space " + (rank + 1), value)));
    spacePicker.append(options);
    paint();
    $("#paint-loading").hidden = true;
    $("#save-art").disabled = false;
    $("#fill-space").disabled = false;
  } catch {
    sheets.delete(scene.id);
    if (version === paintVersion)
      $("#paint-loading").textContent = "Couldn’t open this page. Try another page, then return.";
  }
}
function applyFill(id) {
  if (!activeSheet || !id) return;
  const state = colorsByScene.get(scenes[sceneIndex].id);
  if (state.fills.get(id) === selectedPencil) return;
  rememberPaint(state);
  state.fills.set(id, selectedPencil);
  paint(false);
  $("#studio-status").textContent = "Filled space with " + pencils[selectedPencil][0];
}
function rememberPaint(state) {
  $("#export-panel").hidden = true;
  state.undo.push(new Map(state.fills));
  if (state.undo.length > 60) state.undo.shift();
}
for (const button of $$("[data-scene]"))
  button.addEventListener("click", () => {
    currentBook = books[button.dataset.book || "pilates"];
    scenes = currentBook.pages;
    $("#coloring-book-name").textContent = currentBook.title;
    keyboardControls.open = false;
    showDialog(studio);
    displayScene(Number(button.dataset.scene));
  });
$("#prev").addEventListener("click", () => displayScene(sceneIndex - 1));
$("#next").addEventListener("click", () => displayScene(sceneIndex + 1));
canvas.addEventListener("click", (event) => {
  if (!activeSheet) return;
  const box = canvas.getBoundingClientRect();
  const x = Math.min(
    canvas.width - 1,
    Math.max(0, Math.floor(((event.clientX - box.left) * canvas.width) / box.width)),
  );
  const y = Math.min(
    canvas.height - 1,
    Math.max(0, Math.floor(((event.clientY - box.top) * canvas.height) / box.height)),
  );
  applyFill(activeSheet.ids[y * canvas.width + x]);
});
keyboardControls.addEventListener("toggle", () => paint());
spacePicker.addEventListener("change", () => paint());
$("#fill-space").addEventListener("click", () => applyFill(Number(spacePicker.value)));
$("#undo").addEventListener("click", () => {
  const state = colorsByScene.get(scenes[sceneIndex].id);
  if (!state.undo.length) return;
  $("#export-panel").hidden = true;
  state.fills = state.undo.pop();
  paint(false);
  $("#studio-status").textContent = "Undid last change";
});
$("#clear").addEventListener("click", () => {
  const state = colorsByScene.get(scenes[sceneIndex].id);
  if (!state.fills.size) return;
  rememberPaint(state);
  state.fills.clear();
  paint(false);
});
$("#save-art").addEventListener("click", () => {
  if (!activeSheet) return;
  paint(false);
  const url = canvas.toDataURL("image/png");
  const name = "Capy-Club-" + scenes[sceneIndex].id + ".png";
  const link = $("#download-page");
  link.href = url;
  link.download = name;
  $("#export-image").src = url;
  $("#export-panel").hidden = false;
  $("#studio-status").textContent = "Your PNG is ready to download";
  link.focus();
  paint();
});

const catalog = {
  "pilates-book": {
    name: "Pilates, Please",
    price: 12,
    detail: "Paperback coloring book",
    desc: "Join Capy for reformer time, a Pilates ring workout, and a post-class matcha. The mat makes a pretty good nap spot, too.",
  },
  "nap-book": {
    name: "Capy Takes a Napy",
    price: 12,
    detail: "Paperback coloring book",
    desc: "A picnic blanket, a pool lounger, a hammock. Color along as Capy finds the perfect spot for a snooze wherever the day leads.",
  },
  socks: {
    name: "Pilates Grip Socks",
    price: 10,
    detail: "Cream & matcha",
    desc: "Crew socks with a little Capy at the ankle and rows of grip dots underfoot for studio days.",
    sizes: ["S/M", "M/L"],
    defaultSize: "S/M",
  },
  towel: {
    name: "Pilates Hand Towel",
    price: 14,
    detail: "Matcha stripe",
    desc: "A striped hand towel with the Capy Club Pilates patch. Keep it beside your reformer during class.",
  },
  tee: {
    name: "Pilates Club Tee",
    price: 22,
    detail: "Oat milk · Cotton",
    desc: "A soft cream tee with Capy resting on a Pilates mat. Pull it on for the studio or your post-class matcha run.",
    sizes: ["S", "M", "L", "XL", "2XL"],
    defaultSize: "M",
  },
  tote: {
    name: "Studio Canvas Tote",
    price: 16,
    detail: "Natural canvas · Moss handles",
    desc: "A canvas tote with green handles and the Capy Club Pilates print. Pack your grip socks, studio towel, and coloring book.",
  },
};
const bagKey = "capy-club-bag-v1";
const bagDialog = $("#bag-dialog");
const itemDialog = $("#product-dialog");
let bag = [];
let currentProduct = null;
const money = (value) => "$" + value.toFixed(2);
function loadBag() {
  try {
    const saved = JSON.parse(localStorage.getItem(bagKey) || "[]");
    if (!Array.isArray(saved)) return [];
    return saved.filter(
      (item) =>
        item &&
        Object.hasOwn(catalog, item.id) &&
        Number.isSafeInteger(item.qty) &&
        item.qty > 0 &&
        item.qty <= 99 &&
        (catalog[item.id].sizes ? catalog[item.id].sizes.includes(item.size) : item.size === "One size"),
    );
  } catch {
    return [];
  }
}
function syncCount() {
  const count = bag.reduce((sum, item) => sum + item.qty, 0);
  $("#bag-count").textContent = count;
  $("#bag-open").setAttribute("aria-label", "Open bag, " + count + (count === 1 ? " item" : " items"));
}
function saveBag() {
  try {
    localStorage.setItem(bagKey, JSON.stringify(bag));
  } catch {}
  syncCount();
}
bag = loadBag();
syncCount();
window.addEventListener("storage", (event) => {
  if (event.key === bagKey || event.key === null) {
    bag = loadBag();
    syncCount();
    if (bagDialog.open) renderBag();
  }
});
for (const button of $$("[data-product]"))
  button.addEventListener("click", () => {
    const id = button.dataset.product;
    currentProduct = id;
    const item = catalog[id];
    $("#item-image").src = "art/" + id + ".webp";
    $("#item-image").alt = item.name + " with the Capy Club logo";
    $("#item-title").textContent = item.name;
    $("#item-desc").textContent = item.desc;
    $("#item-price").textContent = money(item.price);
    $("#size-field").hidden = !item.sizes;
    $(".sizes").innerHTML = (item.sizes || [])
      .map(
        (size) =>
          '<input class="sr-only" id="size-' +
          size +
          '" name="size" type="radio" value="' +
          size +
          '"' +
          (size === item.defaultSize ? " checked" : "") +
          '><label for="size-' +
          size +
          '">' +
          size +
          "</label>",
      )
      .join("");
    showDialog(itemDialog);
  });
$("#add-item").addEventListener("click", () => {
  const size = catalog[currentProduct].sizes ? $('input[name="size"]:checked').value : "One size";
  addToBag(currentProduct, size);
});
for (const button of $$("[data-add-book]")) {
  button.addEventListener("click", () => addToBag(button.dataset.addBook, "One size"));
}
function addToBag(id, size) {
  const previous = bag.find((item) => item.id === id && item.size === size);
  if (previous) previous.qty = Math.min(99, previous.qty + 1);
  else bag.push({ id: id, size, qty: 1 });
  saveBag();
  renderBag();
  showDialog(bagDialog);
}
$("#bag-open").addEventListener("click", () => {
  renderBag();
  showDialog(bagDialog);
});
function renderBag(review = false) {
  const body = $("#bag-body");
  $("#bag-title").textContent = review ? "Order preview." : "Your bag.";
  if (!bag.length) {
    body.innerHTML =
      '<div class="bag-empty">' +
      icon("bag") +
      '<h3>A very light bag.</h3><p>Pick out something for your next slow day.</p><a class="btn btn-coral" href="#books" data-browse>Browse the books ' +
      icon("arrow") +
      "</a></div>";
    return;
  }
  const rows = bag
    .map(({ id, size, qty }, index) => {
      const item = catalog[id];
      const controls =
        '<div class="qty"><button aria-label="Decrease quantity of ' +
        item.name +
        '" data-change="-1" data-index="' +
        index +
        '">' +
        icon("minus") +
        "</button><span>" +
        qty +
        '</span><button aria-label="Increase quantity of ' +
        item.name +
        '" data-change="1" data-index="' +
        index +
        '"' +
        (qty >= 99 ? " disabled" : "") +
        ">" +
        icon("plus") +
        "</button></div>";
      const remove =
        '<button class="remove" data-remove="' + index + '" aria-label="Remove ' + item.name + '">Remove</button>';
      return (
        '<div class="bag-row"><img src="art/' +
        id +
        '.webp" alt=""><div><strong>' +
        item.name +
        "</strong><small>" +
        (item.sizes ? "Size " + size : item.detail) +
        "</small>" +
        (review ? "<small>Quantity " + qty + "</small>" : controls) +
        '</div><div class="bag-last">' +
        money(item.price * qty) +
        (review ? "" : remove) +
        "</div></div>"
      );
    })
    .join("");
  const total = bag.reduce((sum, item) => sum + catalog[item.id].price * item.qty, 0);
  const subtotal = '<div class="total"><span>Subtotal</span><span>' + money(total) + "</span></div>";
  const actions = review
    ? '<div class="receipt"><div class="eyebrow">Demo checkout</div><p>This is a preview of your items at sample prices. No order has been placed and no payment has been collected.</p></div><p><button class="text-link" data-edit>Back to bag</button></p>'
    : '<button class="btn btn-coral" data-review>Preview checkout ' +
      icon("arrow") +
      '</button><p class="bag-notice">Demo checkout · Sample prices</p>';
  body.innerHTML = rows + subtotal + actions;
}
$("#bag-body").addEventListener("click", (event) => {
  const target = event.target.closest("button, a");
  if (!target) return;
  if (target.hasAttribute("data-browse")) {
    bagDialog.close();
    return;
  }
  if (target.hasAttribute("data-review")) {
    renderBag(true);
    $("[data-edit]").focus();
    return;
  }
  if (target.hasAttribute("data-edit")) {
    renderBag();
    $("[data-review]").focus();
    return;
  }
  const remove = target.hasAttribute("data-remove");
  if (!remove && !target.hasAttribute("data-change")) return;
  const index = Number(remove ? target.dataset.remove : target.dataset.index);
  if (remove) bag.splice(index, 1);
  else {
    bag[index].qty = Math.min(99, bag[index].qty + Number(target.dataset.change));
    if (bag[index].qty <= 0) bag.splice(index, 1);
  }
  saveBag();
  renderBag();
  const next =
    $('#bag-body [data-index="' + index + '"][data-change="' + (target.dataset.change || "1") + '"]') ||
    $("#bag-body button, #bag-body a");
  if (next) next.focus();
});
