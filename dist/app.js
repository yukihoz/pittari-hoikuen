(() => {
  const data = Array.isArray(window.NURSERY_DATA) ? window.NURSERY_DATA : [];
  const admissionData = Array.isArray(window.ADMISSION_DATA) ? window.ADMISSION_DATA : [];
  const evaluations = Array.isArray(window.FUKUNAVI_DATA) ? window.FUKUNAVI_DATA : [];
  const state = { query: "", category: "all", areas: new Set(), age: "age1", userScore: 40, difficultyLevel: null, features: new Set(), sort: "number", sortDirection: "asc", compare: new Set() };
  const els = {
    grid: document.querySelector("#results-grid"),
    count: document.querySelector("#result-count"),
    empty: document.querySelector("#empty-state"),
    active: document.querySelector("#active-filters"),
    search: document.querySelector("#search-input"),
    sort: document.querySelector("#sort-select"),
    sortDirectionButtons: document.querySelectorAll("[data-sort-direction]"),
    dock: document.querySelector("#compare-dock"),
    compareCount: document.querySelector("#compare-count"),
    detailDialog: document.querySelector("#detail-dialog"),
    detailContent: document.querySelector("#detail-content"),
    compareDialog: document.querySelector("#compare-dialog"),
    compareContent: document.querySelector("#compare-content"),
    difficultyDialog: document.querySelector("#difficulty-dialog"),
    difficultyDialogContent: document.querySelector("#difficulty-dialog-content"),
    aboutDialog: document.querySelector("#about-dialog"),
    template: document.querySelector("#card-template"),
    filterPanel: document.querySelector("#filter-panel"),
    filterOpen: document.querySelector("[data-filter-open]"),
    filterClose: document.querySelector(".mobile-filter-close"),
    filterBackdrop: document.querySelector(".filter-backdrop"),
    admissionSummary: document.querySelector("#admission-summary"),
    scoreInputs: document.querySelectorAll("[data-score-input]"),
    scoreOutputs: document.querySelectorAll("[data-score-output]"),
  };

  const normalized = (value) => String(value ?? "").normalize("NFKC").toLowerCase().replace(/\s+/g, "");
  const present = (value) => value !== null && value !== undefined && value !== "" && value !== "-";
  const yes = (value) => /あり|園|サブスク|可/.test(String(value ?? "")) && !/なし/.test(String(value ?? ""));
  const safe = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  const formatNum = (value, digits = 0) => present(value) ? Number(value).toLocaleString("ja-JP", { maximumFractionDigits: digits }) : "—";
  const formatDate = (value) => present(value) && /^\d{4}/.test(String(value)) ? `${String(value).slice(0, 4)}年${Number(String(value).slice(5, 7)) || ""}月` : "—";
  const areaColor = (area) => area === "京橋" ? "#d36f84" : area === "月島" ? "#3f9991" : "#8b6cac";
  const ageLabels = { "57d": "生後57日", "7m": "生後7か月", age1: "1歳児", age2: "2歳児", age3: "3歳児", age4: "4歳児", age5: "5歳児" };
  const admissionAgeLabels = { "57d": "0歳児（57日）入園", "7m": "0歳児（7か月）入園", age1: "1歳児入園", age2: "2歳児入園", age3: "3歳児入園", age4: "4歳児入園", age5: "5歳児入園" };
  const evaluationsByName = new Map(evaluations.map((evaluation) => [evaluation.siteKey || evaluation.key, evaluation]));
  const admissionsById = new Map(admissionData.map((record) => [record.id, record]));
  const admissionsByName = new Map(admissionData.map((record) => [normalized(record.name), record]));
  const evaluationFor = (item) => evaluationsByName.get(normalized(item.name));
  const admissionFor = (item) => admissionsById.get(item.id) || admissionsByName.get(normalized(item.name));
  const facilityCategory = (item) => {
    if (item.category === "認可保育園・こども園") return "licensed";
    if (item.category === "認証保育所") return "certified";
    if (item.category === "認可外・企業主導型" && item.type !== "企業主導型保育事業") return "unlicensed";
    return "other";
  };
  const facilityCategoryOrder = { licensed: 0, certified: 1, unlicensed: 2, other: 3 };

  function getRecordDifficulty(userScore, record) {
    if (record?.status === "vacant") return { level: "easy", label: "入りやすい", badgeClass: "badge-easy" };
    if (!record || ["unopened", "full", "none", "unknown"].includes(record.status) || !record.score) {
      return { level: "no-data", label: "データなし", badgeClass: "badge-nodata" };
    }
    const nurseryScore = Number.parseInt(String(record.score).replace(/[^0-9]/g, ""), 10);
    const rank = record.rank || "";
    if (!Number.isFinite(nurseryScore)) return { level: "no-data", label: "データなし", badgeClass: "badge-nodata" };
    if (userScore > nurseryScore) return { level: "easy", label: "入りやすい", badgeClass: "badge-easy" };
    if (userScore < nurseryScore) return { level: "hard", label: "入りにくい", badgeClass: "badge-hard" };
    if (userScore === 40) {
      if (["A", "B", "C"].includes(rank)) return { level: "hard", label: "入りにくい", badgeClass: "badge-hard" };
      if (["D", "E", "F", "G"].includes(rank)) return { level: "normal", label: "普通", badgeClass: "badge-normal" };
      return { level: "easy", label: "入りやすい", badgeClass: "badge-easy" };
    }
    return { level: "normal", label: "普通", badgeClass: "badge-normal" };
  }

  function getAdmissionDifficulty(userScore, currentCapacity, historyRecords) {
    if (!(Number(currentCapacity) > 0)) {
      return { level: "none", label: "今年度枠なし", badgeClass: "badge-none", isAvailableThisYear: false };
    }
    const latestRecord = historyRecords?.["2026"] || historyRecords?.["2025"];
    const is3YearsVacant = ["2026", "2025", "2024"].every((year) => historyRecords?.[year]?.status === "vacant");
    if (is3YearsVacant) {
      return { level: "easy", label: "入りやすい", subtext: "3年連続空き枠あり", badgeClass: "badge-easy", isAvailableThisYear: true };
    }
    if (latestRecord?.status === "vacant") {
      return { level: "easy", label: "入りやすい", subtext: "前回空き枠あり", badgeClass: "badge-easy", isAvailableThisYear: true };
    }
    const isNoPastData = !latestRecord || ["unopened", "full", "none", "unknown"].includes(latestRecord.status) || !latestRecord.score;
    if (isNoPastData) {
      const isNew = latestRecord?.status === "unopened";
      return { level: "no-data", label: isNew ? "新設園（実績なし）" : "データなし", subtext: isNew ? "今年度新規開園" : "今年度受入枠あり", badgeClass: "badge-nodata", isAvailableThisYear: true };
    }
    return { ...getRecordDifficulty(userScore, latestRecord), isAvailableThisYear: true };
  }

  const difficultyFor = (item) => getAdmissionDifficulty(state.userScore, item.capacity?.[state.age], admissionFor(item)?.ages?.[state.age]?.years);
  const hasAdmissionInformation = (item) => facilityCategory(item) === "licensed" || Boolean(admissionFor(item));

  function historyValue(record) {
    if (!record) return "—";
    if (record.status === "vacant") return "空きあり";
    if (record.status === "full") return "定員到達";
    if (record.status === "none") return "受入なし";
    if (record.status === "unopened") return "未開園";
    if (record.score) return `${record.score}${record.rank ? `（${record.rank}位）` : ""}`;
    return "—";
  }

  function admissionStatusBox(item, detailed = false) {
    if (!hasAdmissionInformation(item)) return "";
    const difficulty = difficultyFor(item);
    const years = admissionFor(item)?.ages?.[state.age]?.years || {};
    const historyYears = detailed ? ["2022", "2023", "2024", "2025", "2026"] : ["2024", "2025", "2026"];
    const eraLabels = { "2026": "R8", "2025": "R7", "2024": "R6", "2023": "R5", "2022": "R4" };
    const history = historyYears.map((year) => {
      const yearlyDifficulty = getRecordDifficulty(state.userScore, years[year]);
      const latest = year === "2026";
      return `<span class="history-item history-${yearlyDifficulty.level}${latest ? " latest" : ""}" title="持ち点${state.userScore}点での${eraLabels[year]}実績の判定：${safe(yearlyDifficulty.label)}"><span>${eraLabels[year]}</span><strong>${safe(historyValue(years[year]))}</strong></span>`;
    }).join("");
    return `<div class="admission-status-box${detailed ? " admission-status-detail" : ""}">
      <div class="difficulty-header">
        <div class="difficulty-header-main">
          <span class="material-symbols-rounded difficulty-header-icon" aria-hidden="true">analytics</span>
          <span class="difficulty-header-title">入園難易度の目安：</span>
          <span class="difficulty-badge ${difficulty.badgeClass}"><span class="difficulty-dot" aria-hidden="true"></span>${safe(difficulty.label)}（R8）</span>
        </div>
      </div>
      <div class="history-track" aria-label="過去の利用調整実績">${history}</div>
      ${detailed ? `<p class="difficulty-score-note">持ち点${state.userScore}点で判定しています。直近（令和8年度）の利用調整実績をもとにした目安であり、入園を保証するものではありません。</p>` : ""}
    </div>`;
  }

  function admissionDifficultyExplanation() {
    return `<div class="difficulty-explanation">
      <h4><span class="material-symbols-rounded" aria-hidden="true">lightbulb</span>入園難易度（入りやすい / 普通 / 入りにくい）の判定について</h4>
      <p>直近（2026年2月公表・令和8年度）の利用調整結果のデータを元に、簡易的に入園のしやすさを3段階で表示しています。</p>
      <p>直近の最終内定順位（A〜P）と最低指数をもとに、以下のように判定しています：</p>
      <section class="difficulty-rule rule-easy">
        <h5><span class="difficulty-dot" aria-hidden="true"></span>入りやすい</h5>
        <ul>
          <li>ご自身の点数がその園の最低指数を上回っている</li>
          <li>過去3年連続で定員割れ（空き枠）の実績がある</li>
          <li><strong>【40点の場合】</strong>内定順位が下位（H〜P位）まで回ってきている（40点でも届きやすい）</li>
        </ul>
      </section>
      <section class="difficulty-rule rule-normal">
        <h5><span class="difficulty-dot" aria-hidden="true"></span>普通</h5>
        <ul>
          <li>ご自身の持ち点と園の最低指数が同点</li>
          <li><strong>【40点の場合】</strong>内定順位が中位（D〜G位）で決着している（40点で届くかやや不確か）</li>
        </ul>
      </section>
      <section class="difficulty-rule rule-hard">
        <h5><span class="difficulty-dot" aria-hidden="true"></span>入りにくい</h5>
        <ul>
          <li>ご自身の持ち点が最低指数に届いていない</li>
          <li><strong>【40点の場合】</strong>内定順位が上位（A〜C位）で埋まっている（40点の中で上位層のみ内定）</li>
        </ul>
      </section>
      <section class="difficulty-rule rule-nodata">
        <h5><span class="difficulty-dot" aria-hidden="true"></span>データなし</h5>
        <ul>
          <li>直近の選考で受入枠がなかった、または公表資料に対象年齢の最低指数記載がない園</li>
        </ul>
      </section>
      <h5 class="difficulty-question">Q. なぜ持ち点によって判定が変わるの？</h5>
      <p>中央区の認可保育園選考では、ご家庭の就労状況などに応じた「指数（点数）」が高い順に内定が決まります。<br>そのため、同じ保育園でも「ご自身の持ち点が何点か」によって、受かりやすさは大きく変わります。スライダーをお手元の持ち点に合わせることで、持ち点に応じた難易度が表示されます。</p>
      <hr>
      <h5 class="difficulty-question">Q. なぜ同じ「40点」の園でも判定が分かれるの？</h5>
      <p>中央区では、両親フルタイム共働き（基本点20点＋20点＝40点）のご家庭が申込者の大半を占めています。<br>そのため、多くの園で最低指数が「40点」で並び、同点内での優先順位（居住歴や兄弟在園など）によって合否が決まります。<br>この部分をもう少し詳細に見極めるために、40点の場合には内定順位を上位（A〜C：1位から150位）、中位（D〜G：151位から350位）、下位（H〜P：351位から800位）の3段階に分けて上記の判定を行っています。</p>
      <p class="difficulty-note">※「入りやすい／普通／入りにくい」の判定は、過去の公表実績をもとにした独自ロジックによる参考情報（目安）です。実際の入園可能性を保証するものではありません。各年度の申込倍率や募集定員によって変動するため、最新情報や詳細な要件は必ず中央区の公式案内・相談窓口をご確認ください。</p>
    </div>`;
  }

  if (els.difficultyDialogContent) {
    els.difficultyDialogContent.innerHTML = admissionDifficultyExplanation();
  }
  document.querySelectorAll("[data-difficulty-explanation]").forEach((element) => {
    element.innerHTML = admissionDifficultyExplanation();
  });

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

  function matchesCurrentFilters(item) {
    const query = normalized(state.query);
    if (state.category !== "all" && facilityCategory(item) !== state.category) return false;
    if (state.areas.size && !state.areas.has(item.area)) return false;
    if ([...state.features].some((feature) => !matchesFeature(item, feature))) return false;
    if (query && !normalized([item.name, item.address, item.operator, item.type, item.area].join(" ")).includes(query)) return false;
    return true;
  }

  function getFiltered() {
    const filtered = data.filter((item) => {
      if (!matchesCurrentFilters(item)) return false;
      if (state.difficultyLevel) return hasAdmissionInformation(item) && difficultyFor(item).level === state.difficultyLevel;
      return true;
    });
    const direction = state.sortDirection === "desc" ? -1 : 1;
    filtered.sort((a, b) => {
      if (state.sort === "number") {
        return facilityCategoryOrder[facilityCategory(a)] - facilityCategoryOrder[facilityCategory(b)]
          || direction * ((Number(a.number) || 9999) - (Number(b.number) || 9999))
          || a.name.localeCompare(b.name, "ja");
      }
      const valueFor = (item) => state.sort === "capacity" ? item.capacity?.total : item[state.sort];
      const av = valueFor(a);
      const bv = valueFor(b);
      const aMissing = !present(av);
      const bMissing = !present(bv);
      if (aMissing !== bMissing) return aMissing ? 1 : -1;
      if (aMissing && bMissing) return (Number(a.number) || 9999) - (Number(b.number) || 9999);
      const compared = state.sort === "opened"
        ? String(av).localeCompare(String(bv))
        : Number(av) - Number(bv);
      return direction * compared
        || (Number(a.number) || 9999) - (Number(b.number) || 9999)
        || a.name.localeCompare(b.name, "ja");
    });
    return filtered;
  }

  function renderAdmissionSummary() {
    const counts = { easy: 0, normal: 0, hard: 0, "no-data": 0 };
    data.filter(matchesCurrentFilters).filter(hasAdmissionInformation).forEach((item) => {
      const level = difficultyFor(item).level;
      if (Object.hasOwn(counts, level)) counts[level] += 1;
    });
    els.admissionSummary.innerHTML = `<div class="admission-summary-heading"><span><span class="material-symbols-rounded">analytics</span>${safe(admissionAgeLabels[state.age])}・持ち点${state.userScore}点の目安</span><small>認可園を集計</small></div>
      <div class="admission-summary-counts">
        <button type="button" class="summary-easy${state.difficultyLevel === "easy" ? " is-active" : ""}" data-difficulty-level="easy" aria-pressed="${state.difficultyLevel === "easy"}"><span class="difficulty-dot" aria-hidden="true"></span>入りやすい <strong>${counts.easy}園</strong></button>
        <button type="button" class="summary-normal${state.difficultyLevel === "normal" ? " is-active" : ""}" data-difficulty-level="normal" aria-pressed="${state.difficultyLevel === "normal"}"><span class="difficulty-dot" aria-hidden="true"></span>普通 <strong>${counts.normal}園</strong></button>
        <button type="button" class="summary-hard${state.difficultyLevel === "hard" ? " is-active" : ""}" data-difficulty-level="hard" aria-pressed="${state.difficultyLevel === "hard"}"><span class="difficulty-dot" aria-hidden="true"></span>入りにくい <strong>${counts.hard}園</strong></button>
        <button type="button" class="summary-nodata${state.difficultyLevel === "no-data" ? " is-active" : ""}" data-difficulty-level="no-data" aria-pressed="${state.difficultyLevel === "no-data"}"><span class="difficulty-dot" aria-hidden="true"></span>データなし <strong>${counts["no-data"]}園</strong></button>
      </div>`;
  }

  function metric(icon, label, value) {
    return `<div class="metric"><span class="metric-label"><span class="material-symbols-rounded metric-icon">${icon}</span>${safe(label)}</span><strong>${safe(value)}</strong></div>`;
  }

  function featureTags(item) {
    // 認可園・こども園以外などで設備情報が存在しない施設の場合はアイコンを表示しない
    const hasAnyFeatureData = Boolean(
      item.gardenLabel ||
      (item.gardenArea ?? 0) > 0 ||
      present(item.bicycle) ||
      present(item.stroller) ||
      present(item.contactApp) ||
      present(item.medicalCare)
    );
    if (!hasAnyFeatureData) return "";

    const list = [
      { label: "園庭あり", icon: "yard", available: yes(item.gardenLabel) || (item.gardenArea ?? 0) > 0 },
      { label: "駐輪場所あり", icon: "pedal_bike", available: yes(item.bicycle) },
      { label: "ベビーカー置場あり", icon: "stroller", available: yes(item.stroller) },
      { label: "連絡アプリあり", icon: "smartphone", available: yes(item.contactApp) },
      { label: "医ケア児受入あり", icon: "medical_services", available: yes(item.medicalCare) },
      { label: "第三者評価あり", icon: "rate_review", available: Boolean(evaluationFor(item)) },
    ];
    return list.map(({ label, icon, available }) =>
      `<span class="feature-tag ${available ? "tag-available" : "tag-unavailable"}"><span class="material-symbols-rounded tag-icon">${icon}</span>${safe(label)}</span>`
    ).join("");
  }

  function renderCard(item) {
    const node = els.template.content.cloneNode(true);
    const card = node.querySelector(".nursery-card");
    card.style.setProperty("--area-color", areaColor(item.area));
    node.querySelector(".area-badge").textContent = item.area || "中央区";
    node.querySelector(".category-label").textContent = item.type || item.category;
    node.querySelector(".nursery-name").textContent = item.name;
    const opText = node.querySelector(".operator-text");
    if (opText) opText.textContent = item.operator || "運営者情報なし";
    const addrText = node.querySelector(".address-text");
    if (addrText) addrText.textContent = item.address || "住所情報なし";
    node.querySelector(".metric-grid").innerHTML = [
      metric("groups", "定員", present(item.capacity?.total) ? `${formatNum(item.capacity.total)}人` : "—"),
      metric("square_foot", "1人あたり面積", present(item.areaPerChild) ? `${formatNum(item.areaPerChild, 1)}㎡` : "—"),
      metric("event", "開設", formatDate(item.opened)),
    ].join("");
    node.querySelector(".admission-status-slot").innerHTML = admissionStatusBox(item);
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
    if (els.count) els.count.textContent = items.length;
    els.grid.replaceChildren(...items.map(renderCard));
    els.grid.hidden = items.length === 0;
    els.empty.hidden = items.length !== 0;
    renderActiveFilters();
    renderAdmissionSummary();
    renderCompareDock();
    syncControls();
  }

  function renderActiveFilters() {
    if (els.active) els.active.innerHTML = "";
  }

  function syncControls() {
    document.querySelectorAll("[data-category]").forEach((button) => button.classList.toggle("is-active", button.dataset.category === state.category));
    document.querySelectorAll("[data-age]").forEach((button) => button.classList.toggle("is-active", button.dataset.age === state.age));
    document.querySelectorAll('input[name="area"]').forEach((input) => { input.checked = state.areas.has(input.value); });
    document.querySelectorAll('input[name="feature"]').forEach((input) => { input.checked = state.features.has(input.value); });
    els.scoreInputs.forEach((input) => { input.value = String(state.userScore); });
    els.scoreOutputs.forEach((output) => { output.textContent = `${state.userScore}点`; });
    document.querySelectorAll("[data-quick]").forEach((button) => {
      const value = button.dataset.quick;
      button.classList.toggle("is-active", value === state.age || state.features.has(value));
    });
    els.sort.value = state.sort;
    const directionLabels = {
      number: ["小さい番号順", "大きい番号順"],
      areaPerChild: ["狭い順", "広い順"],
      gardenPerChild: ["狭い順", "広い順"],
      teacherPerChild: ["少ない順", "多い順"],
      opened: ["古い順", "新しい順"],
      capacity: ["少ない順", "多い順"],
    }[state.sort];
    els.sortDirectionButtons.forEach((button, index) => {
      const active = button.dataset.sortDirection === state.sortDirection;
      button.textContent = directionLabels[index];
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    if (document.activeElement !== els.search) els.search.value = state.query;
  }

  function reset() {
    state.query = ""; state.category = "all"; state.areas.clear(); state.age = "age1"; state.userScore = 40; state.difficultyLevel = null; state.features.clear(); state.sort = "number"; state.sortDirection = "asc";
    els.search.value = "";
    render();
  }

  const filterMedia = window.matchMedia("(max-width: 760px)");
  function setFilterOpen(open, returnFocus = true) {
    const wasOpen = els.filterPanel.classList.contains("is-open");
    const shouldOpen = filterMedia.matches && open;
    els.filterPanel.classList.toggle("is-open", shouldOpen);
    els.filterBackdrop.classList.toggle("is-open", shouldOpen);
    document.body.classList.toggle("filter-open", shouldOpen);
    els.filterOpen.setAttribute("aria-expanded", String(shouldOpen));
    if (filterMedia.matches) els.filterPanel.setAttribute("aria-hidden", String(!shouldOpen));
    else els.filterPanel.removeAttribute("aria-hidden");
    if (shouldOpen) requestAnimationFrame(() => els.filterClose.focus());
    else if (wasOpen && returnFocus) els.filterOpen.focus();
  }

  function detailCell(label, value, icon) {
    const iconHtml = icon ? `<span class="material-symbols-rounded cell-icon">${icon}</span>` : "";
    return `<div class="detail-cell"><span class="cell-label">${iconHtml}${safe(label)}</span><strong>${safe(present(value) ? value : "—")}</strong></div>`;
  }

  function rankedValue(value, getValue, digits, unit) {
    const current = Number(value);
    if (!Number.isFinite(current) || current <= 0) return "—";
    const available = data
      .map((item) => Number(getValue(item)))
      .filter((candidate) => Number.isFinite(candidate) && candidate > 0);
    const rank = 1 + available.filter((candidate) => candidate > current).length;
    return `${formatNum(current, digits)}${unit} (${rank}/${available.length})`;
  }

  function evaluationSection(item) {
    const evaluation = evaluationFor(item);
    if (!evaluation) return "";
    const themes = (label, values, kind, icon) => values?.length ? `<div class="evaluation-theme ${kind}"><strong><span class="material-symbols-rounded icon-inline-sm">${icon}</span>${safe(label)}</strong><div>${values.map((value) => `<span>${safe(value)}</span>`).join("")}</div></div>` : "";
    return `<section class="detail-section evaluation-section">
      <div class="evaluation-heading">
        <div>
          <p class="evaluation-kicker"><span class="material-symbols-rounded icon-inline">rate_review</span>福ナビ・第三者評価</p>
          <h3>利用者調査と評価講評</h3>
        </div>
      </div>
      <div class="evaluation-stats">
        <div>
          <span><span class="material-symbols-rounded icon-inline-sm">sentiment_very_satisfied</span>総合満足</span>
          <strong>${formatNum(evaluation.satisfaction, 1)}%</strong>
          <small>「大変満足」＋「満足」</small>
        </div>
        <div>
          <span><span class="material-symbols-rounded icon-inline-sm">favorite</span>子どもの気持ちを尊重</span>
          <strong>${formatNum(evaluation.keyItems?.respect?.yesRate, 1)}%</strong>
          <small>「はい」の割合</small>
        </div>
        <div>
          <span><span class="material-symbols-rounded icon-inline-sm">handshake</span>園と家庭の信頼関係</span>
          <strong>${formatNum(evaluation.keyItems?.trust?.yesRate, 1)}%</strong>
          <small>「はい」の割合</small>
        </div>
        <div>
          <span><span class="material-symbols-rounded icon-inline-sm">verified_user</span>安全対策</span>
          <strong>${formatNum(evaluation.keyItems?.safety?.yesRate, 1)}%</strong>
          <small>「はい」の割合</small>
        </div>
      </div>
      <div class="evaluation-bar" aria-label="総合満足 ${safe(evaluation.satisfaction)}%"><span style="width:${Math.max(0, Math.min(100, Number(evaluation.satisfaction) || 0))}%"></span></div>
      <div class="evaluation-themes">
        ${themes("評価機関が挙げたよい点", evaluation.goodThemes, "good", "thumb_up")}
        ${themes("今後の改善テーマ", evaluation.improveThemes, "improve", "lightbulb")}
      </div>
      <div class="evaluation-comment">
        <strong><span class="material-symbols-rounded icon-inline-sm">comment</span>調査結果全体のコメント</strong>
        <p>${safe(evaluation.comment || evaluation.commentSummary || "公式レポートで調査結果をご確認ください。")}</p>
      </div>
      <p class="evaluation-agency"><span class="material-symbols-rounded icon-inline-sm">business</span>評価機関：${safe(evaluation.agency || "福ナビ掲載の評価機関")}</p>
      <p class="evaluation-note">※「はい」の割合には無回答・非該当も含まれるため、低い数値がそのまま不満の割合を表すものではありません。テーマ分類は、公式レポートを探しやすくするためこのサイトで整理しています。</p>
      <div class="evaluation-actions">
        <a href="${safe(evaluation.url)}" target="_blank" rel="noreferrer">
          <span class="material-symbols-rounded">open_in_new</span>公式レポートを読む
        </a>
      </div>
    </section>`;
  }

  function admissionDetailSection(item) {
    if (!hasAdmissionInformation(item)) return "";
    return `<section class="detail-section admission-detail-section">
      <div class="admission-detail-heading">
        <div>
          <p class="admission-detail-kicker"><span class="material-symbols-rounded icon-inline">analytics</span>利用調整実績から判定</p>
          <h3>入園難易度の目安</h3>
        </div>
        <span class="score-pill">持ち点 ${state.userScore}点</span>
      </div>
      ${admissionStatusBox(item, true)}
      <details class="difficulty-help detail-difficulty-help">
        <summary>判定方法と注意点</summary>
        <div>
          ${admissionDifficultyExplanation()}
        </div>
      </details>
    </section>`;
  }

  function showDetail(item) {
    const evaluation = evaluationFor(item);
    const mapUrl = present(item.lat) && present(item.lng) ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${item.lat},${item.lng}`)}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.address || item.name)}`;
    const ages = [["57d", "0歳・57日"], ["7m", "0歳・7か月"], ["age1", "1歳"], ["age2", "2歳"], ["age3", "3歳"], ["age4", "4歳"], ["age5", "5歳"]];
    const capacity = ages.map(([key, label]) => detailCell(label, present(item.capacity?.[key]) ? `${formatNum(item.capacity[key])}人` : "—", "cake")).join("");
    const daily = [
      ["駐輪スペース", item.bicycle, "pedal_bike"],
      ["ベビーカー置場", item.stroller, "stroller"],
      ["おむつの準備", item.diaperPrep, "baby_changing_station"],
      ["おむつの処分", item.diaperDispose, "delete_outline"],
      ["布団カバー準備", item.beddingPrep, "bed"],
      ["付け外し", item.beddingAttach, "build"],
      ["洗濯", item.beddingWash, "local_laundry_service"],
      ["連絡アプリ", item.contactApp, "smartphone"],
      ["制服", item.uniform, "checkroom"],
    ].map(([label, value, icon]) => detailCell(label, value, icon)).join("");
    const links = [`<a href="${mapUrl}" target="_blank" rel="noreferrer"><span class="material-symbols-rounded">map</span>地図で見る</a>`];
    if (present(item.website) && /^https?:/.test(item.website)) links.push(`<a href="${safe(item.website)}" target="_blank" rel="noreferrer"><span class="material-symbols-rounded">public</span>施設サイト</a>`);
    if (evaluation) links.push(`<a href="${safe(evaluation.url)}" target="_blank" rel="noreferrer"><span class="material-symbols-rounded">rate_review</span>第三者評価</a>`);
    else if (present(item.evaluation) && /^https?:/.test(item.evaluation)) links.push(`<a href="${safe(item.evaluation)}" target="_blank" rel="noreferrer"><span class="material-symbols-rounded">rate_review</span>第三者評価</a>`);
    els.detailContent.innerHTML = `
      <div class="detail-hero">
        <div class="dialog-kicker"><span class="material-symbols-rounded icon-inline">apartment</span>${safe(item.area || "中央区")} / ${safe(item.type || item.category)}</div>
        <h2>${safe(item.name)}</h2>
        <p class="detail-subtitle">${safe(item.operator || "")}<br><span class="material-symbols-rounded icon-inline-sm">location_on</span>${safe(item.address || "住所情報なし")}</p>
        <div class="detail-links">${links.join("")}</div>
      </div>
      <section class="detail-section">
        <h3><span class="material-symbols-rounded icon-inline">cake</span>各年齢の定員</h3>
        <div class="detail-grid">${capacity}</div>
      </section>
      <section class="detail-section">
        <h3><span class="material-symbols-rounded icon-inline">apartment</span>施設・職員体制</h3>
        <div class="detail-grid">
          ${detailCell("定員合計", rankedValue(item.capacity?.total, (nursery) => nursery.capacity?.total, 0, "人"), "groups")}
          ${detailCell("延床面積", rankedValue(item.floorArea, (nursery) => nursery.floorArea, 1, "㎡"), "square_foot")}
          ${detailCell("1人あたり延床面積", rankedValue(item.areaPerChild, (nursery) => nursery.areaPerChild, 1, "㎡"), "straighten")}
          ${detailCell("園庭", item.gardenLabel, "yard")}
          ${detailCell("園庭面積", rankedValue(item.gardenArea, (nursery) => nursery.gardenArea, 1, "㎡"), "park")}
          ${detailCell("保育士数", rankedValue(item.nurseryTeachers, (nursery) => nursery.nurseryTeachers, 1, "人"), "badge")}
          ${detailCell("職員数", rankedValue(item.totalStaff, (nursery) => nursery.totalStaff, 1, "人"), "support_agent")}
          ${detailCell("医療的ケア児", item.medicalCare, "medical_services")}
          ${detailCell("エレベーター", item.elevator, "elevator")}
        </div>
      </section>
      ${item.category === "認可保育園・こども園" ? `
      <section class="detail-section">
        <h3><span class="material-symbols-rounded icon-inline">checklist</span>毎日の準備・設備</h3>
        <div class="detail-grid">${daily}</div>
      </section>` : ""}
      ${admissionDetailSection(item)}
      ${evaluationSection(item)}
      ${present(item.inspectionDetail) ? `
      <section class="detail-section">
        <h3><span class="material-symbols-rounded icon-inline">policy</span>指導検査</h3>
        <div class="note">${safe(item.inspectionDetail)}</div>
      </section>` : ""}
      ${present(item.note) ? `
      <section class="detail-section">
        <h3><span class="material-symbols-rounded icon-inline">notes</span>備考</h3>
        <div class="note">${safe(item.note)}</div>
      </section>` : ""}`;
    els.detailDialog.showModal();
    if (els.detailContent) els.detailContent.scrollTop = 0;
    els.detailDialog.scrollTop = 0;
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
    const row = (label, icon, getValue, options = {}) => {
      const values = items.map(getValue);
      const numericValues = values.filter(present).map(Number).filter(Number.isFinite);
      const distinctValues = new Set(numericValues);
      const maximum = options.highlight === "max" && distinctValues.size > 1 ? Math.max(...numericValues) : null;
      const cells = values.map((value) => {
        const highlighted = (maximum !== null && present(value) && Number(value) === maximum)
          || (options.highlight === "yes" && normalized(value) === "あり");
        const display = options.format ? options.format(value) : (value ?? "—");
        return `<td${highlighted ? ' class="compare-cell-highlight"' : ""}>${safe(display)}</td>`;
      }).join("");
      return `<tr><th scope="row"><span class="table-th-label">${icon ? `<span class="material-symbols-rounded table-icon">${icon}</span>` : ""}${safe(label)}</span></th>${cells}</tr>`;
    };
    const numberFormat = (unit, digits = 0) => (value) => present(value) ? `${formatNum(value, digits)}${unit}` : "—";
    els.compareContent.innerHTML = `<table class="compare-table"><thead><tr><th>比較項目</th>${items.map((item) => `<th>${safe(item.name)}</th>`).join("")}</tr></thead><tbody>
      ${row("エリア", "location_on", (x) => x.area)}
      ${row("種別", "category", (x) => x.type)}
      ${row("定員合計", "groups", (x) => x.capacity?.total, { highlight: "max", format: numberFormat("人") })}
      ${row("0歳・生後57日", "cake", (x) => x.capacity?.["57d"], { highlight: "max", format: numberFormat("人") })}
      ${row("0歳・生後7か月", "cake", (x) => x.capacity?.["7m"], { highlight: "max", format: numberFormat("人") })}
      ${row("延床面積", "square_foot", (x) => x.floorArea, { highlight: "max", format: numberFormat("㎡", 1) })}
      ${row("1人あたり延床面積", "straighten", (x) => x.areaPerChild, { highlight: "max", format: numberFormat("㎡", 1) })}
      ${row("園庭", "yard", (x) => x.gardenLabel, { highlight: "yes" })}
      ${row("駐輪スペース", "pedal_bike", (x) => x.bicycle, { highlight: "yes" })}
      ${row("ベビーカー置場", "stroller", (x) => x.stroller, { highlight: "yes" })}
      ${row("利用者の総合満足", "sentiment_very_satisfied", (x) => evaluationFor(x)?.satisfaction, { highlight: "max", format: numberFormat("%", 1) })}
      ${row("子どもの気持ちを尊重", "favorite", (x) => evaluationFor(x)?.keyItems?.respect?.yesRate, { highlight: "max", format: numberFormat("%", 1) })}
      ${row("園と家庭の信頼関係", "handshake", (x) => evaluationFor(x)?.keyItems?.trust?.yesRate, { highlight: "max", format: numberFormat("%", 1) })}
      ${row("安全対策", "verified_user", (x) => evaluationFor(x)?.keyItems?.safety?.yesRate, { highlight: "max", format: numberFormat("%", 1) })}
      ${row("おむつ準備", "baby_changing_station", (x) => x.diaperPrep)}
      ${row("おむつ処分", "delete_outline", (x) => x.diaperDispose)}
      ${row("連絡アプリ", "smartphone", (x) => x.contactApp, { highlight: "yes" })}
      ${row("住所", "place", (x) => x.address)}</tbody><tfoot><tr class="compare-actions-row"><th scope="row"><span class="table-th-label"><span class="material-symbols-rounded table-icon">open_in_new</span>詳細</span></th>${items.map((item) => `<td><button class="compare-detail-button" type="button" data-compare-detail="${safe(item.id)}" aria-label="${safe(item.name)}の詳細を見る"><span class="material-symbols-rounded">info</span>詳細を見る</button></td>`).join("")}</tr></tfoot></table>`;
    els.compareContent.querySelectorAll("[data-compare-detail]").forEach((button) => {
      button.addEventListener("click", () => {
        const item = data.find((nursery) => nursery.id === button.dataset.compareDetail);
        if (!item) return;
        els.compareDialog.close();
        showDetail(item);
      });
    });
    els.compareDialog.showModal();
  }

  function registerWebMcp() {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const allowed = {
      category: ["all", "licensed", "certified", "unlicensed", "other"],
      areas: ["京橋", "日本橋", "月島"],
      age: ["57d", "7m", "age1", "age2", "age3", "age4", "age5"],
      features: ["garden", "bicycle", "stroller", "diaper", "contactApp", "medical", "evaluation"],
      sort: ["number", "areaPerChild", "gardenPerChild", "teacherPerChild", "opened", "capacity"],
      sortDirection: ["asc", "desc"],
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
          sortDirection: { type: "string", enum: allowed.sortDirection },
          userScore: { type: "integer", minimum: 38, maximum: 43, description: "保活指数（持ち点）" },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        const value = input && typeof input === "object" ? input : {};
        if (value.category !== undefined && !allowed.category.includes(value.category)) throw new Error("categoryが不正です");
        if (value.age !== undefined && !allowed.age.includes(value.age)) throw new Error("ageが不正です");
        if (value.sort !== undefined && !allowed.sort.includes(value.sort)) throw new Error("sortが不正です");
        if (value.sortDirection !== undefined && !allowed.sortDirection.includes(value.sortDirection)) throw new Error("sortDirectionが不正です");
        if (value.areas !== undefined && (!Array.isArray(value.areas) || value.areas.some((x) => !allowed.areas.includes(x)))) throw new Error("areasが不正です");
        if (value.features !== undefined && (!Array.isArray(value.features) || value.features.some((x) => !allowed.features.includes(x)))) throw new Error("featuresが不正です");
        state.query = typeof value.query === "string" ? value.query : "";
        state.category = value.category ?? "all";
        state.areas = new Set(value.areas ?? []);
        state.age = value.age ?? "age1";
        if (value.userScore !== undefined && (!Number.isInteger(value.userScore) || value.userScore < 38 || value.userScore > 43)) throw new Error("userScoreが不正です");
        state.userScore = value.userScore ?? 40;
        state.difficultyLevel = null;
        state.features = new Set(value.features ?? []);
        state.sort = value.sort ?? "number";
        state.sortDirection = value.sortDirection ?? "asc";
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
  els.sort.addEventListener("change", (event) => { state.sort = event.target.value; render(); });
  els.sortDirectionButtons.forEach((button) => button.addEventListener("click", () => { state.sortDirection = button.dataset.sortDirection; render(); }));
  document.querySelectorAll("[data-category]").forEach((button) => button.addEventListener("click", () => { state.category = button.dataset.category; render(); }));
  document.querySelectorAll("[data-age]").forEach((button) => button.addEventListener("click", () => { state.age = button.dataset.age; render(); }));
  els.scoreInputs.forEach((input) => input.addEventListener("input", () => { state.userScore = Number(input.value); render(); }));
  els.admissionSummary.addEventListener("click", (event) => {
    const button = event.target.closest("[data-difficulty-level]");
    if (!button) return;
    const level = button.dataset.difficultyLevel;
    state.difficultyLevel = state.difficultyLevel === level ? null : level;
    render();
  });
  document.querySelectorAll('input[name="area"]').forEach((input) => input.addEventListener("change", () => { input.checked ? state.areas.add(input.value) : state.areas.delete(input.value); render(); }));
  document.querySelectorAll('input[name="feature"]').forEach((input) => input.addEventListener("change", () => { input.checked ? state.features.add(input.value) : state.features.delete(input.value); render(); }));
  document.querySelectorAll("[data-quick]").forEach((button) => button.addEventListener("click", () => {
    const value = button.dataset.quick;
    if (["57d", "7m"].includes(value)) state.age = value;
    else state.features.has(value) ? state.features.delete(value) : state.features.add(value);
    render();
  }));
  document.querySelectorAll("[data-reset]").forEach((button) => button.addEventListener("click", reset));
  els.filterOpen.addEventListener("click", () => setFilterOpen(true));
  document.querySelectorAll("[data-filter-close]").forEach((button) => button.addEventListener("click", () => setFilterOpen(false)));
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && els.filterPanel.classList.contains("is-open")) setFilterOpen(false); });
  filterMedia.addEventListener?.("change", () => setFilterOpen(false, false));
  document.querySelectorAll("[data-open-about]").forEach((button) => button.addEventListener("click", () => els.aboutDialog.showModal()));
  document.querySelectorAll("[data-open-difficulty]").forEach((button) => button.addEventListener("click", () => els.difficultyDialog.showModal()));
  document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
  document.querySelectorAll("dialog").forEach((dialog) => dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); }));
  document.querySelector("#open-compare").addEventListener("click", showCompare);
  registerWebMcp();
  setFilterOpen(false, false);
  render();
})();
