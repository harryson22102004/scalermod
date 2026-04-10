const navRoot = document.getElementById("nav-root");
const appRoot = document.getElementById("app");
const toastTemplate = document.getElementById("toast-template");

const API = {
  scenarios: "/api/v1/scenarios",
  scenario: (key) => `/api/v1/scenarios/${encodeURIComponent(key)}`,
  reset: "/api/v1/env/reset",
  step: (envId) => `/api/v1/env/${encodeURIComponent(envId)}/step`,
  destroy: (envId) => `/api/v1/env/${encodeURIComponent(envId)}`,
};

const state = {
  path: normalizePath(window.location.pathname),
  scenarios: {},
  order: [],
  builderScenario: null,
  playground: {
    envId: null,
    scenarioKey: null,
    score: 0,
    step: 0,
    maxSteps: 50,
    taskName: "",
    description: "",
    cwd: "~",
    done: false,
  },
};

const AUTO_PLAYBOOK = {
  llm: {
    log_analysis: ["grep 500 /var/log/app.log"],
    permission_repair: ["chmod 0755 /home/user/scripts/cleanup.sh"],
    process_recovery: ["ps", "systemctl restart postgres", "systemctl status postgres"],
    cascading_db_failure: ["ps", "systemctl restart postgres", "df -h", "rm /var/log/nginx/error.log", "systemctl restart app"],
    full_incident: ["ps", "df -h", "systemctl restart postgres", "rm /var/log/nginx/error.log", "grep auth /var/log/auth.log"],
  },
  rl: {
    log_analysis: ["cat /var/log/app.log", "grep 500 /var/log/app.log"],
    process_recovery: ["systemctl restart postgres", "systemctl status postgres"],
    cascading_db_failure: ["systemctl restart postgres", "rm /var/log/nginx/error.log", "systemctl restart app"],
  },
};

function normalizePath(pathname) {
  const normalized = pathname.replace(/\/+$/, "");
  return normalized.length ? normalized : "/";
}

function routeKey(path) {
  if (path === "/builder") return "builder";
  if (path === "/playground") return "playground";
  if (path === "/arena") return "arena";
  return "hub";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function splitLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function getQueryScenario() {
  const params = new URLSearchParams(window.location.search);
  return params.get("scenario") || "";
}

function showToast(message) {
  if (!toastTemplate) return;
  const toast = toastTemplate.content.firstElementChild.cloneNode(true);
  toast.textContent = message;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 2200);
}

async function fetchJSON(url, options = {}) {
  const config = { ...options };
  config.headers = {
    ...(options.headers || {}),
  };
  if (config.body && !config.headers["Content-Type"]) {
    config.headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, config);
  if (!response.ok) {
    let details = `${response.status} ${response.statusText}`;
    try {
      const payload = await response.json();
      if (payload?.detail) {
        details = payload.detail;
      }
    } catch {
      // Fallback to status text.
    }
    throw new Error(details);
  }

  return response.json();
}

function difficultyMeta(diff) {
  const value = (diff || "").toLowerCase();
  if (value === "easy") {
    return {
      label: "SAFE",
      textClass: "text-chaos-green",
      bgClass: "bg-chaos-green/10",
      borderClass: "border-chaos-green/20",
      specsClass: "text-chaos-green",
      iconColorClass: "text-chaos-green",
    };
  }
  if (value === "medium") {
    return {
      label: "MEDIUM",
      textClass: "text-chaos-cyan",
      bgClass: "bg-chaos-cyan/10",
      borderClass: "border-chaos-cyan/20",
      specsClass: "text-chaos-cyan",
      iconColorClass: "text-chaos-cyan",
    };
  }
  if (value === "hard") {
    return {
      label: "CRITICAL",
      textClass: "text-chaos-red",
      bgClass: "bg-chaos-red/10",
      borderClass: "border-chaos-red/20",
      specsClass: "text-chaos-red",
      iconColorClass: "text-chaos-red",
    };
  }
  return {
    label: "EXPERT",
    textClass: "text-chaos-red",
    bgClass: "bg-chaos-red/10",
    borderClass: "border-chaos-red/50",
    specsClass: "text-chaos-red",
    iconColorClass: "text-chaos-red",
  };
}

function scenarioEntries() {
  return state.order.map((key) => [key, state.scenarios[key]]).filter(([, value]) => Boolean(value));
}

