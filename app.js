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
    // FIXED: Performs relational inner-join to pull live catalog string maps instead of text species
    const { data, error } = await _supabase
      .from("mangrove_trees")
      .select(
        "id, transect_number, plot_number, species_id, mangrove_species_catalog(botanical_name, common_name), mangrove_stems(*)",
      )
      .order("transect_number", { ascending: true })
      .order("plot_number", { ascending: true })
      .order("id", { ascending: false });

    if (error) throw error;

    mangroveRecords = data.map((tree) => {
      const catalog = tree.mangrove_species_catalog;
      const dynamicLabel = catalog
        ? catalog.common_name && catalog.common_name !== "Unclassified"
          ? `${catalog.botanical_name} (${catalog.common_name})`
          : catalog.botanical_name
        : "Unassigned Species";

      return {
        id: tree.id,
        species: dynamicLabel,
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
      };
    });
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

    // FIXED: Use the loop array index to dynamically calculate sequential stem numbers
    tree.stems.forEach((stem, index) => {
      const stemRow = document.createElement("tr");
      stemRow.className = "sub-branch-row text-secondary";

      const dynamicLabel =
        index === 0 ? "Main Trunk (Stem 1)" : `Branch Stem ${index + 1}`;

      stemRow.innerHTML = `
                <td class="ps-5 text-muted small"><i class="fa-solid fa-turn-up fa-rotate-90 me-2 text-secondary"></i>${dynamicLabel}</td>
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
      .select("*, mangrove_species_catalog(botanical_name, common_name)")
      .order("transect_number", { ascending: true })
      .order("plot_number", { ascending: true });

    if (error) throw error;

    const mapRelationalRecord = (record) => {
      const catalog = record.mangrove_species_catalog;
      const dynamicLabel = catalog
        ? catalog.common_name && catalog.common_name !== "Unclassified"
          ? `${catalog.botanical_name} (${catalog.common_name})`
          : catalog.botanical_name
        : "Unassigned Species";

      return {
        id: record.id,
        species_id: record.species_id,
        species: dynamicLabel,
        transect: record.transect_number,
        plot: record.plot_number,
        type: record.type,
        count: record.total_count,
        basalArea: Number(record.basal_area).toFixed(8),
      };
    };

    saplingRecords = data
      .filter((r) => r.type === "Sapling")
      .map(mapRelationalRecord);
    wildingRecords = data
      .filter((r) => r.type === "Wilding")
      .map(mapRelationalRecord);

    renderRegenTables(); // FIXED: Can now safely call this because it lives in the same file below!
  } catch (err) {
    console.error("Regeneration engine mapping pipeline failure:", err);
  }
}

// FIXED: Moved from HTML script block into app.js to solve scope definition errors
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
          "transect_number, plot_number, mangrove_species_catalog(botanical_name, common_name), mangrove_stems(basal_area)",
        ),
      _supabase
        .from("mangrove_regeneration")
        .select(
          "type, transect_number, plot_number, basal_area, mangrove_species_catalog(botanical_name, common_name)",
        ),
    ]);

    if (treeFetch.error) throw treeFetch.error;
    if (regenFetch.error) throw regenFetch.error;

    let structuredPlotsMap = {};
    let globalTotalBa = 0;
    let globalTotalStands = 0;

    const parseName = (catalog) => {
      if (!catalog) return "Unassigned Species";
      return catalog.common_name && catalog.common_name !== "Unclassified"
        ? `${catalog.botanical_name} (${catalog.common_name})`
        : catalog.botanical_name;
    };

    const createMatrixRowTemplate = (speciesLabel) => ({
      species: speciesLabel,
      treeRawBa: 0,
      saplingRawBa: 0,
      wildingRawBa: 0,
    });

    treeFetch.data.forEach((tree) => {
      const tNum = tree.transect_number || 1;
      const pNum = tree.plot_number || 1;
      const locKey = `Transect ${tNum} — Plot ${pNum}`;
      const resolvedName = parseName(tree.mangrove_species_catalog);

      if (!structuredPlotsMap[locKey]) structuredPlotsMap[locKey] = {};
      if (!structuredPlotsMap[locKey][resolvedName]) {
        structuredPlotsMap[locKey][resolvedName] =
          createMatrixRowTemplate(resolvedName);
      }

      if (tree.mangrove_stems) {
        tree.mangrove_stems.forEach((stem) => {
          structuredPlotsMap[locKey][resolvedName].treeRawBa += parseFloat(
            stem.basal_area || 0,
          );
        });
      }
    });

    regenFetch.data.forEach((regen) => {
      const tNum = regen.transect_number || 1;
      const pNum = regen.plot_number || 1;
      const locKey = `Transect ${tNum} — Plot ${pNum}`;
      const resolvedName = parseName(regen.mangrove_species_catalog);

      if (!structuredPlotsMap[locKey]) structuredPlotsMap[locKey] = {};
      if (!structuredPlotsMap[locKey][resolvedName]) {
        structuredPlotsMap[locKey][resolvedName] =
          createMatrixRowTemplate(resolvedName);
      }

      if (regen.type === "Sapling") {
        structuredPlotsMap[locKey][resolvedName].saplingRawBa += parseFloat(
          regen.basal_area || 0,
        );
      } else if (regen.type === "Wilding") {
        structuredPlotsMap[locKey][resolvedName].wildingRawBa += parseFloat(
          regen.basal_area || 0,
        );
      }
    });

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

    sortedLocations.forEach((locationTitle) => {
      globalTotalStands++;
      const plotDataRows = structuredPlotsMap[locationTitle];
      const sortedSpeciesKeys = Object.keys(plotDataRows).sort();

      let plotTotalBaTree = 0,
        plotTotalSbaTree = 0;
      let plotTotalBaSap = 0,
        plotTotalSbaSap = 0;
      let plotTotalBaWild = 0,
        plotTotalSbaWild = 0;
      let plotSumAllMeanBa = 0,
        plotSumAllMeanSba = 0;

      const tableWrapper = document.createElement("div");
      tableWrapper.className = "table-container mb-5 shadow-sm pb-1";

      let innerHTMLMarkup = `
        <div class="d-flex justify-content-between align-items-center mb-3 px-2">
            <h5 class="m-0 fw-bold text-success"><i class="fa-solid fa-map-location-dot me-2 text-dark"></i>${locationTitle}</h5>
            <span class="badge bg-dark px-2 py-1 small">Active Plot Matrix</span>
        </div>
        <div class="table-responsive">
            <table class="table table-borderless align-middle m-0 text-center">
                <thead class="table-light text-uppercase small text-secondary">
                    <tr class="border-bottom">
                        <th class="ps-3 text-start" style="min-width: 240px;">Species Botanical Name</th>
                        <th class="text-primary" style="width: 110px;">BA<br><small>(Tree)</small></th>
                        <th class="text-primary" style="width: 110px;">SBA<br><small>(Tree)</small></th>
                        <th class="text-info" style="width: 110px;">BA<br><small>(Sapling)</small></th>
                        <th class="text-info" style="width: 110px;">SBA<br><small>(Sapling)</small></th>
                        <th class="text-warning" style="width: 110px;">BA<br><small>(Wilding)</small></th>
                        <th class="text-warning" style="width: 110px;">SBA<br><small>(Wilding)</small></th>
                        <th class="text-success border-start" style="width: 130px;">Row Sum<br><small>Basal Area</small></th>
                        <th class="text-dark" style="width: 130px;">Row Sum<br><small>SBA</small></th>
                    </tr>
                </thead>
                <tbody>
      `;

      sortedSpeciesKeys.forEach((speciesName) => {
        const rowData = plotDataRows[speciesName];

        const baTree = rowData.treeRawBa;
        const sbaTree = baTree / 100;

        const baSap = rowData.saplingRawBa;
        const sbaSap = baSap / 100;

        const baWild = rowData.wildingRawBa;
        const sbaWild = baWild / 100;

        const rowSumBa = baTree + baSap + baWild;
        const rowSumSba = sbaTree + sbaSap + sbaWild;

        plotTotalBaTree += baTree;
        plotTotalSbaTree += sbaTree;
        plotTotalBaSap += baSap;
        plotTotalSbaSap += sbaSap;
        plotTotalBaWild += baWild;
        plotTotalSbaWild += sbaWild;
        plotSumAllMeanBa += rowSumBa;
        plotSumAllMeanSba += rowSumSba;

        globalTotalBa += rowSumBa;

        // FIXED: Dropped all background highlighting utility classes from columns/cells
        innerHTMLMarkup += `
          <tr class="border-bottom-subtle">
            <td class="ps-3 fw-bold text-dark text-start text-uppercase">${rowData.species}</td>
            <td class="font-monospace text-secondary fw-semibold">${baTree.toFixed(8)}</td>
            <td class="font-monospace text-secondary fw-semibold">${sbaTree.toFixed(8)}</td>
            <td class="font-monospace text-secondary fw-semibold">${baSap.toFixed(8)}</td>
            <td class="font-monospace text-secondary fw-semibold">${sbaSap.toFixed(8)}</td>
            <td class="font-monospace text-secondary fw-semibold">${baWild.toFixed(8)}</td>
            <td class="font-monospace text-secondary fw-semibold">${sbaWild.toFixed(8)}</td>
            <td class="font-monospace text-secondary fw-semibold border-start">${rowSumBa.toFixed(8)}</td>
            <td class="font-monospace text-secondary fw-semibold">${rowSumSba.toFixed(8)}</td>
          </tr>
        `;
      });

      // FIXED: Dropped 'table-success' layout alerts from report calculation footers
      innerHTMLMarkup += `
                <tr class="fw-bold text-dark border-top border-dark border-2">
                    <td class="ps-3 text-uppercase text-dark text-start">Plot Summary Total</td>
                    <td class="font-monospace text-secondary">${plotTotalBaTree.toFixed(8)}</td>
                    <td class="font-monospace text-secondary">${plotTotalSbaTree.toFixed(8)}</td>
                    <td class="font-monospace text-secondary">${plotTotalBaSap.toFixed(8)}</td>
                    <td class="font-monospace text-secondary">${plotTotalSbaSap.toFixed(8)}</td>
                    <td class="font-monospace text-secondary">${plotTotalBaWild.toFixed(8)}</td>
                    <td class="font-monospace text-secondary">${plotTotalSbaWild.toFixed(8)}</td>
                    <td class="font-monospace text-secondary border-start">${plotSumAllMeanBa.toFixed(8)}</td>
                    <td class="font-monospace text-secondary">${plotSumAllMeanSba.toFixed(8)}</td>
                </tr>
                </tbody>
            </table>
        </div>
      `;
      tableWrapper.innerHTML = innerHTMLMarkup;
      ledgerSection.appendChild(tableWrapper);
    });

    const globalTotalSba = globalTotalBa / 100;
    document.getElementById("statTotalStands").textContent = globalTotalStands;
    document.getElementById("statTotalBa").textContent =
      globalTotalBa.toFixed(8);
    document.getElementById("statGlobalSba").textContent =
      globalTotalSba.toFixed(8);
  } catch (err) {
    console.error("Report framework compilation error trace:", err);
  }
}

// ==========================================================================
// PROJECT COMPONENT 4: MEAN VALUE ANALYSIS ENGINE (mean_value.html)
// ==========================================================================
async function generateMeanValueReport() {
  const meanWorkspace = document.getElementById("meanWorkspace");
  if (!meanWorkspace) return;

  try {
    const [treeFetch, regenFetch] = await Promise.all([
      _supabase
        .from("mangrove_trees")
        .select(
          "mangrove_species_catalog(botanical_name, common_name), mangrove_stems(basal_area)",
        ),
      _supabase
        .from("mangrove_regeneration")
        .select(
          "type, basal_area, mangrove_species_catalog(botanical_name, common_name)",
        ),
    ]);

    if (treeFetch.error) throw treeFetch.error;
    if (regenFetch.error) throw regenFetch.error;

    let masterMeanMatrix = {};

    const parseName = (catalog) => {
      if (!catalog) return "Unassigned Species";
      return catalog.common_name && catalog.common_name !== "Unclassified"
        ? `${catalog.botanical_name} (${catalog.common_name})`
        : catalog.botanical_name;
    };

    const createMatrixRowTemplate = (speciesLabel) => ({
      species: speciesLabel,
      treeRawBa: 0,
      saplingRawBa: 0,
      wildingRawBa: 0,
    });

    treeFetch.data.forEach((tree) => {
      const resolvedName = parseName(tree.mangrove_species_catalog);
      if (!masterMeanMatrix[resolvedName]) {
        masterMeanMatrix[resolvedName] = createMatrixRowTemplate(resolvedName);
      }
      if (tree.mangrove_stems) {
        tree.mangrove_stems.forEach((stem) => {
          masterMeanMatrix[resolvedName].treeRawBa += parseFloat(
            stem.basal_area || 0,
          );
        });
      }
    });

    regenFetch.data.forEach((regen) => {
      const resolvedName = parseName(regen.mangrove_species_catalog);
      if (!masterMeanMatrix[resolvedName]) {
        masterMeanMatrix[resolvedName] = createMatrixRowTemplate(resolvedName);
      }
      if (regen.type === "Sapling") {
        masterMeanMatrix[resolvedName].saplingRawBa += parseFloat(
          regen.basal_area || 0,
        );
      } else if (regen.type === "Wilding") {
        masterMeanMatrix[resolvedName].wildingRawBa += parseFloat(
          regen.basal_area || 0,
        );
      }
    });

    meanWorkspace.innerHTML = "";
    const sortedSpeciesKeys = Object.keys(masterMeanMatrix).sort();

    if (sortedSpeciesKeys.length === 0) {
      meanWorkspace.innerHTML = `<div class="table-container text-center text-muted py-5 shadow-sm">No survey records calculated inside cloud registers.</div>`;
      return;
    }

    let grandTotalMeanBaTree = 0,
      grandTotalMeanSbaTree = 0;
    let grandTotalMeanBaSap = 0,
      grandTotalMeanSbaSap = 0;
    let grandTotalMeanBaWild = 0,
      grandTotalMeanSbaWild = 0;
    let globalSumAllMeanBa = 0,
      globalSumAllMeanSba = 0;

    let tableWrapper = document.createElement("div");
    tableWrapper.className = "table-container mb-4 shadow-sm pb-1";

    let innerHTMLMarkup = `
      <div class="d-flex justify-content-between align-items-center mb-3 px-2">
          <h5 class="m-0 fw-bold text-dark"><i class="fa-solid fa-table-cells me-2 text-success"></i>Consolidated Mean Value Census Matrix</h5>
          <span class="badge bg-dark px-2 py-1">Normalization Base Factor: /8</span>
      </div>
      <div class="table-responsive">
          <table class="table table-borderless align-middle m-0 text-center">
              <thead class="table-light text-uppercase small text-secondary">
                  <tr class="border-bottom">
                      <th class="ps-3 text-start" style="min-width: 240px;">Species Botanical Name</th>
                      <th class="text-primary" style="width: 110px;">Mean BA<br><small>(Tree)</small></th>
                      <th class="text-primary" style="width: 110px;">Mean SBA<br><small>(Tree)</small></th>
                      <th class="text-info" style="width: 110px;">Mean BA<br><small>(Sapling)</small></th>
                      <th class="text-info" style="width: 110px;">Mean SBA<br><small>(Sapling)</small></th>
                      <th class="text-warning" style="width: 110px;">Mean BA<br><small>(Wilding)</small></th>
                      <th class="text-warning" style="width: 110px;">Mean SBA<br><small>(Wilding)</small></th>
                      <th class="text-success border-start" style="width: 130px;">Row Sum<br><small>Mean BA</small></th>
                      <th class="text-dark" style="width: 130px;">Row Sum<br><small>Mean SBA</small></th>
                  </tr>
              </thead>
              <tbody>
    `;

    sortedSpeciesKeys.forEach((speciesName) => {
      const rowData = masterMeanMatrix[speciesName];

      const meanBaTree = rowData.treeRawBa / 8;
      const meanSbaTree = meanBaTree / 100;

      const meanBaSap = rowData.saplingRawBa / 8;
      const meanSbaSap = meanBaSap / 100;

      const meanBaWild = rowData.wildingRawBa / 8;
      const meanSbaWild = meanBaWild / 100;

      const rowSumMeanBa = meanBaTree + meanBaSap + meanBaWild;
      const rowSumMeanSba = meanSbaTree + meanSbaSap + meanSbaWild;

      grandTotalMeanBaTree += meanBaTree;
      grandTotalMeanSbaTree += meanSbaTree;
      grandTotalMeanBaSap += meanBaSap;
      grandTotalMeanSbaSap += meanSbaSap;
      grandTotalMeanBaWild += meanBaWild;
      grandTotalMeanSbaWild += meanSbaWild;
      globalSumAllMeanBa += rowSumMeanBa;
      globalSumAllMeanSba += rowSumMeanSba;

      // FIXED: Set plain text text-secondary parameters layout fields
      innerHTMLMarkup += `
        <tr class="border-bottom-subtle">
          <td class="ps-3 fw-bold text-dark text-start text-uppercase">${rowData.species}</td>
          <td class="font-monospace text-secondary fw-semibold">${meanBaTree.toFixed(8)}</td>
          <td class="font-monospace text-secondary fw-semibold">${meanSbaTree.toFixed(8)}</td>
          <td class="font-monospace text-secondary fw-semibold">${meanBaSap.toFixed(8)}</td>
          <td class="font-monospace text-secondary fw-semibold">${meanSbaSap.toFixed(8)}</td>
          <td class="font-monospace text-secondary fw-semibold">${meanBaWild.toFixed(8)}</td>
          <td class="font-monospace text-secondary fw-semibold">${meanSbaWild.toFixed(8)}</td>
          <td class="font-monospace text-secondary fw-semibold border-start">${rowSumMeanBa.toFixed(8)}</td>
          <td class="font-monospace text-secondary fw-semibold">${rowSumMeanSba.toFixed(8)}</td>
        </tr>
      `;
    });

    // FIXED: Dropped 'table-success' highlighting markers from footer parameters rows
    innerHTMLMarkup += `
              <tr class="fw-bold text-dark border-top border-dark border-2">
                  <td class="ps-3 text-uppercase text-dark text-start">Grand Totals Summary</td>
                  <td class="font-monospace text-secondary">${grandTotalMeanBaTree.toFixed(8)}</td>
                  <td class="font-monospace text-secondary">${grandTotalMeanSbaTree.toFixed(8)}</td>
                  <td class="font-monospace text-secondary">${grandTotalMeanBaSap.toFixed(8)}</td>
                  <td class="font-monospace text-secondary">${grandTotalMeanSbaSap.toFixed(8)}</td>
                  <td class="font-monospace text-secondary">${grandTotalMeanBaWild.toFixed(8)}</td>
                  <td class="font-monospace text-secondary">${grandTotalMeanSbaWild.toFixed(8)}</td>
                  <td class="font-monospace text-secondary border-start">${globalSumAllMeanBa.toFixed(8)}</td>
                  <td class="font-monospace text-secondary">${globalSumAllMeanSba.toFixed(8)}</td>
              </tr>
              </tbody>
          </table>
      </div>
    `;

    tableWrapper.innerHTML = innerHTMLMarkup;
    meanWorkspace.appendChild(tableWrapper);

    document.getElementById("widgetGlobalMeanBa").textContent =
      globalSumAllMeanBa.toFixed(8);
    document.getElementById("widgetGlobalMeanSba").textContent =
      globalSumAllMeanSba.toFixed(8);
  } catch (err) {
    console.error("Mean Value Fault:", err);
  }
}

// ==========================================================================
// PROJECT COMPONENT 5: PLANT DENSITY ANALYSIS ENGINE (plant_density.html)
// ==========================================================================
async function generatePlantDensityReport() {
  const densityWorkspace = document.getElementById("densityWorkspace");
  if (!densityWorkspace) return;

  try {
    const [treeFetch, regenFetch] = await Promise.all([
      _supabase
        .from("mangrove_trees")
        .select(
          "mangrove_species_catalog(botanical_name, common_name), mangrove_stems(id)",
        ),
      _supabase
        .from("mangrove_regeneration")
        .select(
          "type, total_count, mangrove_species_catalog(botanical_name, common_name)",
        ),
    ]);

    if (treeFetch.error) throw treeFetch.error;
    if (regenFetch.error) throw regenFetch.error;

    let masterDensityMatrix = {};

    const parseName = (catalog) => {
      if (!catalog) return "Unassigned Species";
      return catalog.common_name && catalog.common_name !== "Unclassified"
        ? `${catalog.botanical_name} (${catalog.common_name})`
        : catalog.botanical_name;
    };

    const createMatrixRowTemplate = (speciesLabel) => ({
      species: speciesLabel,
      treeRawCount: 0,
      saplingRawCount: 0,
      wildingRawCount: 0,
    });

    treeFetch.data.forEach((tree) => {
      const resolvedName = parseName(tree.mangrove_species_catalog);
      if (!masterDensityMatrix[resolvedName]) {
        masterDensityMatrix[resolvedName] =
          createMatrixRowTemplate(resolvedName);
      }
      if (tree.mangrove_stems) {
        masterDensityMatrix[resolvedName].treeRawCount +=
          tree.mangrove_stems.length;
      }
    });

    regenFetch.data.forEach((regen) => {
      const resolvedName = parseName(regen.mangrove_species_catalog);
      if (!masterDensityMatrix[resolvedName]) {
        masterDensityMatrix[resolvedName] =
          createMatrixRowTemplate(resolvedName);
      }
      if (regen.type === "Sapling") {
        masterDensityMatrix[resolvedName].saplingRawCount += parseInt(
          regen.total_count || 0,
        );
      } else if (regen.type === "Wilding") {
        masterDensityMatrix[resolvedName].wildingRawCount += parseInt(
          regen.total_count || 0,
        );
      }
    });

    densityWorkspace.innerHTML = "";
    const sortedSpeciesKeys = Object.keys(masterDensityMatrix).sort();

    if (sortedSpeciesKeys.length === 0) {
      densityWorkspace.innerHTML = `<div class="table-container text-center text-muted py-5 shadow-sm">No survey records calculated inside cloud registers.</div>`;
      return;
    }

    let grandTotalCountTree = 0,
      grandTotalPphTree = 0;
    let grandTotalCountSap = 0,
      grandTotalPphSap = 0;
    let grandTotalCountWild = 0,
      grandTotalPphWild = 0;
    let globalSumAllCounts = 0,
      globalSumAllPph = 0;

    let tableWrapper = document.createElement("div");
    tableWrapper.className = "table-container mb-4 shadow-sm pb-1";

    let innerHTMLMarkup = `
      <div class="d-flex justify-content-between align-items-center mb-3 px-2">
          <h5 class="m-0 fw-bold text-dark"><i class="fa-solid fa-table-cells me-2 text-success"></i>Consolidated Density Census Matrix</h5>
          <span class="badge bg-dark px-2 py-1">Normalization Base Factor: /8</span>
      </div>
      <div class="table-responsive">
          <table class="table table-borderless align-middle m-0 text-center">
              <thead class="table-light text-uppercase small text-secondary">
                  <tr class="border-bottom">
                      <th class="ps-3 text-start" style="min-width: 240px;">Species Botanical Name</th>
                      <th class="text-primary" style="width: 100px;">Count<br><small>(Tree)</small></th>
                      <th class="text-primary" style="width: 110px;">PPH<br><small>(Tree)</small></th>
                      <th class="text-info" style="width: 100px;">Count<br><small>(Sapling)</small></th>
                      <th class="text-info" style="width: 110px;">PPH<br><small>(Sapling)</small></th>
                      <th class="text-warning" style="width: 100px;">Count<br><small>(Wilding)</small></th>
                      <th class="text-warning" style="width: 110px;">PPH<br><small>(Wilding)</small></th>
                      <th class="text-success border-start" style="width: 120px;">Row Sum<br><small>Count</small></th>
                      <th class="text-dark" style="width: 120px;">Row Sum<br><small>PPH</small></th>
                  </tr>
              </thead>
              <tbody>
    `;

    sortedSpeciesKeys.forEach((speciesName) => {
      const rowData = masterDensityMatrix[speciesName];

      const cTree = rowData.treeRawCount / 8;
      const pphTree = cTree * 100;

      const cSap = rowData.saplingRawCount / 8;
      const pphSap = cSap * 100;

      const cWild = rowData.wildingRawBa || rowData.wildingRawCount / 8;
      const pphWild = cWild * 100;

      const rowSumCount = cTree + cSap + cWild;
      const rowSumPph = pphTree + pphSap + pphWild;

      grandTotalCountTree += cTree;
      grandTotalPphTree += pphTree;
      grandTotalCountSap += cSap;
      grandTotalPphSap += pphSap;
      grandTotalCountWild += cWild;
      grandTotalPphWild += pphWild;
      globalSumAllCounts += rowSumCount;
      globalSumAllPph += rowSumPph;

      // FIXED: Converted row text parameters into flat plain styling vectors
      innerHTMLMarkup += `
        <tr class="border-bottom-subtle">
          <td class="ps-3 fw-bold text-dark text-start text-uppercase">${rowData.species}</td>
          <td class="font-monospace text-secondary fw-semibold">${cTree.toFixed(2)}</td>
          <td class="font-monospace text-secondary fw-semibold">${pphTree.toFixed(2)}</td>
          <td class="font-monospace text-secondary fw-semibold">${cSap.toFixed(2)}</td>
          <td class="font-monospace text-secondary fw-semibold">${pphSap.toFixed(2)}</td>
          <td class="font-monospace text-secondary fw-semibold">${cWild.toFixed(2)}</td>
          <td class="font-monospace text-secondary fw-semibold">${pphWild.toFixed(2)}</td>
          <td class="font-monospace text-secondary fw-semibold border-start">${rowSumCount.toFixed(2)}</td>
          <td class="font-monospace text-secondary fw-semibold">${rowSumPph.toFixed(2)}</td>
        </tr>
      `;
    });

    // FIXED: Stripped layout coloration modifiers out of density calculation totals footer row
    innerHTMLMarkup += `
              <tr class="fw-bold text-dark border-top border-dark border-2">
                  <td class="ps-3 text-uppercase text-dark text-start">Grand Totals Summary</td>
                  <td class="font-monospace text-secondary">${grandTotalCountTree.toFixed(2)}</td>
                  <td class="font-monospace text-secondary">${grandTotalPphTree.toFixed(2)}</td>
                  <td class="font-monospace text-secondary">${grandTotalCountSap.toFixed(2)}</td>
                  <td class="font-monospace text-secondary">${grandTotalPphSap.toFixed(2)}</td>
                  <td class="font-monospace text-secondary">${grandTotalCountWild.toFixed(2)}</td>
                  <td class="font-monospace text-secondary">${grandTotalPphWild.toFixed(2)}</td>
                  <td class="font-monospace text-secondary border-start">${globalSumAllCounts.toFixed(2)}</td>
                  <td class="font-monospace text-secondary">${globalSumAllPph.toFixed(2)}</td>
              </tr>
              </tbody>
          </table>
      </div>
    `;

    tableWrapper.innerHTML = innerHTMLMarkup;
    densityWorkspace.appendChild(tableWrapper);

    document.getElementById("widgetGlobalTotalCount").textContent =
      globalSumAllCounts.toFixed(2);
    document.getElementById("widgetGlobalTotalPph").textContent =
      globalSumAllPph.toFixed(2);
  } catch (err) {
    console.error("Density Matrix Fault:", err);
  }
}

// ==========================================================================
// PROJECT COMPONENT 6: SPECIES FREQUENCY ANALYSIS ENGINE (frequency.html)
// ==========================================================================
async function generateFrequencyReport() {
  const frequencyTableBody = document.getElementById("frequencyTableBody");
  if (!frequencyTableBody) return;

  try {
    // Fetch all records using relational joins to identify active plot links
    const [treeFetch, regenFetch] = await Promise.all([
      _supabase
        .from("mangrove_trees")
        .select(
          "transect_number, plot_number, mangrove_species_catalog(botanical_name, common_name)",
        ),
      _supabase
        .from("mangrove_regeneration")
        .select(
          "transect_number, plot_number, mangrove_species_catalog(botanical_name, common_name)",
        ),
    ]);

    if (treeFetch.error) throw treeFetch.error;
    if (regenFetch.error) throw regenFetch.error;

    // Sets to determine the absolute count of unique plots in the entire database ecosystem
    let totalUniquePlotsSet = new Set();

    // Dictionary to track unique plots *per species*
    let speciesOccurrencesMap = {};

    const parseName = (catalog) => {
      if (!catalog) return "Unassigned Species";
      return catalog.common_name && catalog.common_name !== "Unclassified"
        ? `${catalog.botanical_name} (${catalog.common_name})`
        : catalog.botanical_name;
    };

    // 1. Scan Tree logs to map plot occurrences
    treeFetch.data.forEach((tree) => {
      const tNum = tree.transect_number || 1;
      const pNum = tree.plot_number || 1;
      const plotKey = `T${tNum}-P${pNum}`;

      totalUniquePlotsSet.add(plotKey);

      const resolvedName = parseName(tree.mangrove_species_catalog);
      if (!speciesOccurrencesMap[resolvedName]) {
        speciesOccurrencesMap[resolvedName] = new Set();
      }
      speciesOccurrencesMap[resolvedName].add(plotKey);
    });

    // 2. Scan Regeneration logs to map plot occurrences
    regenFetch.data.forEach((regen) => {
      const tNum = regen.transect_number || 1;
      const pNum = regen.plot_number || 1;
      const plotKey = `T${tNum}-P${pNum}`;

      totalUniquePlotsSet.add(plotKey);

      const resolvedName = parseName(regen.mangrove_species_catalog);
      if (!speciesOccurrencesMap[resolvedName]) {
        speciesOccurrencesMap[resolvedName] = new Set();
      }
      speciesOccurrencesMap[resolvedName].add(plotKey);
    });

    frequencyTableBody.innerHTML = "";
    const sortedSpeciesKeys = Object.keys(speciesOccurrencesMap).sort();
    const totalPlotsCount = totalUniquePlotsSet.size;

    document.getElementById("widgetTotalUniquePlots").textContent =
      totalPlotsCount;

    if (sortedSpeciesKeys.length === 0 || totalPlotsCount === 0) {
      frequencyTableBody.innerHTML = `<tr><td colspan="3" class="text-center text-muted py-4">No data samples logged inside the cloud ledger to evaluate frequencies.</td></tr>`;
      document.getElementById("widgetAverageFrequency").textContent = "0.00%";
      return;
    }

    // Dynamic running counter variable to sum individual frequency percentages
    let accumulatedFrequencySum = 0;

    // 3. Process frequencies and populate row elements
    sortedSpeciesKeys.forEach((speciesName) => {
      const occurrencesCount = speciesOccurrencesMap[speciesName].size;
      const frequencyValue = (occurrencesCount / totalPlotsCount) * 100;

      accumulatedFrequencySum += frequencyValue;

      const row = document.createElement("tr");
      row.className = "border-bottom-subtle";
      row.innerHTML = `
        <td class="ps-3 fw-bold text-dark text-start text-uppercase">${speciesName}</td>
        <td class="font-monospace text-secondary fw-semibold">${occurrencesCount}</td>
        <td class="font-monospace text-secondary fw-semibold">${frequencyValue.toFixed(2)}%</td>
      `;
      frequencyTableBody.appendChild(row);
    });

    const averageFrequency = accumulatedFrequencySum / sortedSpeciesKeys.length;
    document.getElementById("widgetAverageFrequency").textContent =
      `${averageFrequency.toFixed(2)}%`;

    // FIXED: Summary cell now accurately represents the count of unique plots evaluated total
    const totalSummaryRow = document.createElement("tr");
    totalSummaryRow.className =
      "fw-bold text-dark border-top border-dark border-2";
    totalSummaryRow.innerHTML = `
      <td class="ps-3 text-uppercase text-dark text-start">Grand Totals Summary</td>
      <td class="font-monospace text-secondary">${totalPlotsCount}</td>
      <td class="font-monospace text-secondary">${accumulatedFrequencySum.toFixed(2)}%</td>
    `;
    frequencyTableBody.appendChild(totalSummaryRow);
  } catch (err) {
    console.error("Frequency Analysis Engine initialization fault:", err);
  }
}

// ==========================================================================
// PROJECT COMPONENT 7: IMPORTANCE VALUE INDEX ENGINE (importance_value.html)
// ==========================================================================
async function generateImportanceValueReport() {
  const iviTableBody = document.getElementById("iviTableBody");
  if (!iviTableBody) return;

  try {
    // 1. Fetch all raw datasets from Supabase tables simultaneously
    const [treeFetch, regenFetch] = await Promise.all([
      _supabase
        .from("mangrove_trees")
        .select(
          "transect_number, plot_number, mangrove_species_catalog(botanical_name, common_name), mangrove_stems(id, basal_area)",
        ),
      _supabase
        .from("mangrove_regeneration")
        .select(
          "type, transect_number, plot_number, total_count, basal_area, mangrove_species_catalog(botanical_name, common_name)",
        ),
    ]);

    if (treeFetch.error) throw treeFetch.error;
    if (regenFetch.error) throw regenFetch.error;

    let masterSpecsMap = {};
    let totalPlotsSet = new Set();

    const parseName = (catalog) => {
      if (!catalog) return "Unassigned Species";
      return catalog.common_name && catalog.common_name !== "Unclassified"
        ? `${catalog.botanical_name} (${catalog.common_name})`
        : catalog.botanical_name;
    };

    const initIviTemplate = (name) => ({
      species: name,
      rawTotalBa: 0,
      rawTotalCount: 0,
      plotsPresent: new Set(),
    });

    // 2. Process Tree data components
    treeFetch.data.forEach((tree) => {
      const tNum = tree.transect_number || 1;
      const pNum = tree.plot_number || 1;
      const plotKey = `T${tNum}-P${pNum}`;
      totalPlotsSet.add(plotKey);

      const resolvedName = parseName(tree.mangrove_species_catalog);
      if (!masterSpecsMap[resolvedName])
        masterSpecsMap[resolvedName] = initIviTemplate(resolvedName);

      masterSpecsMap[resolvedName].plotsPresent.add(plotKey);

      if (tree.mangrove_stems) {
        masterSpecsMap[resolvedName].rawTotalCount +=
          tree.mangrove_stems.length;
        tree.mangrove_stems.forEach((stem) => {
          masterSpecsMap[resolvedName].rawTotalBa += parseFloat(
            stem.basal_area || 0,
          );
        });
      }
    });

    // 3. Process Regeneration data components
    regenFetch.data.forEach((regen) => {
      const tNum = regen.transect_number || 1;
      const pNum = regen.plot_number || 1;
      const plotKey = `T${tNum}-P${pNum}`;
      totalPlotsSet.add(plotKey);

      const resolvedName = parseName(regen.mangrove_species_catalog);
      if (!masterSpecsMap[resolvedName])
        masterSpecsMap[resolvedName] = initIviTemplate(resolvedName);

      masterSpecsMap[resolvedName].plotsPresent.add(plotKey);
      masterSpecsMap[resolvedName].rawTotalBa += parseFloat(
        regen.basal_area || 0,
      );
      masterSpecsMap[resolvedName].rawTotalCount += parseInt(
        regen.total_count || 0,
      );
    });

    iviTableBody.innerHTML = "";
    const sortedKeys = Object.keys(masterSpecsMap).sort();
    const totalPlotsCount = totalPlotsSet.size || 1;

    if (sortedKeys.length === 0) {
      iviTableBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">No survey samples mapped to compute index ranks.</td></tr>`;
      return;
    }

    // Dynamic running columns totals summary counters
    let sumRDom = 0,
      sumRelFreq = 0,
      sumRelDen = 0,
      sumIvi = 0;
    let highestIviValue = 0;
    let dominantSpeciesLabel = "None Located";

    // 4. Loop over species keys, compute specific column equations and draw records
    sortedKeys.forEach((key) => {
      const item = masterSpecsMap[key];

      // Calculate Row Sum Mean BA (Total Basal Area for the species / 8)
      const rowSumMeanBa = item.rawTotalBa / 8;

      // Calculate Row Sum PPH (Total Calculated Count * 100)
      const rowSumCalculatedCount = item.rawTotalCount / 8;
      const rowSumPph = rowSumCalculatedCount * 100;

      // Calculate Frequency Value %
      const frequencyValue = (item.plotsPresent.size / totalPlotsCount) * 100;

      // UPDATED FORMULA: R. Dom now uses rowSumMeanBa directly as requested
      const rDom = (rowSumMeanBa / 3565.59445814641) * 100;
      const relFreq = (frequencyValue / 262.5) * 100;
      const relDen = (rowSumPph / 2428.64583333333) * 100;
      const ivi = rDom + relFreq + relDen;

      // Track highest index for dashboard widget configurations
      if (ivi > highestIviValue) {
        highestIviValue = ivi;
        dominantSpeciesLabel = key;
      }

      // Add values to running vertical summaries matrix accumulators
      sumRDom += rDom;
      sumRelFreq += relFreq;
      sumRelDen += relDen;
      sumIvi += ivi;

      const row = document.createElement("tr");
      row.className = "border-bottom-subtle";
      row.innerHTML = `
        <td class="ps-3 fw-bold text-dark text-start text-uppercase">${key}</td>
        <td class="font-monospace text-secondary fw-semibold">${rDom.toFixed(4)}%</td>
        <td class="font-monospace text-secondary fw-semibold">${relFreq.toFixed(4)}%</td>
        <td class="font-monospace text-secondary fw-semibold">${relDen.toFixed(4)}%</td>
        <td class="font-monospace text-dark fw-bold fs-5">${ivi.toFixed(4)}</td>
      `;
      iviTableBody.appendChild(row);
    });

    // 5. Append clean vertical Grand Totals footer row summary metrics lines
    const summaryRow = document.createElement("tr");
    summaryRow.className = "fw-bold text-dark border-top border-dark border-2";
    summaryRow.innerHTML = `
      <td class="ps-3 text-uppercase text-dark text-start">Grand Totals Summary</td>
      <td class="font-monospace text-secondary">${sumRDom.toFixed(4)}%</td>
      <td class="font-monospace text-secondary">${sumRelFreq.toFixed(4)}%</td>
      <td class="font-monospace text-secondary">${sumRelDen.toFixed(4)}%</td>
      <td class="font-monospace text-dark fs-5">${sumIvi.toFixed(4)}</td>
    `;
    iviTableBody.appendChild(summaryRow);

    // Update the dashboard widget scoreboard items live
    document.getElementById("widgetMaxIviScore").textContent =
      highestIviValue.toFixed(2);
    document.getElementById("widgetDominantTaxa").textContent =
      dominantSpeciesLabel;
  } catch (err) {
    console.error("IVI Engine runtime exception fault:", err);
  }
}

