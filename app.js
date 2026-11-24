"use strict";

// ---------------------------------------------------------------------------
// Site links. Fill these in as they go live; anything left empty stays hidden.
// ---------------------------------------------------------------------------
const SITE = {
  amazonPilates: "", // Amazon listing for Pilates, Please
  amazonNaps: "", // Amazon listing for Capy Takes a Napy (once it's out)
  instagram: "", // e.g. "https://instagram.com/capyclub"
  email: "", // studio inquiries and "notify me" requests open a pre-filled email to this address
  formEndpoint: "", // optional: a form service URL (Formspree, Basin, etc.) that accepts JSON POSTs
};

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
  $(".fig-name").textContent = active ? "Five more minutes…" : "At the front desk";
});

// Hero photo: tilt toward the cursor and pan the image slightly (mouse only, respects reduced motion).
const heroArt = $(".hero-art");
const polaroid = $("#polaroid");
if (matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)").matches) {
  heroArt.addEventListener("pointermove", (event) => {
    const box = heroArt.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width - 0.5;
    const y = (event.clientY - box.top) / box.height - 0.5;
    polaroid.style.setProperty("--tilt-y", (x * 7).toFixed(2) + "deg");
    polaroid.style.setProperty("--tilt-x", (-y * 6).toFixed(2) + "deg");
    polaroid.style.setProperty("--pan-x", (-x * 10).toFixed(1) + "px");
    polaroid.style.setProperty("--pan-y", (-y * 8).toFixed(1) + "px");
  });
  heroArt.addEventListener("pointerleave", () => {
    for (const name of ["--tilt-x", "--tilt-y", "--pan-x", "--pan-y"]) polaroid.style.removeProperty(name);
  });
}

for (const link of $$("[data-link]")) {
  const value = SITE[link.dataset.link];
  if (!value) continue;
  link.href = link.dataset.link === "email" ? "mailto:" + value : value;
  link.hidden = false;
}

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
      { id: "picnic", title: "Picnic pause" },
      { id: "pool", title: "Poolside snooze" },
      { id: "hammock", title: "Hammock hours" },
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
const colorsKey = "capy-club-colors-v1";
const colorsByScene = new Map(
  Object.values(books).flatMap((book) => book.pages.map((scene) => [scene.id, { fills: new Map(), undo: [] }])),
);
function loadColors() {
  try {
    const saved = JSON.parse(localStorage.getItem(colorsKey) || "{}");
    for (const [sceneId, pairs] of Object.entries(saved)) {
      const state = colorsByScene.get(sceneId);
      if (!state || !Array.isArray(pairs)) continue;
      for (const pair of pairs) {
        if (!Array.isArray(pair)) continue;
        const [region, pencil] = pair;
        if (Number.isInteger(region) && region > 0 && region < 65536 && pencils[pencil]) state.fills.set(region, pencil);
      }
    }
  } catch {}
}
function saveColors() {
  const data = {};
  for (const [sceneId, state] of colorsByScene) if (state.fills.size) data[sceneId] = [...state.fills];
  try {
    localStorage.setItem(colorsKey, JSON.stringify(data));
  } catch {}
}
loadColors();

const spacePicker = $("#space-select");
const keyboardControls = $(".keyboard");
const loadingPanel = $("#paint-loading");
const loadingText = $("#paint-loading-text");
const retryButton = $("#retry-page");
let hoverRegion = 0;
let paintQueued = false;
let exportUrl = "";