function iconMarkup(key, colorClass) {
  if (key === "process_recovery" || key === "cascading_db_failure") {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-server w-5 h-5 ${colorClass}" aria-hidden="true"><rect width="20" height="8" x="2" y="2" rx="2" ry="2"></rect><rect width="20" height="8" x="2" y="14" rx="2" ry="2"></rect><line x1="6" x2="6.01" y1="6" y2="6"></line><line x1="6" x2="6.01" y1="18" y2="18"></line></svg>`;
  }
  if (key === "disk_space_crisis") {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-hard-drive w-5 h-5 ${colorClass}" aria-hidden="true"><path d="M10 16h.01"></path><path d="M2.212 11.577a2 2 0 0 0-.212.896V18a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5.527a2 2 0 0 0-.212-.896L18.55 5.11A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path><path d="M21.946 12.013H2.054"></path><path d="M6 16h.01"></path></svg>`;
  }
  if (key === "security_incident") {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-skull w-5 h-5 ${colorClass}" aria-hidden="true"><path d="m12.5 17-.5-1-.5 1h1z"></path><path d="M15 22a1 1 0 0 0 1-1v-1a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20v1a1 1 0 0 0 1 1z"></path><circle cx="15" cy="12" r="1"></circle><circle cx="9" cy="12" r="1"></circle></svg>`;
  }
  if (key === "memory_leak") {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-activity w-5 h-5 ${colorClass}" aria-hidden="true"><path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"></path></svg>`;
  }
  if (key === "network_troubleshooting") {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-globe w-5 h-5 ${colorClass}" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"></path><path d="M2 12h20"></path></svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-cpu w-5 h-5 ${colorClass}" aria-hidden="true"><path d="M12 20v2"></path><path d="M12 2v2"></path><path d="M17 20v2"></path><path d="M17 2v2"></path><path d="M2 12h2"></path><path d="M2 17h2"></path><path d="M2 7h2"></path><path d="M20 12h2"></path><path d="M20 17h2"></path><path d="M20 7h2"></path><path d="M7 20v2"></path><path d="M7 2v2"></path><rect x="4" y="4" width="16" height="16" rx="2"></rect><rect x="8" y="8" width="8" height="8" rx="1"></rect></svg>`;
}

function renderNav() {
  const active = routeKey(state.path);

  const navLink = (href, key, label) => {
    const activeClass = key === active
      ? "text-chaos-green border-b-2 border-chaos-green py-5 -mb-[22px]"
      : "text-chaos-muted";
    return `<a class="hover:text-chaos-text transition-colors ${activeClass}" href="${href}">${label}</a>`;
  };

  navRoot.innerHTML = `
    <nav class="sticky top-0 z-50 w-full border-b border-chaos-border bg-chaos-dark/80 backdrop-blur-md">
      <div class="flex h-16 items-center px-4 gap-6">
        <a class="flex items-center gap-2" href="/">
          <span class="text-xl font-bold text-chaos-green tracking-tight">Chaos<span class="text-chaos-text">Lab</span></span>
        </a>
        <div class="flex items-center gap-6 flex-1 ml-4 text-sm font-medium overflow-x-auto">
          ${navLink("/", "hub", "Hub")}
          ${navLink("/builder", "builder", "Builder")}
          ${navLink("/playground", "playground", "Playground")}
          ${navLink("/arena", "arena", "Arena")}
        </div>
        <div class="flex items-center gap-4">
          <div class="relative group hidden md:block">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-chaos-muted group-focus-within:text-chaos-green transition-colors" aria-hidden="true"><path d="m21 21-4.34-4.34"></path><circle cx="11" cy="11" r="8"></circle></svg>
            <input id="navbar-search" placeholder="Search experiments..." class="bg-chaos-panel border border-chaos-border rounded-md pl-9 pr-8 py-1.5 text-sm outline-none focus:border-chaos-green/50 focus:bg-chaos-panel-hover focus:shadow-[0_0_12px_rgba(57,255,20,0.1)] transition-all w-64 text-chaos-text placeholder:text-chaos-muted" type="text" value="" />
          </div>
        </div>
      </div>
    </nav>
  `;
}

function buildManifest(detail) {
  const lines = [
    `scenario: "${detail.name}"`,
    `key: "${detail.key}"`,
    `difficulty: ${detail.difficulty}`,
    `max_steps: ${detail.max_steps}`,
    "",
    "faults:",
  ];

  detail.faults.forEach((fault, index) => {
    lines.push(`  - id: "fault-${index}"`);
    lines.push(`    name: "${fault.name}"`);
    lines.push(`    type: "${fault.apply_fn}"`);
    lines.push(`    args: ${JSON.stringify(fault.params)}`);
  });

  lines.push("", "cascades:");
  detail.cascades.forEach((cascade) => {
    lines.push(`  - condition: "${cascade.condition_fn}"`);
    lines.push(`    when: ${JSON.stringify(cascade.condition_params)}`);
    lines.push(`    trigger: "${cascade.effect.apply_fn}"`);
    lines.push(`    opts: ${JSON.stringify(cascade.effect.params)}`);
  });

  lines.push("", "objectives:");
  detail.objectives.forEach((objective) => {
    lines.push(`  - check: "${objective.check_fn}"`);
    lines.push(`    description: "${objective.description}"`);
    lines.push(`    points: ${objective.points}`);
  });

  return lines.join("\n");
}

function metrics(detail) {
  const faults = detail.faults.length;
  const cascades = detail.cascades.length;
  const objectives = detail.objectives.length;
  const blastRadius = Math.min(99, faults * 3 + cascades * 2 + objectives * 1.2);
  const complexityBase = detail.difficulty === "expert" ? 0.9 : detail.difficulty === "hard" ? 0.76 : detail.difficulty === "medium" ? 0.58 : 0.42;
  const complexity = Math.min(0.99, complexityBase + faults * 0.01 + cascades * 0.01);
  return { faults, cascades, objectives, blastRadius, complexity };
}

function renderHub() {
  const cards = scenarioEntries().map(([key, scenario]) => {
    const meta = difficultyMeta(scenario.difficulty);
    return `
      <a href="/playground?scenario=${encodeURIComponent(key)}">
        <div class="h-full group flex flex-col bg-chaos-panel/50 border border-chaos-border hover:border-chaos-green/50 rounded-lg p-6 transition-all hover:bg-chaos-panel hover:shadow-[0_0_20px_rgba(57,255,20,0.05)] cursor-pointer">
          <div class="flex justify-between items-start mb-4">
            <div class="w-10 h-10 rounded-md bg-chaos-darker flex items-center justify-center border border-chaos-border group-hover:border-chaos-green/30 transition-colors">
              ${iconMarkup(key, meta.iconColorClass)}
            </div>
            <span class="text-[10px] font-bold px-2 py-1 rounded border ${meta.textClass} ${meta.bgClass} ${meta.borderClass}">${meta.label}</span>
          </div>
          <h3 class="text-lg font-bold mb-2">${escapeHtml(scenario.name)}</h3>
          <p class="text-chaos-muted text-sm flex-1 mb-6 leading-relaxed line-clamp-3">${escapeHtml(scenario.description || "")}</p>
          <div class="flex flex-wrap gap-2 text-[10px] font-mono text-chaos-muted">
            <span class="bg-chaos-darker px-2 py-1 rounded border border-chaos-border">${escapeHtml(String(scenario.objectives_count || 0))} OBJS</span>
            <span class="bg-chaos-darker px-2 py-1 rounded border border-chaos-border">MAX ${escapeHtml(String(scenario.max_steps || 50))} STEPS</span>
          </div>
        </div>
      </a>
    `;
  }).join("");

  const featuredKey = state.scenarios.full_incident ? "full_incident" : state.order[0];
  const featured = state.scenarios[featuredKey] || null;
  const featuredName = featured ? featured.name : "Full Incident Response";
  const featuredDifficulty = featured ? difficultyMeta(featured.difficulty).specsClass : "text-chaos-red";
  const featuredSteps = featured ? String(featured.max_steps || 100) : "100";
  const featuredObjectives = featured ? String(featured.objectives_count || 6) : "6";

  appRoot.innerHTML = `
    <div class="max-w-7xl mx-auto px-6 py-10 pb-20">
      <div class="flex justify-between items-start mb-10">
        <div>
          <h1 class="text-4xl font-bold mb-3 tracking-tight">Chaos<span class="text-chaos-green/80">Hub</span></h1>
          <p class="text-chaos-muted max-w-2xl text-lg">Central nervous system for system resilience. Browse production-hardened tools and scenarios to stress test your architecture.</p>
        </div>
        <div class="flex gap-3 items-center">
          <div class="relative">
            <button id="complexity-filter" class="flex items-center gap-2 bg-chaos-panel border px-4 py-2 rounded text-sm transition-all border-chaos-border hover:border-chaos-muted text-chaos-text">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sliders-horizontal w-4 h-4" aria-hidden="true"><path d="M10 5H3"></path><path d="M12 19H3"></path><path d="M14 3v4"></path><path d="M16 17v4"></path><path d="M21 12h-9"></path><path d="M21 19h-5"></path><path d="M21 5h-7"></path><path d="M8 10v4"></path><path d="M8 12H3"></path></svg>
              <span>All Levels</span>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down w-3.5 h-3.5 text-chaos-muted transition-transform" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>
            </button>
          </div>
        </div>
      </div>

      <div class="flex gap-8 border-b border-chaos-border mb-8">
        <button class="text-chaos-green border-b-2 border-chaos-green pb-3 font-medium">Scenarios</button>
        <button id="integrations-tab" class="text-chaos-muted hover:text-chaos-text pb-3 font-medium transition-colors">Integrations</button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
        ${cards}
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2 bg-chaos-panel/30 border border-chaos-border rounded-lg p-8 relative overflow-hidden flex flex-col justify-center">
          <div class="absolute top-0 right-0 w-64 h-64 bg-chaos-green/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none"></div>
          <div class="bg-chaos-green/10 text-chaos-green text-xs font-bold px-3 py-1 rounded w-max tracking-widest mb-4">FEATURED SCENARIO</div>
          <h2 class="text-3xl font-bold mb-4">${escapeHtml(featuredName)}</h2>
          <p class="text-chaos-muted max-w-xl mb-8 leading-relaxed">The ultimate challenge. A cascading failure involving database crash, disk overfilling, cron breakdown, and a concurrent security incident. Triage, prioritize, and restore all systems to 100% functionality.</p>
          <div class="flex items-center gap-6">
            <a href="/playground?scenario=${encodeURIComponent(featuredKey)}"><button class="bg-chaos-green text-chaos-dark font-bold px-6 py-3 rounded hover:bg-chaos-green/90 transition-colors">Initialize Sandbox</button></a>
          </div>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-settings absolute right-8 bottom-8 w-32 h-32 text-chaos-border/50 -rotate-45" aria-hidden="true"><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"></path><circle cx="12" cy="12" r="3"></circle></svg>
        </div>

        <div class="bg-chaos-panel/30 border border-chaos-border rounded-lg p-8">
          <h3 class="text-lg font-bold mb-6">Technical Specs</h3>
          <div class="space-y-4 font-mono text-sm">
            <div class="flex justify-between border-b border-chaos-border/50 pb-2"><span class="text-chaos-muted">Complexity</span><span class="${featuredDifficulty}">Expert</span></div>
            <div class="flex justify-between border-b border-chaos-border/50 pb-2"><span class="text-chaos-muted">Max Steps</span><span class="text-chaos-cyan">${escapeHtml(featuredSteps)}</span></div>
            <div class="flex justify-between pb-2"><span class="text-chaos-muted">Grading Logic</span><span class="text-chaos-green">${escapeHtml(featuredObjectives)} Objectives</span></div>
          </div>
        </div>
      </div>
    </div>
  `;

  const integrations = document.getElementById("integrations-tab");
  integrations?.addEventListener("click", () => {
    showToast("Integrations view is not available yet.");
  });
}

function builderScenarioOptionButtons(selectedKey) {
  return scenarioEntries().map(([key, meta]) => {
    return `<button data-scenario-key="${escapeHtml(key)}" class="w-full text-left px-3 py-2 text-sm hover:bg-chaos-panel hover:text-chaos-green ${key === selectedKey ? "text-chaos-green" : "text-chaos-text"}">${escapeHtml(meta.name)}</button>`;
  }).join("");
}

async function renderBuilder() {
  const queryScenario = getQueryScenario();
  if (!state.builderScenario) {
    if (state.scenarios[queryScenario]) {
      state.builderScenario = queryScenario;
    } else if (state.scenarios.cascading_db_failure) {
      state.builderScenario = "cascading_db_failure";
    } else {
      state.builderScenario = state.order[0];
    }
  }

  const key = state.builderScenario;
  const detail = await fetchJSON(API.scenario(key));
  const live = metrics(detail);

  const faultsMarkup = detail.faults.map((fault) => {
    return `<div class="flex items-center gap-3 p-3 bg-chaos-panel border border-chaos-border rounded border-l-2 border-l-chaos-red/70 transition-colors group"><div class="text-chaos-red">${iconMarkup("process_recovery", "w-4 h-4")}</div><div class="min-w-0"><div class="text-sm font-bold truncate group-hover:text-chaos-red transition-colors">${escapeHtml(fault.name)}</div><div class="text-[10px] text-chaos-muted uppercase truncate">${escapeHtml(fault.apply_fn.replaceAll("_", " "))}</div></div></div>`;
  }).join("");

  const cascadeMarkup = detail.cascades.map((cascade) => {
    const effectLabel = cascade.effect?.name || cascade.effect?.apply_fn || "";
    return `<div class="flex items-center gap-3 p-3 bg-chaos-panel border border-chaos-border rounded border-l-2 border-l-chaos-cyan/70 transition-colors group"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-network w-4 h-4 text-chaos-cyan" aria-hidden="true"><rect x="16" y="16" width="6" height="6" rx="1"></rect><rect x="2" y="16" width="6" height="6" rx="1"></rect><rect x="9" y="2" width="6" height="6" rx="1"></rect><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"></path><path d="M12 12V8"></path></svg><div class="min-w-0"><div class="text-sm font-bold truncate group-hover:text-chaos-cyan transition-colors">${escapeHtml(cascade.condition_fn.replaceAll("_", " "))}</div><div class="text-[10px] text-chaos-muted uppercase truncate">→ ${escapeHtml(effectLabel)}</div></div></div>`;
  }).join("");

  const objectiveMarkup = detail.objectives.map((objective) => {
    return `<div class="flex items-center gap-3 p-2.5 bg-chaos-panel border border-chaos-border rounded border-l-2 border-l-chaos-green/70 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-target w-3.5 h-3.5 text-chaos-green shrink-0" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg><div class="text-[11px] text-chaos-muted truncate">${escapeHtml(objective.description)}</div><span class="text-[10px] font-mono text-chaos-green shrink-0">${Math.round((objective.points || 0) * 100)}%</span></div>`;
  }).join("");

  const formatNodeValue = (paramKey, paramValue) => {
    if (paramKey === "count") {
      const numeric = Number(paramValue);
      if (Number.isFinite(numeric) && numeric >= 1000) {
        return `${(numeric / 1000).toFixed(1)}K`;
      }
    }
    return String(paramValue);
  };

  const actionDescription = (actionName) => {
    if (actionName === "fill_disk") return "Log flood fills /var/log partition";
    if (actionName === "crash_service" || actionName === "app_degraded") return "App can't write logs, starts failing";
    return actionName.replaceAll("_", " ");
  };

  const faultNodes = detail.faults.map((fault, index) => {
    const id = `${fault.apply_fn.slice(0, 3).toUpperCase()}-${String(index).padStart(2, "0")}`;
    const paramRows = Object.entries(fault.params || {}).map(([paramKey, paramValue]) => {
      return `<div class="flex justify-between text-xs gap-2"><span class="text-chaos-muted">${escapeHtml(paramKey)}</span><span class="text-chaos-green font-mono truncate max-w-[130px]">${escapeHtml(formatNodeValue(paramKey, paramValue))}</span></div>`;
    }).join("");

    return `<div class="w-[240px] bg-chaos-panel border border-chaos-red/50 rounded-lg p-4 shadow-[0_0_15px_rgba(255,51,51,0.1)] hover:border-chaos-red/80 transition-all hover:shadow-[0_0_25px_rgba(255,51,51,0.2)] group relative"><div class="flex justify-between items-center mb-3"><div class="flex flex-col min-w-0"><span class="text-sm font-bold text-chaos-text truncate">${escapeHtml(fault.name.toUpperCase())}</span><span class="text-[10px] font-mono text-chaos-red">ID: ${escapeHtml(id)}</span></div><div class="text-chaos-red">${iconMarkup("process_recovery", "w-4 h-4")}</div></div><div class="text-[11px] text-chaos-muted mb-3 line-clamp-2">${escapeHtml(fault.description || fault.name)}</div><div class="space-y-1.5">${paramRows || `<div class="flex justify-between text-xs"><span class="text-chaos-muted">type</span><span class="text-chaos-green font-mono">-</span></div>`}</div><div class="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-chaos-red border-[3px] border-chaos-panel z-20"></div></div>`;
  }).join("");

  const cascadeNodes = detail.cascades.map((cascade, index) => {
    const cond = cascade.condition_fn.replaceAll("_", " ");
    const actionKey = String(cascade.effect.apply_fn || "");
    const actionText = cascade.effect.description || actionDescription(actionKey);
    const firstParam = Object.entries(cascade.condition_params || {}).map(([k, v]) => `${k}: ${v}`).join(", ");
    const actionMeta = Object.entries(cascade.effect.params || {}).map(([k, v]) => `<div class="flex justify-between gap-2 text-[10px] font-mono"><span class="text-chaos-muted">${escapeHtml(`${k}:`)}</span><span class="text-chaos-text">${escapeHtml(formatNodeValue(k, v))}</span></div>`).join("");
    return `<div class="relative"><div class="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-chaos-cyan border-[3px] border-chaos-panel z-20"></div><div class="w-[260px] bg-chaos-panel border border-chaos-cyan/50 rounded-lg p-4 shadow-[0_0_15px_rgba(0,255,255,0.08)]"><div class="flex items-center justify-between mb-2"><span class="text-[10px] font-bold text-chaos-muted uppercase tracking-wider flex items-center gap-1.5"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-network w-3.5 h-3.5" aria-hidden="true"><rect x="16" y="16" width="6" height="6" rx="1"></rect><rect x="2" y="16" width="6" height="6" rx="1"></rect><rect x="9" y="2" width="6" height="6" rx="1"></rect><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"></path><path d="M12 12V8"></path></svg>TRIGGER CONDITION</span><span class="text-[10px] font-bold text-chaos-cyan">#${index + 1}</span></div><div class="text-xs text-chaos-text mb-2">IF ${escapeHtml(cond)}</div><div class="text-[10px] text-chaos-muted mb-3">(${escapeHtml(firstParam)})</div><div class="text-[10px] font-bold text-chaos-green mb-1">ACTION: ${escapeHtml(actionKey.toUpperCase())}</div><div class="text-[10px] text-chaos-muted mb-2">${escapeHtml(actionText)}</div><div class="space-y-1">${actionMeta}</div></div></div>`;
  }).join("");

  const objectiveNodes = detail.objectives.map((objective, index) => {
    return `<div class="relative"><div class="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-chaos-green border-[3px] border-chaos-panel z-20"></div><div class="w-[220px] bg-chaos-panel border border-chaos-border rounded-lg p-4 hover:border-chaos-green/50 transition-all bg-chaos-green/[0.02] hover:bg-chaos-green/5"><div class="flex items-center gap-2 mb-3"><span class="w-2 h-2 rounded-full bg-chaos-green animate-pulse"></span><span class="text-[10px] font-bold text-chaos-muted font-mono uppercase tracking-wider">OBJ-${String(index + 1).padStart(2, "0")}</span><span class="ml-auto text-sm font-bold text-chaos-green font-mono">${Math.round((objective.points || 0) * 100)}%</span></div><div class="text-xs text-chaos-text mb-3 leading-relaxed">${escapeHtml(objective.description)}</div><div class="flex items-center justify-between"><span class="text-[10px] text-chaos-muted font-mono bg-chaos-darker px-2 py-1 rounded border border-chaos-border">${escapeHtml(objective.check_fn.replaceAll("_", " "))}</span><div class="w-5 h-5 rounded-full bg-chaos-green/20 flex items-center justify-center border border-chaos-green/50"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle-check w-3 h-3 text-chaos-green" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="m9 12 2 2 4-4"></path></svg></div></div></div></div>`;
  }).join("");

  const scenarioButtonLabel = state.scenarios[key]?.name || detail.name;
  const diff = difficultyMeta(detail.difficulty);

  appRoot.innerHTML = `
    <div class="flex w-full h-[calc(100vh-64px)] bg-chaos-dark overflow-hidden">
      <div class="w-[280px] bg-chaos-panel/30 border-r border-chaos-border flex flex-col shrink-0">
        <div class="p-4 border-b border-chaos-border">
          <div class="text-[10px] font-bold text-chaos-muted uppercase tracking-widest mb-3">Select Scenario</div>
          <div class="relative">
            <button id="builder-scenario-trigger" class="w-full flex items-center justify-between bg-chaos-panel border border-chaos-border rounded px-3 py-2.5 text-sm font-bold hover:border-chaos-green/50 transition-colors text-left"><span class="truncate">${escapeHtml(scenarioButtonLabel)}</span><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down w-4 h-4 text-chaos-muted shrink-0 transition-transform" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg></button>
            <div id="builder-scenario-menu" class="hidden absolute left-0 right-0 top-[calc(100%+6px)] bg-chaos-darker border border-chaos-border rounded max-h-72 overflow-y-auto z-50">
              ${builderScenarioOptionButtons(key)}
            </div>
          </div>
        </div>

        <div class="p-4 border-b border-chaos-border flex-1 overflow-y-auto">
          <div class="text-[10px] font-bold text-chaos-muted uppercase tracking-widest mb-3">Injected Faults <span class="text-chaos-text">${detail.faults.length}</span></div>
          <div class="space-y-2">${faultsMarkup}</div>
        </div>

        <div class="p-4 border-b border-chaos-border">
          <div class="text-[10px] font-bold text-chaos-muted uppercase tracking-widest mb-3">Cascade Rules <span class="text-chaos-text">${detail.cascades.length}</span></div>
          <div class="space-y-2">${cascadeMarkup}</div>
        </div>

        <div class="p-4">
          <div class="text-[10px] font-bold text-chaos-muted uppercase tracking-widest mb-3">Objectives <span class="text-chaos-text">${detail.objectives.length}</span></div>
          <div class="space-y-2">${objectiveMarkup}</div>
        </div>
      </div>

      <div class="flex-1 relative overflow-auto">
        <div class="absolute inset-0" style="background-image:radial-gradient(circle, rgba(57,255,20,0.03) 1px, transparent 1px);background-size:24px 24px"></div>
        <div class="absolute inset-0 bg-gradient-to-br from-chaos-dark via-chaos-dark to-chaos-darker/50"></div>

        <div class="absolute top-0 left-0 right-0 p-4 flex justify-around text-[10px] font-bold text-chaos-muted uppercase tracking-widest z-10 pointer-events-none">
          <div class="flex flex-col items-center"><span>Fault Nodes</span><span class="mt-1 text-chaos-text">${detail.faults.length} Active</span></div>
          <div class="flex flex-col items-center"><span>Cascade Logic</span><span class="mt-1 text-chaos-text">${detail.cascades.length} Triggers</span></div>
          <div class="flex flex-col items-center"><span>Validation Targets</span><span class="mt-1 text-chaos-text">${detail.objectives.length} Criteria</span></div>
        </div>

        <div class="relative z-10 p-12 min-w-[800px] min-h-[500px] flex items-start justify-around pt-20 gap-8">
          <div class="flex flex-col gap-6 relative min-w-[240px]">${faultNodes}</div>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-move-right w-7 h-7 text-chaos-cyan/40 mt-20 shrink-0" aria-hidden="true"><path d="M18 8L22 12L18 16"></path><path d="M2 12H22"></path></svg>
          <div class="flex flex-col gap-8 relative min-w-[260px]">${cascadeNodes}</div>
          <div class="flex flex-col gap-8 relative min-w-[220px]">${objectiveNodes}</div>
        </div>
      </div>

      <div class="w-[320px] bg-chaos-panel/30 border-l border-chaos-border shrink-0 flex flex-col">
        <div class="p-6 border-b border-chaos-border">
          <div class="text-[10px] font-bold text-chaos-muted uppercase tracking-widest mb-1">Active Scenario</div>
          <h2 class="text-lg font-bold mb-3">${escapeHtml(detail.name)}</h2>
          <div class="flex items-center gap-3">
            <span class="text-[10px] font-bold px-2 py-1 rounded border ${diff.textClass} ${diff.bgClass} ${diff.borderClass}">${diff.label}</span>
            <span class="text-[10px] font-bold text-chaos-muted">MAX: ${detail.max_steps} STEPS</span>
          </div>
        </div>

        <div class="p-6 flex-1 overflow-y-auto">
          <div class="mb-6"><p class="text-xs text-chaos-muted leading-relaxed">${escapeHtml(detail.description)}</p></div>

          <div class="mb-8">
            <h3 class="text-xs font-bold text-chaos-muted uppercase tracking-widest mb-4 flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-activity w-4 h-4" aria-hidden="true"><path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"></path></svg> Live Projections</h3>
            <div class="space-y-3 font-mono text-sm">
              <div class="flex justify-between"><span>Fault Nodes</span><span class="text-chaos-red">${live.faults}</span></div>
              <div class="flex justify-between"><span>Cascade Depth</span><span class="text-chaos-cyan">${live.cascades}</span></div>
              <div class="flex justify-between"><span>Objectives</span><span class="text-chaos-green">${live.objectives}</span></div>
              <div class="flex justify-between"><span>Blast Radius</span><span class="text-chaos-red">${live.blastRadius.toFixed(1)}%</span></div>
              <div class="flex justify-between"><span>Complexity</span><span class="text-chaos-cyan">${live.complexity.toFixed(3)}</span></div>
            </div>
          </div>

          <div class="mb-8">
            <h3 class="text-xs font-bold text-chaos-muted uppercase tracking-widest mb-3">Hints</h3>
            <ul class="space-y-2">
              ${detail.hints.map((hint) => `<li class="text-[11px] text-chaos-muted flex gap-2"><span class="text-chaos-cyan shrink-0">›</span>${escapeHtml(hint)}</li>`).join("")}
            </ul>
          </div>

          <div>
            <h3 class="text-xs font-bold text-chaos-muted uppercase tracking-widest mb-4 flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-database w-4 h-4" aria-hidden="true"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M3 5V19A9 3 0 0 0 21 19V5"></path><path d="M3 12A9 3 0 0 0 21 12"></path></svg> Config Manifest</h3>
            <pre class="text-[10px] font-mono text-chaos-green bg-chaos-darker p-4 rounded border border-chaos-border overflow-x-auto max-h-[240px] overflow-y-auto">${escapeHtml(buildManifest(detail))}</pre>
          </div>
        </div>

        <div class="p-4 border-t border-chaos-border bg-chaos-panel space-y-3">
          <button id="builder-btn-execute" class="w-full flex items-center justify-center gap-2 bg-chaos-green text-chaos-dark font-bold px-4 py-3 rounded hover:bg-chaos-green/90 transition-colors uppercase tracking-widest text-sm shadow-[0_0_15px_rgba(57,255,20,0.2)]"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-play w-4 h-4" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3"></polygon></svg>Execute Experiment</button>
          <div class="flex gap-2">
            <button id="builder-btn-llm" class="flex-1 flex items-center justify-center gap-2 bg-chaos-darker border border-chaos-cyan text-chaos-cyan font-bold px-2 py-2 rounded hover:bg-chaos-cyan/10 transition-colors uppercase text-[10px] tracking-widest"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sparkles w-3.5 h-3.5" aria-hidden="true"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.25.25 0 0 1 0-.962L8.5 9.937A2 2 0 0 0 9.937 8.5l1.582-6.135a.25.25 0 0 1 .962 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.582a.25.25 0 0 1 0 .962L15.5 14.063A2 2 0 0 0 14.063 15.5l-1.582 6.135a.25.25 0 0 1-.962 0z"></path><path d="M20 3v4"></path><path d="M22 5h-4"></path><path d="M4 17v2"></path><path d="M5 18H3"></path></svg>Test LLM</button>
            <button id="builder-btn-rl" class="flex-1 flex items-center justify-center gap-2 bg-chaos-darker border border-chaos-cyan text-chaos-cyan font-bold px-2 py-2 rounded hover:bg-chaos-cyan/10 transition-colors uppercase text-[10px] tracking-widest"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bot w-3.5 h-3.5" aria-hidden="true"><path d="M12 8V4H8"></path><rect width="16" height="12" x="4" y="8" rx="2"></rect><path d="M2 14h2"></path><path d="M20 14h2"></path><path d="M15 13v2"></path><path d="M9 13v2"></path></svg>Test RL</button>
          </div>
          <button id="builder-btn-export" class="w-full flex items-center justify-center gap-2 bg-transparent border border-chaos-border text-chaos-text font-bold px-4 py-3 rounded hover:bg-chaos-darker transition-colors text-xs uppercase tracking-widest"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-download w-4 h-4" aria-hidden="true"><path d="M12 15V3"></path><path d="M17 10l-5 5-5-5"></path><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path></svg>Export YAML Bundle</button>
        </div>
      </div>
    </div>
  `;

  const trigger = document.getElementById("builder-scenario-trigger");
  const menu = document.getElementById("builder-scenario-menu");
  trigger?.addEventListener("click", () => {
    menu?.classList.toggle("hidden");
  });

  menu?.querySelectorAll("button[data-scenario-key]").forEach((button) => {
    button.addEventListener("click", async () => {
      const selected = button.getAttribute("data-scenario-key");
      if (!selected) return;
      state.builderScenario = selected;
      await renderBuilder();
    });
  });

  [["builder-btn-execute", "Experiment queued."], ["builder-btn-llm", "LLM test started."], ["builder-btn-rl", "RL test started."], ["builder-btn-export", "YAML bundle exported."]].forEach(([id, msg]) => {
    document.getElementById(id)?.addEventListener("click", () => showToast(msg));
  });
}

function getRingDash(score) {
  const pct = Math.max(0, Math.min(99, Math.round(score * 100)));
  return `${pct}, 100`;
}

function appendTerminalOutput(line) {
  const stream = document.getElementById("terminal-stream");
  const output = document.getElementById("terminal-output-area");
  if (!stream || !output) return;
  const row = document.createElement("div");
  row.className = "mb-2 whitespace-pre-wrap flex flex-col";
  row.innerHTML = `<div class="text-chaos-text/90">${escapeHtml(line)}</div>`;
  stream.appendChild(row);
  output.scrollTop = output.scrollHeight;
}

function appendTerminalSystem(line) {
  const stream = document.getElementById("terminal-stream");
  const output = document.getElementById("terminal-output-area");
  if (!stream || !output) return;
  const row = document.createElement("div");
  row.className = "mb-2 whitespace-pre-wrap flex flex-col";
  row.innerHTML = `<div class="text-chaos-cyan opacity-80 mt-1 italic">${escapeHtml(line)}</div>`;
  stream.appendChild(row);
  output.scrollTop = output.scrollHeight;
}

function renderPlaygroundFrame() {
  const envLabel = "ENV_0";
  const scorePct = Math.max(0, Math.min(99, Math.round(state.playground.score * 100)));

  appRoot.innerHTML = `
    <div class="flex h-full w-full bg-chaos-dark overflow-hidden p-6 gap-6">
      <div class="w-[300px] flex flex-col gap-8 shrink-0">
        <div>
          <div class="flex justify-between items-start mb-2">
            <h2 id="playground-task-name" class="text-2xl font-bold leading-tight">${escapeHtml(state.playground.taskName || "Log Analysis")}</h2>
            <div class="bg-chaos-cyan/10 border border-chaos-cyan/30 text-chaos-cyan text-[10px] font-mono px-2 py-1 rounded">ID:<br>${escapeHtml(envLabel)}</div>
          </div>
          <p id="playground-task-desc" class="text-chaos-muted text-sm leading-relaxed mt-4">${escapeHtml(state.playground.description || "")}</p>
        </div>

        <div class="flex items-center gap-6 p-4 bg-chaos-panel/30 border border-chaos-border rounded-lg">
          <div class="relative w-16 h-16 flex items-center justify-center">
            <svg class="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
              <path class="text-chaos-border" stroke-width="3" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"></path>
              <path id="playground-progress-arc" class="text-chaos-green transition-all duration-1000" stroke-width="3" stroke-dasharray="${getRingDash(state.playground.score)}" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"></path>
            </svg>
            <span id="playground-progress-text" class="absolute text-sm font-bold">${scorePct}%</span>
          </div>
          <div>
            <div class="text-[10px] font-bold text-chaos-muted tracking-widest mb-1 uppercase">Completion Level</div>
            <div class="text-2xl font-bold text-chaos-green"><span id="playground-score-points">${scorePct}</span> <span class="text-xs text-chaos-green/50">PTS</span></div>
          </div>
        </div>

        <div class="flex-1">
          <div class="flex justify-between text-xs font-bold text-chaos-muted uppercase tracking-widest mb-6"><span>Step Progress</span><span id="playground-step-progress">${state.playground.step} / ${state.playground.maxSteps}</span></div>
          <div class="text-xs font-bold text-chaos-muted uppercase tracking-widest mb-4">Objectives Meta</div>
          <div class="space-y-6">
            <p class="text-xs text-chaos-muted italic">Complete actions in the terminal and verify fixes to achieve 100% completion in this sandbox.</p>
          </div>
        </div>
      </div>

      <div class="flex-1 bg-chaos-panel/40 border border-chaos-border rounded-xl flex flex-col overflow-hidden relative shadow-2xl">
        <div class="bg-chaos-panel border-b border-chaos-border px-4 py-3 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="flex gap-1.5"><div class="w-3 h-3 rounded-full bg-chaos-red/80"></div><div class="w-3 h-3 rounded-full bg-chaos-muted/50"></div><div class="w-3 h-3 rounded-full bg-chaos-green/80"></div></div>
            <div class="ml-4 flex text-xs font-mono text-chaos-muted space-x-1 border-r border-chaos-border/50 pr-4"><span id="playground-shell-label" class="text-chaos-text px-2 py-1 bg-chaos-darker rounded border border-chaos-border/50">root@chaoslab-env_0 ~ (ssh)</span></div>
            <div class="flex items-center text-xs font-mono pl-1"><div class="flex items-center gap-2"><span class="text-chaos-muted uppercase ml-2 tracking-widest">Auto-Solve:</span><button disabled class="text-chaos-muted tracking-widest border border-chaos-border px-2 py-1 rounded transition-colors opacity-50 cursor-not-allowed">LLM</button><button id="playground-auto-rl" class="text-chaos-muted tracking-widest hover:text-chaos-green border border-chaos-border hover:border-chaos-green px-2 py-1 rounded transition-colors flex items-center gap-1">RL<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right w-3 h-3" aria-hidden="true"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg></button></div></div>
          </div>
        </div>

        <div id="terminal-output-area" class="p-6 font-mono text-sm overflow-y-auto flex-1 flex flex-col">
          <div id="terminal-stream" class="flex-1">
            <div class="text-chaos-muted mb-4 opacity-70">ChaosLab Live Terminal [Version 2.0.42-STABLE]<br>(c) 2026 ChaosLab System. All rights reserved.</div>
          </div>
          <div id="terminal-input-row" class="flex items-center gap-2 mt-1"><span id="playground-prompt" class="text-chaos-green font-bold shrink-0">root@chaoslab:~$</span><input id="cli-input" disabled class="bg-transparent border-none outline-none flex-1 font-mono text-chaos-text focus:ring-0 disabled:opacity-50" autocomplete="off" type="text" value="" /></div>
        </div>

        <div class="bg-chaos-panel/80 px-4 py-2 border-t border-chaos-border flex justify-between text-[10px] font-mono uppercase tracking-widest text-chaos-muted"><div class="flex gap-6"><span class="flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full bg-chaos-red"></span>OFFLINE</span></div><div class="flex gap-6"><span>ENCRYPTION: AES-256-GCM</span></div></div>
      </div>

      <div class="w-[280px] shrink-0 flex flex-col gap-6 h-full overflow-hidden">
        <div class="bg-chaos-panel/30 border border-chaos-border p-4 rounded-xl flex flex-col overflow-hidden flex-1">
          <div class="flex justify-between items-center mb-4 shrink-0"><h3 class="text-xs font-bold uppercase tracking-widest text-chaos-muted flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sparkles w-3.5 h-3.5" aria-hidden="true"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.25.25 0 0 1 0-.962L8.5 9.937A2 2 0 0 0 9.937 8.5l1.582-6.135a.25.25 0 0 1 .962 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.582a.25.25 0 0 1 0 .962L15.5 14.063A2 2 0 0 0 14.063 15.5l-1.582 6.135a.25.25 0 0 1-.962 0z"></path><path d="M20 3v4"></path><path d="M22 5h-4"></path><path d="M4 17v2"></path><path d="M5 18H3"></path></svg>AI Assistant</h3><span class="text-[8px] text-chaos-muted bg-chaos-muted/20 px-1.5 py-0.5 rounded">OFFLINE</span></div>
          <div class="flex-1 overflow-y-auto mb-3 space-y-3 pr-2"><div class="text-[11px] text-chaos-muted/60 italic">Ask the LLM for help with the current task. Get suggestions for the next command to run.</div><div></div></div>
          <div class="flex gap-2 shrink-0"><input placeholder="LLM offline" disabled class="flex-1 bg-chaos-darker/50 border border-chaos-border/50 rounded px-2 py-1.5 text-[11px] text-chaos-text placeholder-chaos-muted/50 focus:outline-none focus:border-chaos-cyan/50 disabled:opacity-50" type="text" value="" /><button disabled class="bg-chaos-cyan/10 border border-chaos-cyan/30 text-chaos-cyan p-1.5 rounded hover:bg-chaos-cyan/20 disabled:opacity-30 transition-colors flex items-center gap-1.5" title="Send to LLM">Send to LLM<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-send-horizontal w-3 h-3" aria-hidden="true"><path d="m3 3 3 9-3 9 19-9Z"></path><path d="M6 12h16"></path></svg></button></div>
        </div>
      </div>
    </div>
  `;
}

async function destroyPlaygroundEnv() {
  if (!state.playground.envId) return;
  try {
    await fetchJSON(API.destroy(state.playground.envId), { method: "DELETE" });
  } catch {
    // Ignore cleanup errors.
  }
}

function updatePlaygroundWidgets() {
  const scorePct = Math.max(0, Math.min(99, Math.round(state.playground.score * 100)));
  const envLabel = "ENV_0";

  const progressArc = document.getElementById("playground-progress-arc");
  if (progressArc) progressArc.setAttribute("stroke-dasharray", getRingDash(state.playground.score));

  const progressText = document.getElementById("playground-progress-text");
  if (progressText) progressText.textContent = `${scorePct}%`;

  const score = document.getElementById("playground-score-points");
  if (score) score.textContent = String(scorePct);

  const step = document.getElementById("playground-step-progress");
  if (step) step.textContent = `${state.playground.step} / ${state.playground.maxSteps}`;

  const name = document.getElementById("playground-task-name");
  if (name) name.textContent = state.playground.taskName;

  const description = document.getElementById("playground-task-desc");
  if (description) description.textContent = state.playground.description;

  const shell = document.getElementById("playground-shell-label");
  if (shell) shell.textContent = `root@chaoslab-${envLabel.toLowerCase()} ~ (ssh)`;

  const prompt = document.getElementById("playground-prompt");
  if (prompt) prompt.textContent = `root@chaoslab:${state.playground.cwd}$`;
}

async function initializePlayground(scenarioKey) {
  await destroyPlaygroundEnv();

  const payload = await fetchJSON(API.reset, {
    method: "POST",
    body: JSON.stringify({ scenario: scenarioKey }),
  });

  state.playground.envId = payload.env_id;
  state.playground.scenarioKey = scenarioKey;
  state.playground.score = 0;
  state.playground.step = 0;
  state.playground.maxSteps = Number(payload.info?.max_steps || 50);
  state.playground.done = false;
  state.playground.cwd = "~";
  state.playground.taskName = payload.info?.task_name || (state.scenarios[scenarioKey]?.name || "Scenario");
  state.playground.description = state.scenarios[scenarioKey]?.description || "";

  appendTerminalSystem(":: Successfully initialized sandbox [env_0]");
  appendTerminalSystem(`:: Task: ${state.playground.taskName}`);

  updatePlaygroundWidgets();
}

async function runPlaygroundCommand(command) {
  if (!command || !state.playground.envId || state.playground.done) return;

  appendTerminalOutput(`root@chaoslab:${state.playground.cwd}$ ${command}`);

  const payload = await fetchJSON(API.step(state.playground.envId), {
    method: "POST",
    body: JSON.stringify({ action: command }),
  });

  const output = payload.info?.command_output || "";
  if (output.trim()) {
    output.split(/\r?\n/).forEach((line) => {
      if (line.trim()) appendTerminalOutput(line);
    });
  }

  state.playground.score = Number(payload.info?.task_score || 0);
  state.playground.step = Number(payload.info?.step || state.playground.step + 1);
  state.playground.maxSteps = Number(payload.info?.max_steps || state.playground.maxSteps);
  state.playground.cwd = payload.observation?.current_directory || state.playground.cwd;
  state.playground.done = Boolean(payload.done);

  if (state.playground.done) {
    appendTerminalSystem(":: Sandbox run ended.");
  }

  updatePlaygroundWidgets();
}

async function renderPlayground() {
  renderPlaygroundFrame();

  const queryScenario = getQueryScenario();
  const key = state.scenarios[queryScenario] ? queryScenario : state.order[0];

  await initializePlayground(key);

  const input = document.getElementById("cli-input");
  input?.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const command = input.value.trim();
    if (!command) return;
    input.value = "";
    try {
      await runPlaygroundCommand(command);
    } catch (error) {
      appendTerminalOutput(`error: ${error.message}`);
    }
  });

  document.getElementById("playground-auto-rl")?.addEventListener("click", async () => {
    const commands = AUTO_PLAYBOOK.rl[state.playground.scenarioKey] || AUTO_PLAYBOOK.llm[state.playground.scenarioKey] || [];
    for (const command of commands) {
      if (state.playground.done) break;
      try {
        await runPlaygroundCommand(command);
      } catch {
        break;
      }
    }
  });
}

