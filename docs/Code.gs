// ============================================================
// GATE IN/OUT SYSTEM — Google Apps Script Backend
// Deploy as: Web App → Execute as: Me → Who has access: Anyone
// ============================================================

var SHEET_ID    = 'YOUR_GOOGLE_SHEET_ID_HERE';
var SHEET_ENTRY = 'Entry Log';

// Column headers — order must match the row array in addEntry()
var COLUMNS = [
  'ID',            // A  col 1
  'Date',          // B  col 2
  'Time In',       // C  col 3
  'Time Out',      // D  col 4
  'Duration',      // E  col 5
  'License Plate', // F  col 6
  'Driver Name',   // G  col 7
  'Company',       // H  col 8
  'SIM Type',      // I  col 9
  'ID Number',     // J  col 10
  'Driver Card',   // K  col 11
  'Vehicle Type',  // L  col 12
  'Destination',   // M  col 13
  'Shipment',      // N  col 14
  'Products',      // O  col 15
  'Details',       // P  col 16
  'Annotations',   // Q  col 17
  'Approver',      // R  col 18
  'Post In',       // S  col 19
  'Post Out',      // T  col 20
  'Status'         // U  col 21
];

// Status column index (1-based) — update if COLUMNS order changes
var COL_STATUS = 21;
var COL_PLATE  = 6;
var COL_ID     = 1;

// ============================================================
// CORS — wrap every response so fetch() without no-cors works
// ============================================================
function corsResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function doOptions() {
  return ContentService.createTextOutput('').setMimeType(ContentService.MimeType.TEXT);
}

// ============================================================
// POST handler
// ============================================================
function doPost(e) {
  try {
    var data   = JSON.parse(e.postData.contents);
    var result = dispatch(data.action, data);
    return corsResponse(result);
  } catch (err) {
    return corsResponse({ status: 'error', message: err.toString() });
  }
}

// ============================================================
// GET handler
// ============================================================
function doGet(e) {
  try {
    var params = { action: e.parameter.action || 'ping', plate: e.parameter.plate };
    var result = dispatch(params.action, params);
    return corsResponse(result);
  } catch (err) {
    return corsResponse({ status: 'error', message: err.toString() });
  }
}

function dispatch(action, data) {
  if (action === 'addEntry')         return addEntry(data.data);
  if (action === 'updateExit')       return updateExit(data.data);
  if (action === 'searchPlate')      return searchPlate(data.plate);
  if (action === 'getActiveEntries') return getActiveEntries();
  if (action === 'ping')             return { status: 'ok', message: 'Gate System API is running.' };
  return { status: 'error', message: 'Unknown action: ' + action };
}

// ============================================================
// ADD ENTRY — saves every field from the frontend
// ============================================================
function addEntry(entry) {
  if (!entry || !entry.plate) return { status: 'error', message: 'Missing entry data' };

  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = getOrCreateSheet(ss, SHEET_ENTRY);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(COLUMNS);
    formatHeaderRow(sheet);
  }

  // Helper: join arrays to comma-separated string
  function arr(v) { return Array.isArray(v) ? v.join(', ') : (v || ''); }

  var row = [
    entry.id             || Date.now(),
    entry.date           || '',
    entry.timeIn         || '',
    '',                           // Time Out  — filled on exit
    '',                           // Duration  — filled on exit
    entry.plate          || '',
    entry.driver         || '',
    entry.company        || '',
    entry.simtype        || '',
    entry.ktp            || '',
    entry.driverCard     || '',
    entry.vtype          || '',
    entry.dest           || '',
    arr(entry.shipment),          // Loading / Unloading
    entry.products       || '',
    entry.details        || '',
    arr(entry.annotations),       // Document issues
    entry.annotApprover  || '',
    'Post 7',
    '',                           // Post Out  — filled on exit
    'IN'
  ];

  sheet.appendRow(row);
  styleRow(sheet, sheet.getLastRow(), false);

  // Invalidate cache so Post 1 gets fresh data immediately
  invalidatePlateCache(entry.plate);

  return { status: 'ok', message: 'Entry added', id: entry.id };
}

// ============================================================
// UPDATE EXIT — bottom-up scan (most recent row first = fast)
// ============================================================
function updateExit(entry) {
  if (!entry || !entry.id) return { status: 'error', message: 'Missing exit data' };

  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = getOrCreateSheet(ss, SHEET_ENTRY);
  var data  = sheet.getDataRange().getValues();

  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][COL_ID - 1]) === String(entry.id)) {
      var row = i + 1;
      sheet.getRange(row, 4).setValue(entry.timeOut);    // D — Time Out
      sheet.getRange(row, 5).setValue(entry.duration);   // E — Duration
      sheet.getRange(row, 20).setValue('Post 1');        // T — Post Out
      sheet.getRange(row, 21).setValue('OUT');           // U — Status
      sheet.getRange(row, 1, 1, COLUMNS.length).setBackground('#e6f4ea');

      invalidatePlateCache(entry.plate || data[i][COL_PLATE - 1]);
      return { status: 'ok', message: 'Exit updated', id: entry.id };
    }
  }

  return { status: 'error', message: 'Entry ID not found: ' + entry.id };
}