function selectPencil(index) {
  selectedPencil = index;
  $$(".swatch").forEach((button, i) => {
    button.setAttribute("aria-pressed", String(i === index));
    button.innerHTML = i === index ? icon("check") : "";
  });
  $("#pencil-name").textContent = pencils[index][0];
  if (hoverRegion) paint();
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
const keyboardTint = [145, 211, 215];

// preview: show the keyboard-selected space, or a light wash of the current pencil on the hovered space.
function paint({ preview = true } = {}) {
  if (!activeSheet) return;
  const { original, ids, width, height } = activeSheet;
  const output = new ImageData(new Uint8ClampedArray(original.data), width, height);
  const { fills, undo } = colorsByScene.get(scenes[sceneIndex].id);
  let tint = -1;
  let tintColor = keyboardTint;
  if (preview && keyboardControls.open) tint = Number(spacePicker.value);
  else if (preview && hoverRegion) {
    tint = hoverRegion;
    tintColor = paintRGB[selectedPencil].map((channel) => Math.round(channel * 0.55 + 255 * 0.45));
  }
  for (let pixel = 0; pixel < ids.length; pixel++) {
    const id = ids[pixel];
    const color = id === tint ? tintColor : paintRGB[fills.get(id)];
    if (!color) continue;
    const offset = pixel * 4;
    const shade = original.data[offset] / 255;
    for (let channel = 0; channel < 3; channel++) output.data[offset + channel] = shade * color[channel];
  }
  ctx.putImageData(output, 0, 0);
  $("#undo").disabled = !undo.length;
  $("#clear").disabled = !fills.size;
}
function queuePaint() {
  if (paintQueued) return;
  paintQueued = true;
  requestAnimationFrame(() => {
    paintQueued = false;
    paint();
  });
}
async function displayScene(index) {
  $("#export-panel").hidden = true;
  const version = ++paintVersion;
  sceneIndex = (index + scenes.length) % scenes.length;
  const scene = scenes[sceneIndex];
  activeSheet = null;
  hoverRegion = 0;
  loadingPanel.hidden = false;
  loadingText.textContent = "Opening page…";
  retryButton.hidden = true;
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
    loadingPanel.hidden = true;
    $("#save-art").disabled = false;
    $("#fill-space").disabled = false;
  } catch {
    sheets.delete(scene.id);
    if (version !== paintVersion) return;
    loadingText.textContent = "Couldn’t open this page.";
    retryButton.hidden = false;
  }
}
retryButton.addEventListener("click", () => displayScene(sceneIndex));

