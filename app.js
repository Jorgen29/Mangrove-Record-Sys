// ==========================================================================
// CENTRAL CLOUD INTERACTION ENGINE DATA ACCESS VARIABLES
// ==========================================================================
const SUPABASE_URL = "https://tqgswktjbtqjunzmhuth.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxZ3N3a3RqYnRxanVuem1odXRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2MTk3NTgsImV4cCI6MjA5NTE5NTc1OH0.Za4hXbo4cEUthkw41Q6zcCsAG8x1LEvYmQkLmSH3Z8M";
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// State tracking arrays
let mangroveRecords = [];
let saplingRecords = [];
let wildingRecords = [];

function toggleMobileSidebar() {
  const sidebar = document.getElementById("sidebar");
  sidebar.classList.toggle("show");
}

function calculateMetrics(gbhValue) {
  const dbh = gbhValue / Math.PI;

  // Formula processes DBH directly in cm: =PI()*POWER(DBH,2)/4
  const basalArea = (Math.PI * Math.pow(dbh, 2)) / 4;

  return {
    dbh: dbh.toFixed(8),
    basalArea: basalArea.toFixed(8),
  };
}

// FIXED: Handles independent botanical calculation routes for Saplings (2cm) vs Wildings (0.5cm)
function calculateRegenBasalArea(countValue, typeValue) {
  // If Type is Wilding, use 0.5cm diameter. Otherwise, use 2.0cm diameter.
  const diameter = typeValue === "Wilding" ? 0.5 : 2.0;
  const formulaBase = (Math.PI * Math.pow(diameter, 2)) / 4;
  const finalArea = formulaBase * countValue;
  return finalArea.toFixed(8);
}

// ==========================================================================
// PROJECT COMPONENT 1: TREE ENGINE (tree.html)
// ==========================================================================
async function fetchTreeCloudRecords() {
  try {
    const { data, error } = await _supabase
      .from("mangrove_trees")
      .select("*, mangrove_stems(*)")
      .order("transect_number", { ascending: true })
      .order("plot_number", { ascending: true })
      .order("id", { ascending: false });

    if (error) throw error;

    mangroveRecords = data.map((tree) => ({
      id: tree.id,
      species: tree.species,
      transect: tree.transect_number,
      plot: tree.plot_number,
      stems: tree.mangrove_stems
        .sort((a, b) => a.id - b.id)
        .map((stem) => ({
          id: stem.id,
          label: stem.label,
          gbh: Number(stem.gbh).toFixed(1),
          dbh: Number(stem.dbh).toFixed(8),
          basalArea: Number(stem.basal_area).toFixed(8),
        })),
    }));
    renderTreeTable();
  } catch (err) {
    console.error("Tree synchronization read breakdown exception:", err);
  }
}

function renderTreeTable() {
  const datasetBody = document.getElementById("datasetBody");
  const recordCounter = document.getElementById("recordCounter");
  if (!datasetBody) return;

  recordCounter.textContent = `Total Trees: ${mangroveRecords.length}`;
  if (mangroveRecords.length === 0) {
    datasetBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-5 fw-semibold"><i class="fa-solid fa-folder-open d-block fs-2 mb-2 text-secondary"></i>No survey records inputted yet.</td></tr>`;
    return;
  }

  datasetBody.innerHTML = "";
  mangroveRecords.forEach((tree) => {
    let totalBasalArea = 0;
    tree.stems.forEach((s) => (totalBasalArea += parseFloat(s.basalArea)));
    const equivalentDbhMeters = Math.sqrt((4 * totalBasalArea) / Math.PI);
    const equivalentDbhCm = (equivalentDbhMeters * 100).toFixed(8);

    const summaryRow = document.createElement("tr");
    summaryRow.className = "tree-group-header";
    summaryRow.innerHTML = `
            <td class="ps-3 fw-bold text-dark text-uppercase">
                <span class="badge bg-dark me-2">T${tree.transect} - P${tree.plot}</span>
                <i class="fa-solid fa-folder text-warning me-1"></i>${tree.species}
            </td>
            <td class="text-muted small italic text-center">Combined Total</td>
            <td class="font-monospace"><span class="badge badge-calc text-success">${equivalentDbhCm}</span></td>
            <td class="font-monospace fw-bold text-success">${totalBasalArea.toFixed(8)}</td>
            <td class="text-center">
                <div class="btn-group" role="group">
                    <button class="btn btn-sm btn-success" onclick="triggerBranchModal(${tree.id})"><i class="fa-solid fa-plus"></i> Stem</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteTree(${tree.id})"><i class="fa-solid fa-trash-can"></i></button>
                </div>
            </td>
        `;
    datasetBody.appendChild(summaryRow);

    tree.stems.forEach((stem) => {
      const stemRow = document.createElement("tr");
      stemRow.className = "sub-branch-row text-secondary";
      stemRow.innerHTML = `
                <td class="ps-5 text-muted small"><i class="fa-solid fa-turn-up fa-rotate-90 me-2 text-secondary"></i>${stem.label}</td>
                <td class="font-monospace">${stem.gbh}</td>
                <td class="font-monospace"><span class="badge badge-branch-calc">${stem.dbh}</span></td>
                <td class="font-monospace">${stem.basalArea}</td>
                <td class="text-center"><button class="btn btn-sm btn-outline-secondary" style="padding: 2px 6px; font-size: 0.75rem;" onclick="deleteStem(${tree.id}, ${stem.id})"><i class="fa-solid fa-xmark"></i> Remove</button></td>
            `;
      datasetBody.appendChild(stemRow);
    });
  });
}