function resolveArenaCommands(mode, scriptText, scenarioKey) {
  const normalized = (mode || "script").toLowerCase();
  if (normalized === "script") {
    const commands = splitLines(scriptText);
    if (commands.length) return commands;
  }
  if (AUTO_PLAYBOOK[normalized]?.[scenarioKey]?.length) {
    return AUTO_PLAYBOOK[normalized][scenarioKey];
  }
  if (AUTO_PLAYBOOK.llm[scenarioKey]?.length) {
    return AUTO_PLAYBOOK.llm[scenarioKey];
  }
  return ["ps", "df -h", "free -m"];
}

async function runArenaAgent(label, mode, scriptText, scenarioKey) {
  const commands = resolveArenaCommands(mode, scriptText, scenarioKey);
  const resetPayload = await fetchJSON(API.reset, {
    method: "POST",
    body: JSON.stringify({ scenario: scenarioKey }),
  });

  const envId = resetPayload.env_id;
  let score = 0;
  let step = 0;
  let done = false;

  try {
    for (const command of commands) {
      const payload = await fetchJSON(API.step(envId), {
        method: "POST",
        body: JSON.stringify({ action: command }),
      });
      score = Number(payload.info?.task_score || score);
      step = Number(payload.info?.step || step + 1);
      done = Boolean(payload.done);
      if (done) break;
    }
  } finally {
    try {
      await fetchJSON(API.destroy(envId), { method: "DELETE" });
    } catch {
      // Ignore cleanup error.
    }
  }

  return { label, mode, score, step, done };
}