function applyFill(id) {
  if (!activeSheet || !id) return;
  const state = colorsByScene.get(scenes[sceneIndex].id);
  if (state.fills.get(id) === selectedPencil) return;
  rememberPaint(state);
  state.fills.set(id, selectedPencil);
  saveColors();
  paint();
  $("#studio-status").textContent = "Filled space with " + pencils[selectedPencil][0];
}
function rememberPaint(state) {
  $("#export-panel").hidden = true;
  state.undo.push(new Map(state.fills));
  if (state.undo.length > 60) state.undo.shift();
}
function undo() {
  const state = colorsByScene.get(scenes[sceneIndex].id);
  if (!state.undo.length) return;
  $("#export-panel").hidden = true;
  state.fills = state.undo.pop();
  saveColors();
  paint();
  $("#studio-status").textContent = "Undid last change";
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

function regionAt(event) {
  const box = canvas.getBoundingClientRect();
  const x = Math.min(canvas.width - 1, Math.max(0, Math.floor(((event.clientX - box.left) * canvas.width) / box.width)));
  const y = Math.min(canvas.height - 1, Math.max(0, Math.floor(((event.clientY - box.top) * canvas.height) / box.height)));
  return activeSheet.ids[y * canvas.width + x];
}
canvas.addEventListener("click", (event) => {
  if (activeSheet) applyFill(regionAt(event));
});
canvas.addEventListener("pointermove", (event) => {
  if (!activeSheet || event.pointerType !== "mouse" || keyboardControls.open) return;
  const region = regionAt(event);
  if (region === hoverRegion) return;
  hoverRegion = region;
  canvas.style.cursor = region ? "pointer" : "default";
  queuePaint();
});
canvas.addEventListener("pointerleave", () => {
  if (!hoverRegion) return;
  hoverRegion = 0;
  queuePaint();
});
studio.addEventListener("keydown", (event) => {
  if (event.target.matches("input, select, textarea")) return;
  if (event.key === "ArrowLeft") displayScene(sceneIndex - 1);
  else if (event.key === "ArrowRight") displayScene(sceneIndex + 1);
  else if (event.key.toLowerCase() === "z" && (event.metaKey || event.ctrlKey) && !event.shiftKey) undo();
  else return;
  event.preventDefault();
});
keyboardControls.addEventListener("toggle", () => paint());
spacePicker.addEventListener("change", () => paint());
$("#fill-space").addEventListener("click", () => applyFill(Number(spacePicker.value)));
$("#undo").addEventListener("click", undo);
$("#clear").addEventListener("click", () => {
  const state = colorsByScene.get(scenes[sceneIndex].id);
  if (!state.fills.size) return;
  rememberPaint(state);
  state.fills.clear();
  saveColors();
  paint();
  $("#studio-status").textContent = "Cleared the page";
});
$("#save-art").addEventListener("click", () => {
  if (!activeSheet) return;
  const sceneId = scenes[sceneIndex].id;
  paint({ preview: false });
  canvas.toBlob((blob) => {
    paint();
    if (!blob) return;
    if (exportUrl) URL.revokeObjectURL(exportUrl);
    exportUrl = URL.createObjectURL(blob);
    const link = $("#download-page");
    link.href = exportUrl;
    link.download = "Capy-Club-" + sceneId + ".png";
    $("#export-image").src = exportUrl;
    $("#export-panel").hidden = false;
    $("#studio-status").textContent = "Your PNG is ready to download";
    link.focus();
  }, "image/png");
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
    ? '<div class="receipt"><div class="eyebrow">Checkout opens at launch</div><p>Here’s your order at planned retail prices. Online checkout isn’t open yet, so nothing has been charged. Your bag is saved on this device for when it is.</p></div><p><button class="text-link" data-edit>Back to bag</button></p>'
    : '<button class="btn btn-coral" data-review>Review order ' +
      icon("arrow") +
      '</button><p class="bag-notice">Planned retail prices · Checkout opens at launch</p>';
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

// ---------------------------------------------------------------------------
// Forms: studio inquiry and "notify me". Sent to SITE.formEndpoint if set,
// otherwise opened as a pre-filled email to SITE.email, otherwise a preview.
// ---------------------------------------------------------------------------
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
async function sendForm(subject, fields) {
  if (SITE.formEndpoint) {
    const response = await fetch(SITE.formEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ _subject: subject, ...fields }),
    });
    if (!response.ok) throw new Error("Form service returned " + response.status);
    return "sent";
  }
  if (SITE.email) {
    const body = Object.entries(fields)
      .map(([key, value]) => key + ": " + value)
      .join("\n");
    location.href =
      "mailto:" + SITE.email + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
    return "mail";
  }
  return "preview";
}
function checkForm(form) {
  let first = null;
  for (const field of form.querySelectorAll("input, select, textarea")) {
    const value = field.value.trim();
    const bad = (field.required && !value) || (field.type === "email" && value && !emailPattern.test(value));
    field.setAttribute("aria-invalid", String(bad));
    if (bad && !first) first = field;
  }
  if (first) first.focus();
  return !first;
}
function wireForm(form, subject, messages) {
  const status = $(".form-status", form);
  const submit = $('[type="submit"]', form);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    status.classList.remove("error");
    if (!checkForm(form)) {
      status.textContent = "Please fill in the highlighted fields.";
      status.classList.add("error");
      return;
    }
    const fields = Object.fromEntries(new FormData(form));
    submit.disabled = true;
    try {
      const result = await sendForm(subject(), fields);
      status.textContent = messages[result];
      if (result === "sent") form.reset();
    } catch {
      status.textContent = "That didn’t go through. Please try again in a moment.";
      status.classList.add("error");
    } finally {
      submit.disabled = false;
    }
  });
}
wireForm($("#studio-inquiry"), () => "Studio inquiry: " + $('#studio-inquiry [name="studio"]').value.trim(), {
  sent: "Thank you! We’ll be in touch within a few days.",
  mail: "Your email app should open with your inquiry ready to send.",
  preview: "Thanks! This preview doesn’t send inquiries yet, but your details look good.",
});
const notifyDialog = $("#notify-dialog");
let notifyTitle = "";
for (const button of $$("[data-notify]"))
  button.addEventListener("click", () => {
    notifyTitle = button.dataset.notify;
    $("#notify-title").textContent = notifyTitle;
    $(".form-status", notifyDialog).textContent = "";
    showDialog(notifyDialog);
  });
