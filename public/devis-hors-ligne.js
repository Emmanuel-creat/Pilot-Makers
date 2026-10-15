/* Devis préparé sans réseau : tout reste dans le navigateur jusqu'au prochain passage dans l'application. */
(function () {
  var KEY = "pm-devis-hors-ligne";
  var lignes = document.getElementById("lignes");
  var form = document.getElementById("devis");
  var erreur = document.getElementById("erreur");

  function read() {
    try {
      var v = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(v) ? v : [];
    } catch (e) {
      return [];
    }
  }
  function write(list) {
    localStorage.setItem(KEY, JSON.stringify(list));
  }
  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "hl-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }
  function field(label, name, attrs) {
    var l = document.createElement("label");
    l.textContent = label;
    var i = document.createElement("input");
    i.name = name;
    for (var k in attrs) i.setAttribute(k, attrs[k]);
    l.appendChild(i);
    return l;
  }
  function addLine() {
    var row = document.createElement("div");
    row.className = "row";
    var n = lignes.children.length + 1;
    row.appendChild(field("Désignation " + n, "label", { maxlength: "500" }));
    row.appendChild(field("Qté", "quantity", { inputmode: "decimal", value: "1" }));
    row.appendChild(field("Unité", "unit", { maxlength: "20", value: "u" }));
    row.appendChild(field("Prix HT", "unitPrice", { inputmode: "decimal" }));
    row.appendChild(field("TVA %", "vatPercent", { inputmode: "decimal", value: "10" }));
    var del = document.createElement("button");
    del.type = "button";
    del.className = "link";
    del.textContent = "Retirer";
    del.setAttribute("aria-label", "Retirer la ligne " + n);
    del.onclick = function () {
      row.remove();
    };
    row.appendChild(del);
    lignes.appendChild(row);
  }
  function render() {
    var list = read();
    var ul = document.getElementById("file");
    ul.innerHTML = "";
    document.getElementById("etat").textContent = list.length ? list.length + " devis en attente d'envoi." : "Aucun devis en attente.";
    list.forEach(function (q) {
      var li = document.createElement("li");
      li.textContent = q.title + (q.clientName ? ", " + q.clientName : "") + " (" + q.lines.length + " ligne" + (q.lines.length > 1 ? "s" : "") + ")";
      ul.appendChild(li);
    });
  }

  document.getElementById("ajouter").onclick = addLine;
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    erreur.textContent = "";
    var fd = new FormData(form);
    var title = String(fd.get("title") || "").trim();
    if (!title) {
      erreur.textContent = "Indiquez au moins le titre du devis.";
      return;
    }
    var lines = [];
    Array.prototype.forEach.call(lignes.children, function (row) {
      var get = function (n) {
        return String(row.querySelector('[name="' + n + '"]').value || "").trim();
      };
      if (get("label"))
        lines.push({ label: get("label"), quantity: get("quantity"), unit: get("unit"), unitPrice: get("unitPrice"), vatPercent: get("vatPercent") });
    });
    var list = read();
    list.push({
      key: uid(),
      title: title,
      clientName: String(fd.get("clientName") || "").trim(),
      clientPhone: String(fd.get("clientPhone") || "").trim(),
      clientAddress: String(fd.get("clientAddress") || "").trim(),
      note: String(fd.get("note") || "").trim(),
      lines: lines,
      createdAt: new Date().toISOString(),
    });
    try {
      write(list);
    } catch (err) {
      erreur.textContent = "Le téléphone n'a plus de place pour garder ce devis.";
      return;
    }
    form.reset();
    lignes.innerHTML = "";
    addLine();
    render();
  });
  addLine();
  render();
})();
