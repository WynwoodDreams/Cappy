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