// ==========================================================================
// PROJECT COMPONENT 8: SHANNON DIVERSITY INDEX ENGINE (diversity_index.html)
// ==========================================================================
async function generateDiversityIndexReport() {
  const diversityTableBody = document.getElementById("diversityTableBody");
  if (!diversityTableBody) return;

  try {
    // 1. Fetch all raw datasets from Supabase tables simultaneously
    const [treeFetch, regenFetch] = await Promise.all([
      _supabase
        .from("mangrove_trees")
        .select(
          "mangrove_species_catalog(botanical_name, common_name), mangrove_stems(id)",
        ),
      _supabase
        .from("mangrove_regeneration")
        .select(
          "type, total_count, mangrove_species_catalog(botanical_name, common_name)",
        ),
    ]);

    if (treeFetch.error) throw treeFetch.error;
    if (regenFetch.error) throw regenFetch.error;

    let speciesCountMap = {};

    const parseName = (catalog) => {
      if (!catalog) return "Unassigned Species";
      return catalog.common_name && catalog.common_name !== "Unclassified"
        ? `${catalog.botanical_name} (${catalog.common_name})`
        : catalog.botanical_name;
    };

    // 2. Accumulate tree individual counts globally
    treeFetch.data.forEach((tree) => {
      const resolvedName = parseName(tree.mangrove_species_catalog);
      if (!speciesCountMap[resolvedName]) speciesCountMap[resolvedName] = 0;
      if (tree.mangrove_stems) {
        speciesCountMap[resolvedName] += tree.mangrove_stems.length;
      }
    });

    // 3. Accumulate regeneration stock counts globally
    regenFetch.data.forEach((regen) => {
      const resolvedName = parseName(regen.mangrove_species_catalog);
      if (!speciesCountMap[resolvedName]) speciesCountMap[resolvedName] = 0;
      speciesCountMap[resolvedName] += parseInt(regen.total_count || 0);
    });

    diversityTableBody.innerHTML = "";
    const sortedKeys = Object.keys(speciesCountMap).sort();

    if (sortedKeys.length === 0) {
      diversityTableBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">No survey samples mapped to compute diversity index ranks.</td></tr>`;
      return;
    }

    // Dynamic running columns totals summary counters
    let sumPph = 0,
      sumPi = 0,
      sumLnPi = 0,
      sumHPrime = 0;
    let totalUniqueTaxa = sortedKeys.length;

    // 4. Loop over species keys, compute specific row parameters
    sortedKeys.forEach((key) => {
      const totalRawCount = speciesCountMap[key];

      // Calculate Row Sum PPH (Total Calculated Count / 8 * 100)
      const calculatedCount = totalRawCount / 8;
      const pph = calculatedCount * 100;

      // REQUESTED FORMULAS MATRIX:
      const pi = pph / 2428.64583333333;

      // Prevent Math runtime errors if pi is exactly 0
      const lnPi = pi > 0 ? Math.log(pi) : 0;
      const hPrime = pi * lnPi;

      // Add values to running vertical summaries accumulators
      sumPph += pph;
      sumPi += pi;
      sumLnPi += lnPi;
      sumHPrime += hPrime;

      const row = document.createElement("tr");
      row.className = "border-bottom-subtle";
      row.innerHTML = `
        <td class="ps-3 fw-bold text-dark text-start text-uppercase">${key}</td>
        <td class="font-monospace text-secondary fw-semibold">${pph.toFixed(2)}</td>
        <td class="font-monospace text-secondary fw-semibold">${pi.toFixed(6)}</td>
        <td class="font-monospace text-secondary fw-semibold">${lnPi.toFixed(6)}</td>
        <td class="font-monospace text-secondary fw-semibold">${hPrime.toFixed(6)}</td>
      `;
      diversityTableBody.appendChild(row);
    });

    // Invert the negative H' sum into a positive integer value for overall Shannon index tracking
    const finalShannonIndexValue = Math.abs(sumHPrime);

    // 5. Append clean vertical Grand Totals footer row summary metrics
    const summaryRow = document.createElement("tr");
    summaryRow.className = "fw-bold text-dark border-top border-dark border-2";
    summaryRow.innerHTML = `
      <td class="ps-3 text-uppercase text-dark text-start">Grand Totals Summary</td>
      <td class="font-monospace text-secondary">${sumPph.toFixed(2)}</td>
      <td class="font-monospace text-secondary">${sumPi.toFixed(4)}</td>
      <td class="font-monospace text-secondary">—</td>
      <td class="font-monospace text-dark fs-5">${sumHPrime.toFixed(6)}</td>
    `;
    diversityTableBody.appendChild(summaryRow);

    // Update the dashboard widgets scoreboard live
    document.getElementById("widgetShannonIndex").textContent =
      finalShannonIndexValue.toFixed(4);
    document.getElementById("widgetTaxaRichness").textContent = totalUniqueTaxa;
  } catch (err) {
    console.error("Diversity Index Engine fault exception trace:", err);
    diversityTableBody.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-4 fw-bold"><i class="fa-solid fa-triangle-exclamation me-2"></i>Error generating biodiversity index.</td></tr>`;
  }
}