function renderArenaResult(resultA, resultB) {
  const winner = resultA.score > resultB.score
    ? resultA.label
    : resultB.score > resultA.score
      ? resultB.label
      : resultA.step < resultB.step
        ? resultA.label
        : resultB.step < resultA.step
          ? resultB.label
          : "DRAW";

  return `
    <div class="max-w-7xl mx-auto px-6 pb-20">
      <div class="bg-chaos-panel/50 border border-chaos-border rounded-lg p-5">
        <h3 class="text-lg font-bold mb-4">${winner === "DRAW" ? "Result: Draw" : `Winner: ${winner}`}</h3>
        <table class="w-full text-sm">
          <thead>
            <tr class="text-chaos-muted border-b border-chaos-border">
              <th class="text-left py-2">Agent</th>
              <th class="text-left py-2">Mode</th>
              <th class="text-left py-2">Score</th>
              <th class="text-left py-2">Steps</th>
              <th class="text-left py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr class="border-b border-chaos-border/60">
              <td class="py-2">${escapeHtml(resultA.label)}</td>
              <td class="py-2">${escapeHtml(resultA.mode)}</td>
              <td class="py-2">${Math.round(resultA.score * 100)}%</td>
              <td class="py-2">${resultA.step}</td>
              <td class="py-2">${resultA.done ? "DONE" : "INCOMPLETE"}</td>
            </tr>
            <tr>
              <td class="py-2">${escapeHtml(resultB.label)}</td>
              <td class="py-2">${escapeHtml(resultB.mode)}</td>
              <td class="py-2">${Math.round(resultB.score * 100)}%</td>
              <td class="py-2">${resultB.step}</td>
              <td class="py-2">${resultB.done ? "DONE" : "INCOMPLETE"}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderArena() {
  const options = scenarioEntries().map(([key, meta]) => {
    return `<option value="${escapeHtml(key)}" class="bg-chaos-dark">${escapeHtml(meta.name)}</option>`;
  }).join("");

  appRoot.innerHTML = `
    <div class="max-w-7xl mx-auto px-6 py-10 pb-20">
      <div class="mb-10">
        <div class="text-xs font-mono text-chaos-green mb-4">root@chaoslab-terminal / ARENA / AGENT_DUEL_V3.4</div>
        <h1 class="text-5xl font-extrabold mb-4 italic tracking-tighter" style="font-family:var(--font-serif)">Battle Scenario</h1>
        <p class="text-chaos-muted max-w-2xl text-base">Compare user or autonomous scripts against high-stakes environments. Define identical testing parameters and observe how different instruction sets handle cascading service disruptions.</p>
      </div>

      <div class="bg-chaos-panel/50 border border-chaos-border rounded-lg p-5 flex justify-between items-center mb-10">
        <div>
          <div class="text-[10px] font-bold text-chaos-muted uppercase tracking-widest mb-1">Active Environment Overlay</div>
          <select id="arena-scenario" class="bg-transparent border-none outline-none text-lg font-mono text-chaos-text cursor-pointer appearance-none uppercase">
            ${options}
          </select>
        </div>
        <div class="flex items-center gap-2 text-chaos-green font-mono text-sm"><span class="w-2 h-2 rounded-full bg-chaos-green animate-pulse"></span> READY</div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
        <div class="bg-chaos-panel/30 border border-chaos-border rounded-xl p-6 relative overflow-hidden group hover:border-chaos-green/30 transition-colors flex flex-col">
          <div class="absolute top-0 right-0 text-[120px] font-bold text-chaos-darker leading-none select-none pointer-events-none group-hover:text-chaos-green/5 transition-colors">A</div>
          <div class="flex items-center gap-3 mb-6 relative z-10"><span class="w-3 h-3 rounded-full bg-chaos-green animate-pulse"></span><h2 class="text-xl font-bold font-mono tracking-wider text-chaos-green">AGENT_ALPHA</h2></div>
          <div class="mb-4 relative z-10"><label class="text-[10px] font-bold text-chaos-muted uppercase tracking-widest mb-2 block">Behavior Matrix</label><select id="arena-mode-a" class="w-full bg-chaos-darker border border-chaos-border rounded p-2 text-sm font-mono text-chaos-text outline-none focus:border-chaos-green"><option value="script" selected>Hardcoded Script</option><option value="llm">LLM Autonomous</option><option value="rl">RL Autonomous</option></select></div>
          <textarea id="arena-script-a" class="w-full bg-chaos-dark rounded flex-1 p-4 border border-chaos-border min-h-[160px] mb-4 font-mono text-sm text-chaos-text relative z-10 box-border focus:border-chaos-green focus:outline-none" placeholder="Enter shell commands, one per line...">cat /var/log/app.log\ngrep 500 /var/log/app.log</textarea>
        </div>

        <div class="bg-chaos-panel/30 border border-chaos-border rounded-xl p-6 relative overflow-hidden group hover:border-chaos-red/30 transition-colors flex flex-col">
          <div class="absolute top-0 right-0 text-[120px] font-bold text-chaos-darker leading-none select-none pointer-events-none group-hover:text-chaos-red/5 transition-colors">B</div>
          <div class="flex items-center gap-3 mb-6 relative z-10"><span class="w-3 h-3 rounded-full bg-chaos-red"></span><h2 class="text-xl font-bold font-mono tracking-wider text-chaos-red">AGENT_BETA</h2></div>
          <div class="mb-4 relative z-10"><label class="text-[10px] font-bold text-chaos-muted uppercase tracking-widest mb-2 block">Behavior Matrix</label><select id="arena-mode-b" class="w-full bg-chaos-darker border border-chaos-border rounded p-2 text-sm font-mono text-chaos-text outline-none focus:border-chaos-red"><option value="script">Hardcoded Script</option><option value="llm">LLM Autonomous</option><option value="rl" selected>RL Autonomous</option></select></div>
          <div class="flex-1 min-h-[160px] border border-chaos-border bg-chaos-darker rounded mb-4 relative z-10 flex flex-col items-center justify-center text-center p-6 bg-texture-stripes">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bot w-4 h-4 text-chaos-red mb-2" aria-hidden="true"><path d="M12 8V4H8"></path><rect width="16" height="12" x="4" y="8" rx="2"></rect><path d="M2 14h2"></path><path d="M20 14h2"></path><path d="M15 13v2"></path><path d="M9 13v2"></path></svg>
            <h3 class="font-mono text-chaos-red font-bold mb-2">RL AUTONOMOUS MODE</h3>
            <p class="text-xs text-chaos-muted tracking-wider leading-relaxed mb-4">Model: Heuristic Expert</p>
            <select class="bg-chaos-dark border border-chaos-border rounded px-3 py-1.5 text-xs font-mono text-chaos-text outline-none focus:border-chaos-red"><option value="ppo" class="bg-chaos-dark">PPO Neural Net —</option><option value="qlearning" class="bg-chaos-dark">Tabular Q-Learning —</option><option value="heuristic" class="bg-chaos-dark" selected>Heuristic Expert ✓</option></select>
          </div>
          <textarea id="arena-script-b" class="w-full bg-chaos-dark rounded p-4 border border-chaos-border min-h-[90px] font-mono text-sm text-chaos-text box-border focus:border-chaos-red focus:outline-none" placeholder="Enter shell commands, one per line..."></textarea>
        </div>
      </div>

      <div class="flex justify-center mb-16 relative"><div class="absolute top-1/2 left-0 right-0 h-px bg-chaos-border -translate-y-1/2 -z-10"></div><button id="arena-run" class="bg-chaos-green text-chaos-dark disabled:bg-chaos-muted disabled:text-chaos-darker font-extrabold text-lg px-12 py-4 rounded hover:bg-chaos-green/90 transition-all uppercase tracking-widest flex items-center gap-3 shadow-[0_0_30px_rgba(57,255,20,0.3)] hover:shadow-[0_0_50px_rgba(57,255,20,0.5)] transform hover:scale-105">RUN RACE<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right w-5 h-5" aria-hidden="true"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg></button></div>

      <div id="arena-result"></div>
    </div>
  `;

  document.getElementById("arena-run")?.addEventListener("click", async () => {
    const scenarioKey = document.getElementById("arena-scenario")?.value || state.order[0];
    const modeA = document.getElementById("arena-mode-a")?.value || "script";
    const modeB = document.getElementById("arena-mode-b")?.value || "rl";
    const scriptA = document.getElementById("arena-script-a")?.value || "";
    const scriptB = document.getElementById("arena-script-b")?.value || "";
    const runButton = document.getElementById("arena-run");
    const resultNode = document.getElementById("arena-result");

    if (runButton) runButton.setAttribute("disabled", "disabled");
    if (resultNode) {
      resultNode.innerHTML = `<div class="bg-chaos-panel/50 border border-chaos-border rounded-lg p-4 text-sm">Running race...</div>`;
    }

    try {
      const [resultA, resultB] = await Promise.all([
        runArenaAgent("AGENT_ALPHA", modeA, scriptA, scenarioKey),
        runArenaAgent("AGENT_BETA", modeB, scriptB, scenarioKey),
      ]);
      if (resultNode) {
        resultNode.innerHTML = renderArenaResult(resultA, resultB);
      }
    } catch (error) {
      if (resultNode) {
        resultNode.innerHTML = `<div class="bg-chaos-panel/50 border border-chaos-border rounded-lg p-4 text-sm">Race failed: ${escapeHtml(error.message)}</div>`;
      }
    } finally {
      if (runButton) runButton.removeAttribute("disabled");
    }
  });
}

function renderError(message) {
  appRoot.innerHTML = `<div class="max-w-5xl mx-auto p-8"><div class="bg-chaos-panel/50 border border-chaos-border rounded-lg p-6"><h2 class="text-xl font-bold mb-3">Frontend failed to initialize</h2><p class="text-sm text-chaos-muted">${escapeHtml(message)}</p></div></div>`;
}

async function hydrateScenarios() {
  const payload = await fetchJSON(API.scenarios);
  state.scenarios = payload.scenarios || {};
  state.order = Object.keys(state.scenarios);
}

async function mount() {
  try {
    await hydrateScenarios();
    renderNav();

    if (routeKey(state.path) === "builder") {
      await renderBuilder();
      return;
    }
    if (routeKey(state.path) === "playground") {
      await renderPlayground();
      return;
    }
    if (routeKey(state.path) === "arena") {
      renderArena();
      return;
    }

    renderHub();
  } catch (error) {
    renderNav();
    renderError(error.message || "Unknown error");
  }
}

window.addEventListener("pagehide", () => {
  destroyPlaygroundEnv();
});

mount();