// ==========================================================================
// PROJECT COMPONENT 2: SPLIT REGENERATION ENGINE (saplings_wildings.html)
// ==========================================================================
async function fetchRegenCloudRecords() {
  try {
    const { data, error } = await _supabase
      .from("mangrove_regeneration")
      .select("*")
      .order("transect_number", { ascending: true })
      .order("plot_number", { ascending: true });

    if (error) throw error;

    saplingRecords = data
      .filter((r) => r.type === "Sapling")
      .map((record) => ({
        id: record.id,
        species: record.species,
        transect: record.transect_number,
        plot: record.plot_number,
        type: record.type,
        count: record.total_count,
        basalArea: Number(record.basal_area).toFixed(8),
      }));

    wildingRecords = data
      .filter((r) => r.type === "Wilding")
      .map((record) => ({
        id: record.id,
        species: record.species,
        transect: record.transect_number,
        plot: record.plot_number,
        type: record.type,
        count: record.total_count,
        basalArea: Number(record.basal_area).toFixed(8),
      }));

    renderRegenTables();
  } catch (err) {
    console.error("Regeneration engine mapping pipeline failure:", err);
  }
}

function renderRegenTables() {
  const saplingBody = document.getElementById("saplingTableBody");
  const wildingBody = document.getElementById("wildingTableBody");
  const saplingCounter = document.getElementById("saplingCounter");
  const wildingCounter = document.getElementById("wildingCounter");

  if (saplingBody && saplingCounter) {
    saplingCounter.textContent = `Total Rows: ${saplingRecords.length}`;
    if (saplingRecords.length === 0) {
      saplingBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4 fw-medium">No sapling records located.</td></tr>`;
    } else {
      saplingBody.innerHTML = "";
      saplingRecords.forEach((record) => {
        const row = document.createElement("tr");
        row.innerHTML = `
                    <td class="ps-3 fw-bold text-dark"><span class="badge bg-dark me-2">T${record.transect} - P${record.plot}</span>${record.species}</td>
                    <td><span class="badge-type badge-sapling"><i class="fa-solid fa-baby-carriage me-1"></i>Sapling</span></td>
                    <td class="font-monospace fw-semibold">${record.count}</td>
                    <td class="font-monospace fw-bold text-success">${record.basalArea}</td>
                    <td class="text-center"><button class="btn btn-sm btn-outline-danger" onclick="deleteRegenEntry(${record.id})"><i class="fa-solid fa-trash-can"></i></button></td>
                `;
        saplingBody.appendChild(row);
      });
    }
  }

  if (wildingBody && wildingCounter) {
    wildingCounter.textContent = `Total Rows: ${wildingRecords.length}`;
    if (wildingRecords.length === 0) {
      wildingBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4 fw-medium">No wilding records located.</td></tr>`;
    } else {
      wildingBody.innerHTML = "";
      wildingRecords.forEach((record) => {
        const row = document.createElement("tr");
        row.innerHTML = `
                    <td class="ps-3 fw-bold text-dark"><span class="badge bg-dark me-2">T${record.transect} - P${record.plot}</span>${record.species}</td>
                    <td><span class="badge-type badge-wilding"><i class="fa-solid fa-shuttle-space me-1"></i>Wilding</span></td>
                    <td class="font-monospace fw-semibold">${record.count}</td>
                    <td class="font-monospace fw-bold text-success">${record.basalArea}</td>
                    <td class="text-center"><button class="btn btn-sm btn-outline-danger" onclick="deleteRegenEntry(${record.id})"><i class="fa-solid fa-trash-can"></i></button></td>
                `;
        wildingBody.appendChild(row);
      });
    }
  }
}