// ==========================================================================
// PROJECT COMPONENT 9: CARBON STOCK ESTIMATION ENGINE (carbon.html)
// ==========================================================================
async function generateCarbonStockReport() {
  const carbonWorkspace = document.getElementById("carbonWorkspace");
  if (!carbonWorkspace) return;

  try {
    const { data, error } = await _supabase
      .from("mangrove_trees")
      .select(
        "transect_number, plot_number, mangrove_species_catalog(botanical_name, common_name), mangrove_stems(gbh)",
      );

    if (error) throw error;

    let structuredPlotsMap = {};

    const parseName = (catalog) => {
      if (!catalog) return "Unassigned Species";
      return catalog.common_name && catalog.common_name !== "Unclassified"
        ? `${catalog.botanical_name} (${catalog.common_name})`
        : catalog.botanical_name;
    };

    data.forEach((tree) => {
      const tNum = tree.transect_number || 1;
      const pNum = tree.plot_number || 1;
      const locKey = `Transect ${tNum} — Plot ${pNum}`;
      const resolvedName = parseName(tree.mangrove_species_catalog);

      if (!structuredPlotsMap[locKey]) structuredPlotsMap[locKey] = {};
      if (!structuredPlotsMap[locKey][resolvedName]) {
        structuredPlotsMap[locKey][resolvedName] = {
          species: resolvedName,
          stemsGbhArray: [],
        };
      }

      if (tree.mangrove_stems) {
        tree.mangrove_stems.forEach((stem) => {
          if (stem.gbh) {
            structuredPlotsMap[locKey][resolvedName].stemsGbhArray.push(
              parseFloat(stem.gbh),
            );
          }
        });
      }
    });

    carbonWorkspace.innerHTML = "";
    const sortedLocations = Object.keys(structuredPlotsMap).sort((a, b) => {
      return a.localeCompare(b, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });

    if (sortedLocations.length === 0) {
      carbonWorkspace.innerHTML = `<div class="table-container text-center text-muted py-5">No tree stems mapped in cloud registers to compute biomass pools.</div>`;
      return;
    }

    let dynamicGlobalTotalCarbon = 0;

    sortedLocations.forEach((locationTitle) => {
      const plotDataRows = structuredPlotsMap[locationTitle];
      const sortedSpeciesKeys = Object.keys(plotDataRows).sort();

      let plotSumTotalC = 0;

      const tableWrapper = document.createElement("div");
      tableWrapper.className = "table-container mb-5 shadow-sm pb-1";

      let innerHTMLMarkup = `
        <div class="d-flex justify-content-between align-items-center mb-3 px-2">
            <h5 class="m-0 fw-bold text-success"><i class="fa-solid fa-leaf me-2 text-dark"></i>${locationTitle} Biomass Ledger</h5>
            <span class="badge bg-dark px-2 py-1 small">Carbon Pool Estimation</span>
        </div>
        <div class="table-responsive">
            <table class="table table-borderless align-middle m-0 text-center small">
                <thead class="table-light text-uppercase small text-secondary">
                    <tr class="border-bottom">
                        <th class="ps-3 text-start" style="min-width: 160px;">Species Botanical Name</th>
                        <th class="text-primary" style="width: 80px;">GBH<br><small>(cm)</small></th>
                        <th class="text-primary" style="width: 80px;">DBH<br><small>(cm)</small></th>
                        <th class="text-primary" style="width: 90px;">AGB<br><small>(kg)</small></th>
                        <th class="text-primary" style="width: 100px;">AGB<br><small>(t/ha)</small></th>
                        <th class="text-info" style="width: 90px;">BGB<br><small>(kg)</small></th>
                        <th class="text-info" style="width: 100px;">BGB<br><small>(t/ha)</small></th>
                        <th class="text-warning" style="width: 100px;">C-AGB<br><small>(tC/ha)</small></th>
                        <th class="text-warning" style="width: 100px;">C-BGB<br><small>(tC/ha)</small></th>
                        <th class="text-success border-start" style="width: 110px;">Total C<br><small>(tC/ha)</small></th>
                    </tr>
                </thead>
                <tbody>
      `;

      sortedSpeciesKeys.forEach((speciesName) => {
        const item = plotDataRows[speciesName];

        item.stemsGbhArray.forEach((gbhValue) => {
          const dbh = gbhValue / Math.PI;
          const agbKg = 0.251 * 0.751 * Math.pow(dbh, 2.46);
          const bgbKg = 0.1998 * Math.pow(0.752, 0.899) * Math.pow(dbh, 2.22);

          const agbTha = ((agbKg / 100) * 10000) / 1000;
          const bgbTha = ((bgbKg / 100) * 10000) / 1000;

          const cAgb = agbTha * 0.47;
          const cBgb = bgbTha * 0.38;
          const totalC = cAgb + cBgb;

          plotSumTotalC += totalC;
          dynamicGlobalTotalCarbon += totalC;

          innerHTMLMarkup += `
            <tr class="border-bottom-subtle">
              <td class="ps-3 fw-bold text-dark text-start text-uppercase">${speciesName}</td>
              <td class="font-monospace text-secondary fw-semibold">${gbhValue.toFixed(2)}</td>
              <td class="font-monospace text-secondary fw-semibold">${dbh.toFixed(2)}</td>
              <td class="font-monospace text-secondary fw-semibold">${agbKg.toFixed(2)}</td>
              <td class="font-monospace text-secondary fw-semibold fw-bold text-dark">${agbTha.toFixed(4)}</td>
              <td class="font-monospace text-secondary fw-semibold">${bgbKg.toFixed(2)}</td>
              <td class="font-monospace text-secondary fw-semibold fw-bold text-dark">${bgbTha.toFixed(4)}</td>
              <td class="font-monospace text-secondary fw-semibold">${cAgb.toFixed(4)}</td>
              <td class="font-monospace text-secondary fw-semibold">${cBgb.toFixed(4)}</td>
              <td class="font-monospace text-secondary fw-semibold border-start fw-bold">${totalC.toFixed(4)}</td>
            </tr>
          `;
        });
      });

      innerHTMLMarkup += `
                <tr class="fw-bold text-dark border-top border-dark border-2">
                    <td colspan="9" class="ps-3 text-uppercase text-dark text-start">Plot Sequestration Total Summary</td>
                    <td class="font-monospace text-secondary border-start fs-6">${plotSumTotalC.toFixed(4)}</td>
                </tr>
                </tbody>
            </table>
        </div>
      `;

      tableWrapper.innerHTML = innerHTMLMarkup;
      carbonWorkspace.appendChild(tableWrapper);
    });

    const globalWidget = document.getElementById("widgetGlobalCarbonSum");
    if (globalWidget) {
      globalWidget.textContent = dynamicGlobalTotalCarbon.toFixed(4);
    }
  } catch (err) {
    console.error("Carbon Engine failure:", err);
  }
}

// ==========================================================================
// PROJECT COMPONENT 10: CLIENT-SIDE EXPORT UTILITIES (EXCEL)
// ==========================================================================
function exportCarbonToExcel() {
  try {
    if (typeof XLSX === "undefined") {
      alert(
        "Spreadsheet library is still buffering. Please wait 3 seconds and try again.",
      );
      return;
    }

    const workspace = document.getElementById("carbonWorkspace");
    const tables = workspace.getElementsByTagName("table");

    if (tables.length === 0) {
      alert("No data grids found to parse into Excel.");
      return;
    }

    const workbook = XLSX.utils.book_new();

    for (let i = 0; i < tables.length; i++) {
      const tableElement = tables[i];
      let sheetName = `Plot ${i + 1}`;
      const parentContainer = tableElement.closest(".table-container");

      if (parentContainer) {
        const headerText = parentContainer.querySelector("h5")?.innerText || "";
        if (headerText) {
          sheetName = headerText
            .replace(/Biomass Ledger/gi, "")
            .trim()
            .substring(0, 31);
        }
      }

      const worksheet = XLSX.utils.table_to_sheet(tableElement, { raw: true });
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    }

    XLSX.writeFile(
      workbook,
      `Carbon_Stock_Report_${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  } catch (error) {
    console.error("Excel Export Error:", error);
  }
}

// ==========================================================================
// PROJECT COMPONENT 11: DIVERSITY INDEX EXCEL EXPORT UTILITY
// ==========================================================================
function exportDiversityToExcel() {
  try {
    if (typeof XLSX === "undefined") {
      alert(
        "Spreadsheet library is initializing. Please wait 3 seconds and try again.",
      );
      return;
    }

    const tableElement = document
      .querySelector("#diversityTableBody")
      .closest("table");

    if (!tableElement) {
      alert("No data grid found to parse into Excel.");
      return;
    }

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.table_to_sheet(tableElement, { raw: true });

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      "Diversity Index Synthesis",
    );
    XLSX.writeFile(
      workbook,
      `Shannon_Diversity_Index_Report_${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  } catch (error) {
    console.error("Excel Export Error:", error);
    alert("An error occurred while compiling your spreadsheet.");
  }
}
// ==========================================================================
// CENTRALIZED SPECIES CATALOG LOGIC SEED ENGINE
// ==========================================================================
/**
 * Dynamically populates any HTML select dropdown item with rows from the Supabase catalog
 * @param {string} selectElementId - The DOM ID of the target <select> element
 */
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

      option.value = item.id; // FIXED: Underlying value is now the numeric database ID
      option.textContent = fullLabel; // The visible text remains the text name string
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

    const currentPath =
      window.location.pathname.split("/").pop() || "tree.html";
    const matchingLink = sidebarContainer.querySelector(
      `[data-page="${currentPath}"]`,
    );

    if (matchingLink) {
      matchingLink.classList.add("active");
    }
  } catch (err) {
    console.error(
      "CRITICAL FRAMEWORK BREAKDOWN: Unable to fetch sidebar template component:",
      err,
    );
  }
}

document.addEventListener("DOMContentLoaded", injectGlobalSidebar);

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