wireForm($("#notify-form"), () => "Notify me: " + notifyTitle, {
  sent: "You’re on the list. We’ll email you on release day.",
  mail: "Your email app should open with the request ready to send.",
  preview: "Thanks! This preview doesn’t collect emails yet, but sign-ups will work at launch.",
});

// ---------------------------------------------------------------------------
// "Watch Capy color in": a pinned section that colors page 01 as you scroll.
// Each space fills outward from where the pencil lands, with a grainy edge.
// Fill plan: [region id from reformer-regions.png, pencil index], in drawing order.
// ---------------------------------------------------------------------------
const COLOR_SHOW = {
  sceneId: "reformer",
  done: "All done. Your turn.",
  stages: [
    { caption: "First, the window.", fills: [[3, 4], [4, 4], [7, 4], [8, 4], [10, 2], [9, 7], [17, 7], [14, 7], [13, 4], [12, 4], [11, 4], [18, 4], [21, 4], [22, 4], [30, 4], [20, 4], [31, 4], [2, 1]] },
    { caption: "Then a little studio.", fills: [[1, 6], [15, 1], [19, 1], [23, 1], [26, 1], [27, 1], [25, 1], [28, 1], [6, 0], [5, 2]] },
    { caption: "Now the reformer.", fills: [[36, 2], [42, 2], [55, 2], [53, 2], [56, 2], [35, 2], [29, 2], [32, 7], [60, 5], [64, 5], [61, 5], [43, 5], [44, 5], [57, 5], [37, 0], [50, 7], [52, 7], [46, 7], [39, 0], [45, 0], [49, 0], [33, 3], [34, 3], [38, 3], [40, 3], [41, 3], [51, 3], [54, 3], [47, 5], [48, 5], [58, 0], [59, 0], [62, 6], [63, 6]] },
    { caption: "And finally, Capy.", fills: [[16, 5], [24, 6]] },
  ],
};
(function colorShow() {
  const section = $("#color-show");
  if (!section) return;
  const canvasEl = $(".color-canvas", section);
  const context = canvasEl.getContext("2d");
  const paper = $(".color-paper", section);
  const pencilEl = $(".color-pencil", section);
  const stepNum = $(".step-num", section);
  const stepText = $(".step-text", section);
  const countNow = $(".count-now", section);
  const bar = $(".meter-bar > span", section);
  const pencilNow = $(".pencil-now", section);
  const plan = COLOR_SHOW.stages.flatMap((stage, s) => stage.fills.map(([id, pencil]) => ({ id, pencil, stage: s })));
  $(".count-all", section).textContent = plan.length;
  const animated = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (animated) section.classList.add("is-live"); // tall pinned layout; otherwise a plain section
  const WINDOW = [0.02, 0.86]; // scroll progress over which the coloring happens
  const SHIFT = 1048576; // 2^20, more than the pixel count, for packing sort keys

  let model = null;
  let building = null;
  let queued = false;
  let shownStep = -2;

  async function build() {
    if (!sheets.has(COLOR_SHOW.sceneId)) sheets.set(COLOR_SHOW.sceneId, readSheet(COLOR_SHOW.sceneId));
    const { ids, original, width, height } = await sheets.get(COLOR_SHOW.sceneId);
    // Bucket pixel indices by region in one pass.
    const sizes = new Map();
    for (let i = 0; i < ids.length; i++) if (ids[i]) sizes.set(ids[i], (sizes.get(ids[i]) || 0) + 1);
    const buckets = new Map([...sizes].map(([id, size]) => [id, { list: new Uint32Array(size), n: 0 }]));
    for (let i = 0; i < ids.length; i++) {
      const bucket = buckets.get(ids[i]);
      if (bucket) bucket.list[bucket.n++] = i;
    }
    const steps = plan
      .filter((step) => buckets.has(step.id))
      .map((step) => {
        const list = buckets.get(step.id).list;
        let sx = 0;
        let sy = 0;
        let minX = width;
        let minY = height;
        let maxX = 0;
        let maxY = 0;
        for (const i of list) {
          const x = i % width;
          const y = (i - x) / width;
          sx += x;
          sy += y;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
        // Start from the region pixel nearest its centre (the centre itself may fall outside a curved shape).
        const cx = sx / list.length;
        const cy = sy / list.length;
        let origin = list[0];
        let best = Infinity;
        for (const i of list) {
          const x = i % width;
          const d = (x - cx) ** 2 + ((i - x) / width - cy) ** 2;
          if (d < best) {
            best = d;
            origin = i;
          }
        }
        const ox = origin % width;
        const oy = (origin - ox) / width;
        // Order pixels by distance from the origin, roughened so the edge looks penciled in.
        const keys = new Float64Array(list.length);
        list.forEach((i, k) => {
          const x = i % width;
          const y = (i - x) / width;
          const grain = (((x * 73856093) ^ (y * 19349663)) >>> 0) % 1000 / 1000;
          const wobble = Math.sin(x * 0.09) * Math.sin(y * 0.07);
          const d = Math.hypot(x - ox, y - oy) + grain * 9 + wobble * 8;
          keys[k] = Math.floor(Math.max(0, d) * 8) * SHIFT + i;
        });
        keys.sort();
        const order = new Uint32Array(list.length);
        for (let k = 0; k < keys.length; k++) order[k] = keys[k] % SHIFT;
        return { ...step, order, filled: 0, ox, oy, box: [minX, minY, maxX, maxY], weight: Math.pow(list.length, 0.4) };
      });
    // Pacing, tuned so the share of the page colored grows steadily with the scroll:
    // - start times: each space gets a slot sized by area^0.4, so tiny spaces aren't skipped past;
    // - durations: at least OVERLAP slots (the next space starts before this one finishes), and for
    //   big spaces like the wall and Capy, long enough to wash in alongside the smaller ones
    //   (COVERAGE × their share of the page) instead of flooding in one jump.
    // Rescaled so the final fill ends exactly at t = 1.
    const OVERLAP = 2.4;
    const COVERAGE = 1.6;
    const total = steps.reduce((sum, step) => sum + step.weight, 0);
    const pixels = steps.reduce((sum, step) => sum + step.order.length, 0);
    let at = 0;
    for (const step of steps) {
      step.from = at / total;
      step.span = Math.max((step.weight / total) * OVERLAP, (step.order.length / pixels) * COVERAGE);
      at += step.weight;
    }
    const end = Math.max(...steps.map((step) => step.from + step.span));
    for (const step of steps) {
      step.from /= end;
      step.span /= end;
    }
    canvasEl.width = width;
    canvasEl.height = height;
    const image = new ImageData(new Uint8ClampedArray(original.data), width, height);
    context.putImageData(image, 0, 0);
    model = { steps, image, original: original.data, width, height };
    paper.classList.add("is-ready");
    canvasEl.removeAttribute("aria-hidden");
    canvasEl.setAttribute("role", "img");
    canvasEl.setAttribute("aria-label", $(".color-fallback", section).alt);
  }

  // Scroll position mapped to 0–1 across the coloring window.
  function target() {
    if (!animated) return 1;
    const rect = section.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, -rect.top / Math.max(1, rect.height - innerHeight)));
    return Math.min(1, Math.max(0, (p - WINDOW[0]) / (WINDOW[1] - WINDOW[0])));
  }
  const fillOf = (step, t) => {
    const x = Math.min(1, Math.max(0, (t - step.from) / step.span));
    return x * x * (3 - 2 * x); // smoothstep: each space eases in and out
  };

  function render(t) {
    const { steps, image, original, width, height } = model;
    const data = image.data;
    let dirty = null;
    let pencilStep = null;
    let started = null;
    for (const step of steps) {
      const f = fillOf(step, t);
      if (f > 0) started = step;
      if (f > 0 && f < 1) pencilStep = step; // the most recently started space still being filled
      const want = Math.round(f * step.order.length);
      if (want === step.filled) continue;
      const [r, g, b] = paintRGB[step.pencil];
      if (want > step.filled) {
        for (let k = step.filled; k < want; k++) {
          const o = step.order[k] * 4;
          const shade = original[o] / 255;
          data[o] = shade * r;
          data[o + 1] = shade * g;
          data[o + 2] = shade * b;
        }
      } else {
        for (let k = want; k < step.filled; k++) {
          const o = step.order[k] * 4;
          data[o] = original[o];
          data[o + 1] = original[o + 1];
          data[o + 2] = original[o + 2];
        }
      }
      step.filled = want;
      const [x0, y0, x1, y1] = step.box;
      dirty = dirty
        ? [Math.min(dirty[0], x0), Math.min(dirty[1], y0), Math.max(dirty[2], x1), Math.max(dirty[3], y1)]
        : [x0, y0, x1, y1];
    }
    if (dirty) context.putImageData(image, 0, 0, dirty[0], dirty[1], dirty[2] - dirty[0] + 1, dirty[3] - dirty[1] + 1);

    const done = t >= 1;
    const step = pencilStep || started || steps[0];
    // The pencil makes a small, slow loop around the spot it's filling.
    const f = fillOf(step, t);
    const swing = Math.min(10, Math.sqrt(step.order.length) / 8);
    const px = step.ox + Math.cos(f * 9) * swing;
    const py = step.oy + Math.sin(f * 7) * swing * 0.7;
    pencilEl.style.left = ((px / width) * 100).toFixed(2) + "%";
    pencilEl.style.top = ((py / height) * 100).toFixed(2) + "%";
    pencilEl.style.setProperty("--pencil", pencils[step.pencil][1]);
    section.classList.toggle("is-coloring", t > 0.002 && !done);
    section.classList.toggle("is-done", done);

    countNow.textContent = steps.filter((s) => s.filled === s.order.length).length;
    bar.style.transform = "scaleX(" + t.toFixed(4) + ")";
    pencilNow.textContent = pencils[step.pencil][0];
    pencilNow.parentElement.style.setProperty("--pencil", pencils[step.pencil][1]);
    const stage = done ? -1 : started ? step.stage : 0;
    if (stage !== shownStep) {
      shownStep = stage;
      stepNum.textContent = done ? "✓" : String(stage + 1).padStart(2, "0");
      stepText.textContent = done ? COLOR_SHOW.done : COLOR_SHOW.stages[stage].caption;
    }
  }

  // The drawn progress glides toward the scroll position (about a 120ms ease), so wheel
  // notches and trackpad flicks color smoothly instead of jumping.
  let shown = -1;
  let lastTime = 0;
  function frame(now) {
    queued = false;
    if (!model) return;
    const goal = target();
    if (shown < 0) shown = goal;
    const dt = lastTime ? Math.min(64, now - lastTime) : 16;
    shown += (goal - shown) * (1 - Math.exp(-dt / 120));
    if (Math.abs(goal - shown) < 0.0004) shown = goal;
    render(shown);
    if (shown !== goal) {
      lastTime = now;
      queue();
    } else lastTime = 0;
  }
  function queue() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(frame);
  }

  // Load and prepare the page art only when the section is close to the screen.
  const start = () => {
    building ||= build()
      .then(queue)
      .catch(() => section.classList.add("is-failed"));
  };
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          start();
          io.disconnect();
        }
      },
      { rootMargin: "900px 0px" },
    );
    io.observe(section);
  } else start();
  if (animated) {
    addEventListener("scroll", queue, { passive: true });
    addEventListener("resize", queue);
  }
})();

// ---------------------------------------------------------------------------
// Gentle entrances: [data-reveal] elements rise in the first time they're seen.
// Anything already on screen at load is shown at once, so nothing flickers.
// ---------------------------------------------------------------------------
(function reveals() {
  const targets = $$("[data-reveal]");
  if (!targets.length || !("IntersectionObserver" in window)) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (const el of targets) {
    const r = el.getBoundingClientRect();
    if (r.top < innerHeight && r.bottom > 0) el.classList.add("is-in");
  }
  document.documentElement.classList.add("reveals-ready");
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add("is-in");
        io.unobserve(e.target);
      }
    },
    { rootMargin: "0px 0px -8% 0px" },
  );
  targets.forEach((el) => el.classList.contains("is-in") || io.observe(el));
})();