// ============================================================
// SEARCH PLATE — CacheService makes repeated lookups instant
//
// Strategy:
//   1. Check script cache (TTL 10 min per plate)
//   2. On miss: read sheet bottom-up, stop at first active match
//   3. Write result to cache before returning
//   4. addEntry / updateExit invalidate cache for that plate
// ============================================================
function searchPlate(plate) {
  if (!plate) return { status: 'error', message: 'No plate provided' };

  plate = plate.toUpperCase().trim();

  var cache    = CacheService.getScriptCache();
  var cacheKey = 'plate_' + plate;
  var cached   = cache.get(cacheKey);

  if (cached) {
    return JSON.parse(cached); // Cache hit — no sheet read needed
  }

  // Cache miss — read sheet
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = getOrCreateSheet(ss, SHEET_ENTRY);
  var data  = sheet.getDataRange().getValues();

  var active     = null;
  var alreadyOut = null;

  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][COL_PLATE - 1]).toUpperCase().trim() !== plate) continue;

    var status = String(data[i][COL_STATUS - 1]).toUpperCase().trim();

    if (status === 'IN') {
      active = {
        id:             data[i][0],
        date:           String(data[i][1]),
        timeIn:         data[i][2],
        fullTimeIn:     data[i][2],  // frontend stores ISO in Time In
        plate:          data[i][5],
        driver:         data[i][6],
        company:        data[i][7],
        simtype:        data[i][8],
        ktp:            data[i][9],
        driverCard:     data[i][10],
        vtype:          data[i][11],
        dest:           data[i][12],
        shipment:       data[i][13],
        products:       data[i][14],
        details:        data[i][15],
        annotations:    data[i][16],
        annotApprover:  data[i][17]
      };
      break;
    }

    if (status === 'OUT' && !alreadyOut) {
      alreadyOut = { plate: data[i][5], timeOut: data[i][3] };
    }
  }

  var result;
  if (active) {
    result = { status: 'found', record: active };
    cache.put(cacheKey, JSON.stringify(result), 600); // cache for 10 min
  } else if (alreadyOut) {
    result = { status: 'already_out', timeOut: alreadyOut.timeOut };
  } else {
    result = { status: 'not_found' };
  }

  return result;
}

// ============================================================
// GET ACTIVE ENTRIES — all vehicles currently inside
// ============================================================
function getActiveEntries() {
  var cache    = CacheService.getScriptCache();
  var cacheKey = 'active_list';
  var cached   = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);

  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = getOrCreateSheet(ss, SHEET_ENTRY);
  var data  = sheet.getDataRange().getValues();
  var list  = [];

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][COL_STATUS - 1]).toUpperCase().trim() === 'IN') {
      list.push({
        id:      data[i][0],
        date:    String(data[i][1]),
        timeIn:  data[i][2],
        plate:   data[i][5],
        driver:  data[i][6],
        company: data[i][7],
        vtype:   data[i][11],
        dest:    data[i][12]
      });
    }
  }

  var result = { status: 'ok', entries: list, count: list.length };
  cache.put(cacheKey, JSON.stringify(result), 300); // 5 min
  return result;
}

// ============================================================
// CACHE HELPERS
// ============================================================
function invalidatePlateCache(plate) {
  try {
    var cache = CacheService.getScriptCache();
    if (plate) cache.remove('plate_' + plate.toUpperCase().trim());
    cache.remove('active_list');
  } catch (e) { /* non-fatal */ }
}

// ============================================================
// SHEET HELPERS
// ============================================================
function getOrCreateSheet(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function formatHeaderRow(sheet) {
  var range = sheet.getRange(1, 1, 1, COLUMNS.length);
  range.setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff').setFontSize(11);
  sheet.setFrozenRows(1);
  var widths = [120,100,90,90,90,120,160,160,80,140,130,120,120,130,180,180,220,160,70,70,70];
  for (var i = 0; i < widths.length && i < widths.length; i++) {
    sheet.setColumnWidth(i + 1, widths[i]);
  }
}

function styleRow(sheet, rowNum, isExit) {
  var range = sheet.getRange(rowNum, 1, 1, COLUMNS.length);
  range.setBackground(rowNum % 2 === 0 ? '#f8f9fa' : '#ffffff');
  var statusCell = sheet.getRange(rowNum, COL_STATUS);
  if (isExit) {
    statusCell.setBackground('#e6f4ea').setFontColor('#1a7f4b').setFontWeight('bold');
  } else {
    statusCell.setBackground('#fff8e1').setFontColor('#b45309').setFontWeight('bold');
  }
}