// ==========================================================================
// PROJECT COMPONENT 3: ANALYTICS CONSOLIDATION (report.html)
// ==========================================================================
async function generateConsolidatedReport() {
  const ledgerSection = document.getElementById("dynamicLedgerSection");
  if (!ledgerSection) return;

  try {
    const [treeFetch, regenFetch] = await Promise.all([
      _supabase
        .from("mangrove_trees")
        .select(
          "species, transect_number, plot_number, mangrove_stems(basal_area)",
        ),
      _supabase
        .from("mangrove_regeneration")
        .select("species, type, transect_number, plot_number, basal_area"),
    ]);

    if (treeFetch.error) throw treeFetch.error;
    if (regenFetch.error) throw regenFetch.error;

    let structuredPlotsMap = {};
    let globalTotalBa = 0;
    let globalTotalStands = 0;

    // 1. Accumulate Tree Stems into local location matrices
    treeFetch.data.forEach((tree) => {
      const tNum = tree.transect_number || 1;
      const pNum = tree.plot_number || 1;
      const locKey = `Transect ${tNum} — Plot ${pNum}`;
      const itemKey = `${tree.species}==Tree`;

      if (!structuredPlotsMap[locKey]) structuredPlotsMap[locKey] = {};
      if (!structuredPlotsMap[locKey][itemKey]) {
        structuredPlotsMap[locKey][itemKey] = {
          species: tree.species,
          type: "Tree",
          totalBA: 0,
        };
      }

      if (tree.mangrove_stems) {
        tree.mangrove_stems.forEach((stem) => {
          const ba = parseFloat(stem.basal_area || 0);
          structuredPlotsMap[locKey][itemKey].totalBA += ba;
          globalTotalBa += ba;
        });
      }
    });

    // 2. Accumulate Saplings and Wildings into local location matrices
    regenFetch.data.forEach((regen) => {
      const tNum = regen.transect_number || 1;
      const pNum = regen.plot_number || 1;
      const locKey = `Transect ${tNum} — Plot ${pNum}`;
      const itemKey = `${regen.species}==${regen.type}`;
      const ba = parseFloat(regen.basal_area || 0);

      if (!structuredPlotsMap[locKey]) structuredPlotsMap[locKey] = {};
      if (!structuredPlotsMap[locKey][itemKey]) {
        structuredPlotsMap[locKey][itemKey] = {
          species: regen.species,
          type: regen.type,
          totalBA: 0,
        };
      }

      structuredPlotsMap[locKey][itemKey].totalBA += ba;
      globalTotalBa += ba;
    });

    // Wipe layout containers bare to remove loading text completely
    ledgerSection.innerHTML = "";

    const sortedLocations = Object.keys(structuredPlotsMap).sort((a, b) => {
      return a.localeCompare(b, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });

    if (sortedLocations.length === 0) {
      ledgerSection.innerHTML = `<div class="table-container text-center text-muted py-4">No data metrics resolved from cloud database registers.</div>`;
      return;
    }

    // 3. Generate a distinct table grid structure for each location block
    sortedLocations.forEach((locationTitle) => {
      globalTotalStands++;
      const plotDataRows = structuredPlotsMap[locationTitle];

      // Plot-specific counter variables
      let plotTotalBa = 0;
      let plotTotalSba = 0;

      const tableWrapper = document.createElement("div");
      tableWrapper.className =
        "table-container mb-4 shadow-sm border-top border-success border-3";

      let innerHTMLMarkup = `
        <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap">
            <h5 class="m-0 fw-bold text-success"><i class="fa-solid fa-map-location-dot me-2 text-dark"></i>${locationTitle}</h5>
            <span class="badge bg-dark px-2 py-1 small">Active Sub-Plot Matrix</span>
        </div>
        <div class="table-responsive">
            <table class="table align-middle m-0">
                <thead class="table-light text-uppercase small text-secondary">
                    <tr>
                        <th class="ps-2">Species Botanical Name</th>
                        <th style="width: 160px;">Type Category</th>
                        <th style="width: 220px;">Total Basal Area <span class="text-muted font-monospace">(cm²)</span></th>
                        <th style="width: 220px;">SBA <span class="text-muted font-monospace">(BA / 100)</span></th>
                    </tr>
                </thead>
                <tbody>
      `;

      Object.keys(plotDataRows)
        .sort()
        .forEach((itemKey) => {
          const item = plotDataRows[itemKey];
          const computedSba = item.totalBA / 100;

          // Sum plot-specific aggregates
          plotTotalBa += item.totalBA;
          plotTotalSba += computedSba;

          let badgeClass =
            item.type === "Tree"
              ? "badge-tree"
              : item.type === "Sapling"
                ? "badge-sapling"
                : "badge-wilding";

          innerHTMLMarkup += `
          <tr>
            <td class="ps-2 fw-bold text-dark text-uppercase">${item.species}</td>
            <td><span class="badge-type ${badgeClass}">${item.type}</span></td>
            <td class="font-monospace fw-semibold text-success">${item.totalBA.toFixed(8)}</td>
            <td class="font-monospace fw-semibold text-dark">${computedSba.toFixed(8)}</td>
          </tr>
        `;
        });

      // FIXED: Appends a high-visibility, calculation summary summary row right inside this table's footer block
      innerHTMLMarkup += `
                <tr class="table-success border-top border-dark border-2">
                    <td colspan="2" class="ps-2 fw-bold text-uppercase text-success">
                        <i class="fa-solid fa-calculator me-2"></i>Plot Summary Total
                    </td>
                    <td class="font-monospace fw-bold text-success">${plotTotalBa.toFixed(8)}</td>
                    <td class="font-monospace fw-bold text-dark">${plotTotalSba.toFixed(8)}</td>
                </tr>
                </tbody>
            </table>
        </div>
      `;

      tableWrapper.innerHTML = innerHTMLMarkup;
      ledgerSection.appendChild(tableWrapper);
    });

    // Synchronize top statistics cards display calculations
    const globalTotalSba = globalTotalBa / 100;
    document.getElementById("statTotalStands").textContent = globalTotalStands;
    document.getElementById("statTotalBa").textContent =
      globalTotalBa.toFixed(8);
    document.getElementById("statGlobalSba").textContent =
      globalTotalSba.toFixed(8);
  } catch (err) {
    console.error("Report framework calculation breakdown trace:", err);
    ledgerSection.innerHTML = `<div class="alert alert-danger"><i class="fa-solid fa-triangle-exclamation me-2"></i>Data compilation framework error.</div>`;
  }
}

// ==========================================================================
// CENTRALIZED SPECIES CATALOG LOGIC SEED ENGINE
// ==========================================================================
async function populateSpeciesDropdown(selectElementId) {
  const dropdown = document.getElementById(selectElementId);
  if (!dropdown) return;

  try {
    const { data, error } = await _supabase
      .from("mangrove_species_catalog")
      .select("*")
      .order("botanical_name", { ascending: true });

    if (error) throw error;

    const placeholder = dropdown.querySelector("option[disabled]");
    dropdown.innerHTML = "";
    if (placeholder) dropdown.appendChild(placeholder);

    data.forEach((item) => {
      const option = document.createElement("option");
      const fullLabel =
        item.common_name && item.common_name !== "Unclassified"
          ? `${item.botanical_name} (${item.common_name})`
          : item.botanical_name;

      option.value = fullLabel;
      option.textContent = fullLabel;
      dropdown.appendChild(option);
    });
  } catch (err) {
    console.error(
      `CATALOG ERROR: Unable to populate dropdown '${selectElementId}':`,
      err,
    );
  }
}

// ==========================================================================
// DYNAMIC GLOBAL SIDEBAR LOADING PIPELINE
// ==========================================================================
async function injectGlobalSidebar() {
  const sidebarContainer = document.getElementById("sidebar");
  if (!sidebarContainer) return;

  try {
    const response = await fetch("sidebar.html");
    if (!response.ok) throw new Error(`HTTP Error Status: ${response.status}`);

    const markup = await response.text();
    sidebarContainer.innerHTML = markup;

    // Automatically detect current view state filename to set active highlight properties
    const currentPath =
      window.location.pathname.split("/").pop() || "tree.html";
    const matchingLink = sidebarContainer.querySelector(
      `[data-page="${currentPath}"]`,
    );

    if (matchingLink) {
      matchingLink.classList.add("active");
    }
    console.log(
      `LOG MODULE: Sidebar loaded and synced to active view state: "${currentPath}"`,
    );
  } catch (err) {
    console.error(
      "CRITICAL FRAMEWORK BREAKDOWN: Unable to fetch sidebar template component:",
      err,
    );
  }
}

// Automatically trigger injection whenever DOM load events complete across tracking screens
document.addEventListener("DOMContentLoaded", injectGlobalSidebar);

// ==========================================================================
// SESSION SECURITY LOGOUT ROUTER
// ==========================================================================
async function terminateUserSession() {
  try {
    const { error } = await _supabase.auth.signOut();
    if (error) throw error;

    // Return to login screen entry page node
    window.location.href = "index.html";
  } catch (err) {
    console.error(
      "SESSION ERROR: Unable to securely clear session tokens:",
      err,
    );
  }
}
// ==========================================================================
// PORTAL SECURE SECURITY SESSION INTERCEPT GUARD
// ==========================================================================
(function verifyActiveSessionState() {
  const sessionActive = localStorage.getItem("portal_session_active");
  const currentView = window.location.pathname.split("/").pop();

  if (currentView !== "index.html" && sessionActive !== "true") {
    console.warn(
      "GUARD ALERT: Restricting unverified routing path. Returning to index.html...",
    );
    window.location.href = "index.html";
  }
})();

// Updated sign-out execution route matching the custom session token architecture
function terminateUserSession() {
  localStorage.removeItem("portal_session_active");
  localStorage.removeItem("portal_user");
  window.location.href = "index.html";
}
