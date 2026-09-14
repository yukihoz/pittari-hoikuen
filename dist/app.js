(() => {
  const data = Array.isArray(window.NURSERY_DATA) ? window.NURSERY_DATA : [];
  const evaluations = Array.isArray(window.FUKUNAVI_DATA) ? window.FUKUNAVI_DATA : [];
  const state = { query: "", category: "all", areas: new Set(), age: "", features: new Set(), sort: "number", compare: new Set() };
  const els = {
    grid: document.querySelector("#results-grid"),
    count: document.querySelector("#result-count"),
    empty: document.querySelector("#empty-state"),
    active: document.querySelector("#active-filters"),
    search: document.querySelector("#search-input"),
    age: document.querySelector("#age-filter"),
    sort: document.querySelector("#sort-select"),
    dock: document.querySelector("#compare-dock"),
    compareCount: document.querySelector("#compare-count"),
    detailDialog: document.querySelector("#detail-dialog"),
    detailContent: document.querySelector("#detail-content"),
    compareDialog: document.querySelector("#compare-dialog"),
    compareContent: document.querySelector("#compare-content"),
    aboutDialog: document.querySelector("#about-dialog"),
    template: document.querySelector("#card-template"),
  };

  const normalized = (value) => String(value ?? "").normalize("NFKC").toLowerCase().replace(/\s+/g, "");
  const present = (value) => value !== null && value !== undefined && value !== "" && value !== "-";
  const yes = (value) => /あり|園|サブスク|可/.test(String(value ?? "")) && !/なし/.test(String(value ?? ""));
  const safe = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  const formatNum = (value, digits = 0) => present(value) ? Number(value).toLocaleString("ja-JP", { maximumFractionDigits: digits }) : "—";
  const formatDate = (value) => present(value) && /^\d{4}/.test(String(value)) ? `${String(value).slice(0, 4)}年${Number(String(value).slice(5, 7)) || ""}月` : "—";
  const areaColor = (area) => area === "京橋" ? "#ef615d" : area === "月島" ? "#25a8b8" : "#12395b";
  const ageLabels = { "57d": "生後57日", "7m": "生後7か月", age1: "1歳児", age2: "2歳児", age3: "3歳児", age4: "4歳児", age5: "5歳児" };
  const evaluationsByName = new Map(evaluations.map((evaluation) => [evaluation.siteKey || evaluation.key, evaluation]));
  const evaluationFor = (item) => evaluationsByName.get(normalized(item.name));

  function matchesFeature(item, feature) {
    if (feature === "garden") return yes(item.gardenLabel) || (item.gardenArea ?? 0) > 0;
    if (feature === "bicycle") return yes(item.bicycle);
    if (feature === "stroller") return yes(item.stroller);
    if (feature === "diaper") return /園|サブスク/.test(item.diaperPrep ?? "") && !/保護者\s*$/.test(item.diaperPrep ?? "");
    if (feature === "contactApp") return yes(item.contactApp);
    if (feature === "medical") return yes(item.medicalCare);
    if (feature === "evaluation") return Boolean(evaluationFor(item));
    return true;
  }

  function getFiltered() {
    const query = normalized(state.query);
    const filtered = data.filter((item) => {
      if (state.category === "licensed" && item.category !== "認可保育園・こども園") return false;
      if (state.category === "other" && item.category === "認可保育園・こども園") return false;
      if (state.areas.size && !state.areas.has(item.area)) return false;
      if (state.age && !(Number(item.capacity?.[state.age]) > 0)) return false;
      if ([...state.features].some((feature) => !matchesFeature(item, feature))) return false;
      if (query && !normalized([item.name, item.address, item.operator, item.type, item.area].join(" ")).includes(query)) return false;
      return true;
    });
    const descending = ["areaPerChild", "gardenPerChild", "teacherPerChild", "capacity"];
    filtered.sort((a, b) => {
      if (state.sort === "opened") return String(b.opened ?? "").localeCompare(String(a.opened ?? ""));
      if (descending.includes(state.sort)) {
        const key = state.sort === "capacity" ? "total" : state.sort;
        const av = state.sort === "capacity" ? a.capacity?.total : a[key];
        const bv = state.sort === "capacity" ? b.capacity?.total : b[key];
        return (Number(bv) || -1) - (Number(av) || -1);
      }
      return (Number(a.number) || 9999) - (Number(b.number) || 9999) || a.name.localeCompare(b.name, "ja");
    });
    return filtered;
  }

  function metric(label, value) {
    return `<div class="metric"><span>${safe(label)}</span><strong>${safe(value)}</strong></div>`;
  }

  function featureTags(item) {
    const tags = [];
    const evaluation = evaluationFor(item);
    if (evaluation) tags.push([`第三者評価 ${evaluation.year}年度`, false, "evaluation"]);
    if (yes(item.gardenLabel) || (item.gardenArea ?? 0) > 0) tags.push(["園庭", false]);
    if ((item.capacity?.["57d"] ?? 0) > 0) tags.push(["生後57日", true]);
    else if ((item.capacity?.["7m"] ?? 0) > 0) tags.push(["生後7か月", true]);
    if (yes(item.bicycle)) tags.push(["駐輪", false]);
    if (yes(item.stroller)) tags.push(["ベビーカー", false]);
    if (/園|サブスク/.test(item.diaperPrep ?? "") && !/保護者\s*$/.test(item.diaperPrep ?? "")) tags.push(["おむつ準備負担少", true]);
    if (yes(item.contactApp)) tags.push(["連絡アプリ", false]);
    return tags.slice(0, 5).map(([label, accent, kind]) => `<span class="feature-tag${accent ? " accent" : ""}${kind ? ` ${kind}` : ""}">${safe(label)}</span>`).join("");
  }

  function renderCard(item) {
    const node = els.template.content.cloneNode(true);
    const card = node.querySelector(".nursery-card");
    card.style.setProperty("--area-color", areaColor(item.area));
    node.querySelector(".area-badge").textContent = item.area || "中央区";
    node.querySelector(".category-label").textContent = item.type || item.category;
    node.querySelector(".nursery-name").textContent = item.name;
    node.querySelector(".nursery-operator").textContent = item.operator || "運営者情報なし";
    node.querySelector(".nursery-address").textContent = item.address || "住所情報なし";
    node.querySelector(".metric-grid").innerHTML = [
      metric("定員", present(item.capacity?.total) ? `${formatNum(item.capacity.total)}人` : "—"),
      metric("1人あたり面積", present(item.areaPerChild) ? `${formatNum(item.areaPerChild, 1)}㎡` : "—"),
      metric("開設", formatDate(item.opened)),
    ].join("");
    node.querySelector(".feature-tags").innerHTML = featureTags(item);
    const open = () => showDetail(item);
    node.querySelector(".card-main").addEventListener("click", open);
    node.querySelector(".detail-button").addEventListener("click", open);
    const checkbox = node.querySelector(".compare-check input");
    checkbox.checked = state.compare.has(item.id);
    checkbox.disabled = state.compare.size >= 3 && !checkbox.checked;
    checkbox.setAttribute("aria-label", `${item.name}を比較に追加`);
    checkbox.addEventListener("change", () => toggleCompare(item.id, checkbox.checked));
    return node;
  }

  function render() {
    const items = getFiltered();
    els.count.textContent = items.length;
    els.grid.replaceChildren(...items.map(renderCard));
    els.grid.hidden = items.length === 0;
    els.empty.hidden = items.length !== 0;
    renderActiveFilters();
    renderCompareDock();
    syncControls();
  }

  function renderActiveFilters() {
    const labels = [];
    if (state.query) labels.push(`検索: ${state.query}`);
    if (state.category === "licensed") labels.push("認可のみ");
    if (state.category === "other") labels.push("認可以外");
    state.areas.forEach((area) => labels.push(area));
    if (state.age) labels.push(`${ageLabels[state.age]}の定員あり`);
    const featureLabels = { garden: "園庭あり", bicycle: "駐輪あり", stroller: "ベビーカー置場", diaper: "おむつ準備負担少", contactApp: "連絡アプリ", medical: "医療的ケア児受入", evaluation: "第三者評価あり" };
    state.features.forEach((feature) => labels.push(featureLabels[feature]));
    els.active.innerHTML = labels.map((label) => `<span class="filter-chip">${safe(label)}</span>`).join("");
  }

  function syncControls() {
    document.querySelectorAll("[data-category]").forEach((button) => button.classList.toggle("is-active", button.dataset.category === state.category));
    document.querySelectorAll('input[name="area"]').forEach((input) => { input.checked = state.areas.has(input.value); });
    document.querySelectorAll('input[name="feature"]').forEach((input) => { input.checked = state.features.has(input.value); });
    document.querySelectorAll("[data-quick]").forEach((button) => {
      const value = button.dataset.quick;
      button.classList.toggle("is-active", value === state.age || state.features.has(value));
    });
    els.age.value = state.age;
    els.sort.value = state.sort;
    if (document.activeElement !== els.search) els.search.value = state.query;
  }

  function reset() {
    state.query = ""; state.category = "all"; state.areas.clear(); state.age = ""; state.features.clear(); state.sort = "number";
    els.search.value = "";
    render();
  }

  function detailCell(label, value) {
    return `<div class="detail-cell"><span>${safe(label)}</span><strong>${safe(present(value) ? value : "—")}</strong></div>`;
  }

  function evaluationSection(item) {
    const evaluation = evaluationFor(item);
    if (!evaluation) return "";
    const themes = (label, values, kind) => values?.length ? `<div class="evaluation-theme ${kind}"><strong>${safe(label)}</strong><div>${values.map((value) => `<span>${safe(value)}</span>`).join("")}</div></div>` : "";
    const yearHistory = evaluation.years?.length ? evaluation.years.join("・") : evaluation.year;
    return `<section class="detail-section evaluation-section">
      <div class="evaluation-heading"><div><p class="evaluation-kicker">福ナビ・最新の公開結果</p><h3>第三者評価 ${safe(evaluation.year)}年度</h3></div><a href="${safe(evaluation.url)}" target="_blank" rel="noreferrer">公式レポートを読む ↗</a></div>
      <div class="evaluation-stats">
        <div><span>総合満足</span><strong>${formatNum(evaluation.satisfaction, 1)}%</strong><small>「大変満足」＋「満足」</small></div>
        <div><span>アンケート回答</span><strong>${formatNum(evaluation.responses)}/${formatNum(evaluation.households)}</strong><small>回答率 ${formatNum(evaluation.responseRate, 1)}%</small></div>
        <div><span>公開年度</span><strong>${safe(evaluation.years?.length || 1)}回分</strong><small>${safe(yearHistory)}年度</small></div>
      </div>
      <div class="evaluation-bar" aria-label="総合満足 ${safe(evaluation.satisfaction)}%"><span style="width:${Math.max(0, Math.min(100, Number(evaluation.satisfaction) || 0))}%"></span></div>
      <div class="evaluation-themes">${themes("評価機関が挙げたよい点", evaluation.goodThemes, "good")}${themes("今後の改善テーマ", evaluation.improveThemes, "improve")}</div>
      <p class="evaluation-agency">評価機関：${safe(evaluation.agency || "福ナビ掲載の評価機関")}</p>
      <p class="evaluation-note">満足度だけで順位づけせず、評価年度・回答数・講評の内容をあわせてご確認ください。テーマは講評を探しやすくするため、このサイトで分類しています。</p>
    </section>`;
  }

  function showDetail(item) {
    const evaluation = evaluationFor(item);
    const mapUrl = present(item.lat) && present(item.lng) ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${item.lat},${item.lng}`)}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.address || item.name)}`;
    const ages = [["57d", "0歳・57日"], ["7m", "0歳・7か月"], ["age1", "1歳"], ["age2", "2歳"], ["age3", "3歳"], ["age4", "4歳"], ["age5", "5歳"]];
    const capacity = ages.map(([key, label]) => detailCell(label, present(item.capacity?.[key]) ? `${formatNum(item.capacity[key])}人` : "—")).join("");
    const daily = [
      ["駐輪スペース", item.bicycle], ["ベビーカー置場", item.stroller], ["おむつの準備", item.diaperPrep], ["おむつの処分", item.diaperDispose],
      ["布団カバー準備", item.beddingPrep], ["付け外し", item.beddingAttach], ["洗濯", item.beddingWash], ["連絡アプリ", item.contactApp], ["制服", item.uniform],
    ].map(([label, value]) => detailCell(label, value)).join("");
    const links = [`<a href="${mapUrl}" target="_blank" rel="noreferrer">地図で見る</a>`];
    if (present(item.website) && /^https?:/.test(item.website)) links.push(`<a href="${safe(item.website)}" target="_blank" rel="noreferrer">施設サイト</a>`);
    if (evaluation) links.push(`<a href="${safe(evaluation.url)}" target="_blank" rel="noreferrer">第三者評価</a>`);
    else if (present(item.evaluation) && /^https?:/.test(item.evaluation)) links.push(`<a href="${safe(item.evaluation)}" target="_blank" rel="noreferrer">第三者評価</a>`);
    els.detailContent.innerHTML = `
      <div class="detail-hero"><div class="dialog-kicker">${safe(item.area || "中央区")} / ${safe(item.type || item.category)}</div><h2>${safe(item.name)}</h2><p class="detail-subtitle">${safe(item.operator || "")}<br>${safe(item.address || "住所情報なし")}</p><div class="detail-links">${links.join("")}</div></div>
      <section class="detail-section"><h3>定員</h3><div class="detail-grid">${capacity}</div></section>
      <section class="detail-section"><h3>施設・職員体制</h3><div class="detail-grid">
        ${detailCell("定員合計", present(item.capacity?.total) ? `${formatNum(item.capacity.total)}人` : "—")}
        ${detailCell("延床面積", present(item.floorArea) ? `${formatNum(item.floorArea, 1)}㎡` : "—")}
        ${detailCell("1人あたり延床面積", present(item.areaPerChild) ? `${formatNum(item.areaPerChild, 1)}㎡` : "—")}
        ${detailCell("園庭", item.gardenLabel)}${detailCell("園庭面積", present(item.gardenArea) ? `${formatNum(item.gardenArea, 1)}㎡` : "—")}
        ${detailCell("保育士数", present(item.nurseryTeachers) ? `${formatNum(item.nurseryTeachers, 1)}人` : "—")}
        ${detailCell("職員数", present(item.totalStaff) ? `${formatNum(item.totalStaff, 1)}人` : "—")}
        ${detailCell("医療的ケア児", item.medicalCare)}${detailCell("エレベーター", item.elevator)}
      </div></section>
      ${evaluationSection(item)}
      ${item.category === "認可保育園・こども園" ? `<section class="detail-section"><h3>毎日の準備・設備</h3><div class="detail-grid">${daily}</div></section>` : ""}
      ${present(item.inspectionDetail) ? `<section class="detail-section"><h3>指導検査</h3><div class="note">${safe(item.inspectionDetail)}</div></section>` : ""}
      ${present(item.note) ? `<section class="detail-section"><h3>備考</h3><div class="note">${safe(item.note)}</div></section>` : ""}`;
    els.detailDialog.showModal();
  }

  function toggleCompare(id, checked) {
    if (checked && state.compare.size < 3) state.compare.add(id);
    if (!checked) state.compare.delete(id);
    render();
  }

  function renderCompareDock() {
    const count = state.compare.size;
    els.dock.hidden = count === 0;
    els.compareCount.textContent = `${count}園を選択`;
    document.querySelector("#open-compare").disabled = count < 2;
  }

  function showCompare() {
    const items = [...state.compare].map((id) => data.find((item) => item.id === id)).filter(Boolean);
    const row = (label, getValue) => `<tr><th scope="row">${safe(label)}</th>${items.map((item) => `<td>${safe(getValue(item) ?? "—")}</td>`).join("")}</tr>`;
    els.compareContent.innerHTML = `<table class="compare-table"><thead><tr><th>比較項目</th>${items.map((item) => `<th>${safe(item.name)}</th>`).join("")}</tr></thead><tbody>
      ${row("エリア", (x) => x.area)}${row("種別", (x) => x.type)}${row("定員合計", (x) => present(x.capacity?.total) ? `${formatNum(x.capacity.total)}人` : "—")}
      ${row("0歳・生後57日", (x) => present(x.capacity?.["57d"]) ? `${formatNum(x.capacity["57d"])}人` : "—")}
      ${row("0歳・生後7か月", (x) => present(x.capacity?.["7m"]) ? `${formatNum(x.capacity["7m"])}人` : "—")}
      ${row("1人あたり延床面積", (x) => present(x.areaPerChild) ? `${formatNum(x.areaPerChild, 1)}㎡` : "—")}
      ${row("園庭", (x) => x.gardenLabel)}${row("駐輪スペース", (x) => x.bicycle)}${row("ベビーカー置場", (x) => x.stroller)}
      ${row("福ナビ第三者評価", (x) => { const evaluation = evaluationFor(x); return evaluation ? `${evaluation.year}年度 / 総合満足 ${formatNum(evaluation.satisfaction, 1)}% / 回答率 ${formatNum(evaluation.responseRate, 1)}%` : "—"; })}
      ${row("おむつ準備", (x) => x.diaperPrep)}${row("おむつ処分", (x) => x.diaperDispose)}${row("連絡アプリ", (x) => x.contactApp)}
      ${row("住所", (x) => x.address)}</tbody></table>`;
    els.compareDialog.showModal();
  }

  function registerWebMcp() {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const allowed = {
      category: ["all", "licensed", "other"],
      areas: ["京橋", "日本橋", "月島"],
      age: ["", "57d", "7m", "age1", "age2", "age3", "age4", "age5"],
      features: ["garden", "bicycle", "stroller", "diaper", "contactApp", "medical", "evaluation"],
      sort: ["number", "areaPerChild", "gardenPerChild", "teacherPerChild", "opened", "capacity"],
    };
    const tool = {
      name: "filter_nurseries",
      title: "保育園を絞り込む",
      description: "園名、施設区分、エリア、入園時年齢、設備条件を指定して、画面の保育施設一覧を絞り込みます。",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "園名・住所・運営者に含まれる検索語" },
          category: { type: "string", enum: allowed.category },
          areas: { type: "array", items: { type: "string", enum: allowed.areas }, uniqueItems: true },
          age: { type: "string", enum: allowed.age },
          features: { type: "array", items: { type: "string", enum: allowed.features }, uniqueItems: true },
          sort: { type: "string", enum: allowed.sort },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        const value = input && typeof input === "object" ? input : {};
        if (value.category !== undefined && !allowed.category.includes(value.category)) throw new Error("categoryが不正です");
        if (value.age !== undefined && !allowed.age.includes(value.age)) throw new Error("ageが不正です");
        if (value.sort !== undefined && !allowed.sort.includes(value.sort)) throw new Error("sortが不正です");
        if (value.areas !== undefined && (!Array.isArray(value.areas) || value.areas.some((x) => !allowed.areas.includes(x)))) throw new Error("areasが不正です");
        if (value.features !== undefined && (!Array.isArray(value.features) || value.features.some((x) => !allowed.features.includes(x)))) throw new Error("featuresが不正です");
        state.query = typeof value.query === "string" ? value.query : "";
        state.category = value.category ?? "all";
        state.areas = new Set(value.areas ?? []);
        state.age = value.age ?? "";
        state.features = new Set(value.features ?? []);
        state.sort = value.sort ?? "number";
        els.search.value = state.query;
        render();
        const results = getFiltered();
        return { count: results.length, topResults: results.slice(0, 5).map((item) => ({ id: item.id, name: item.name, area: item.area, type: item.type })) };
      },
    };
    try { void Promise.resolve(context.registerTool(tool)).catch(() => {}); } catch (_) {}
  }

  let timer;
  els.search.addEventListener("input", (event) => { clearTimeout(timer); timer = setTimeout(() => { state.query = event.target.value; render(); }, 120); });
  els.age.addEventListener("change", (event) => { state.age = event.target.value; render(); });
  els.sort.addEventListener("change", (event) => { state.sort = event.target.value; render(); });
  document.querySelectorAll("[data-category]").forEach((button) => button.addEventListener("click", () => { state.category = button.dataset.category; render(); }));
  document.querySelectorAll('input[name="area"]').forEach((input) => input.addEventListener("change", () => { input.checked ? state.areas.add(input.value) : state.areas.delete(input.value); render(); }));
  document.querySelectorAll('input[name="feature"]').forEach((input) => input.addEventListener("change", () => { input.checked ? state.features.add(input.value) : state.features.delete(input.value); render(); }));
  document.querySelectorAll("[data-quick]").forEach((button) => button.addEventListener("click", () => {
    const value = button.dataset.quick;
    if (["57d", "7m"].includes(value)) state.age = state.age === value ? "" : value;
    else state.features.has(value) ? state.features.delete(value) : state.features.add(value);
    render();
  }));
  document.querySelectorAll("[data-reset]").forEach((button) => button.addEventListener("click", reset));
  document.querySelectorAll("[data-open-about]").forEach((button) => button.addEventListener("click", () => els.aboutDialog.showModal()));
  document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
  document.querySelectorAll("dialog").forEach((dialog) => dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); }));
  document.querySelector("#open-compare").addEventListener("click", showCompare);
  registerWebMcp();
  render();
})();
