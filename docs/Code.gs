// ============================================================
// GATE IN/OUT SYSTEM — Google Apps Script Backend
// Deploy as: Web App → Execute as: Me → Who has access: Anyone
// ============================================================

// ---- CONFIGURATION ----
// Paste your Google Sheet ID here (from the URL of your sheet)
// Example: https://docs.google.com/spreadsheets/d/SHEET_ID_HERE/edit
var SHEET_ID = 'YOUR_GOOGLE_SHEET_ID_HERE';

var SHEET_ENTRY = 'Entry Log';   // Sheet tab name for all vehicle records
var SHEET_DAILY = 'Daily Summary'; // Sheet tab for daily summary

// Column order in Entry Log sheet
var COLUMNS = [
  'ID',           // A - unique entry ID
  'Date',         // B
  'Time In',      // C
  'Time Out',     // D
  'Duration',     // E
  'License Plate',// F
  'Driver Name',  // G
  'Company',      // H
  'SIM Type',     // I
  'ID Number',    // J
  'Driver Card',  // K
  'Vehicle Type', // L
  'Destination',  // M
  'Post In',      // N
  'Post Out',     // O
  'Status'        // P
];

// ============================================================
// MAIN HANDLER — receives all requests from both Post 7 & Post 1
// ============================================================
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action;
    var result;

    if (action === 'addEntry') {
      result = addEntry(data.data);
    } else if (action === 'updateExit') {
      result = updateExit(data.data);
    } else if (action === 'getActiveEntries') {
      result = getActiveEntries();
    } else if (action === 'searchPlate') {
      result = searchPlate(data.plate);
    } else if (action === 'ping') {
      result = { status: 'ok', message: 'Server is alive' };
    } else {
      result = { status: 'error', message: 'Unknown action: ' + action };
    }

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Also handle GET for ping/test
function doGet(e) {
  var action = e.parameter.action || 'ping';

  if (action === 'searchPlate') {
    var result = searchPlate(e.parameter.plate);
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'getActiveEntries') {
    var result = getActiveEntries();
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', message: 'Gate System API is running.' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// ADD ENTRY (Post 7)
// ============================================================
function addEntry(entry) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = getOrCreateSheet(ss, SHEET_ENTRY);

  // Add header row if sheet is empty
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(COLUMNS);
    formatHeaderRow(sheet);
  }

  var row = [
    entry.id,
    entry.date,
    entry.timeIn,
    '',                  // Time Out (empty until exit)
    '',                  // Duration (empty until exit)
    entry.plate,
    entry.driver,
    entry.company,
    entry.simtype || '',
    entry.ktp || '',
    entry.driverCard || '',
    entry.vtype,
    entry.dest,
    'Post 7',
    '',                  // Post Out
    'IN'                 // Status
  ];

  sheet.appendRow(row);
  formatLastRow(sheet);

  return { status: 'ok', message: 'Entry added', id: entry.id };
}

// ============================================================
// UPDATE EXIT (Post 1)
// ============================================================
function updateExit(entry) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = getOrCreateSheet(ss, SHEET_ENTRY);

  var data = sheet.getDataRange().getValues();
  var found = false;

  for (var i = 1; i < data.length; i++) {
    // Match by ID (column A, index 0)
    if (String(data[i][0]) === String(entry.id)) {
      var row = i + 1; // Sheets is 1-indexed, +1 for header
      sheet.getRange(row, 4).setValue(entry.timeOut);     // Time Out (col D)
      sheet.getRange(row, 5).setValue(entry.duration);    // Duration (col E)
      sheet.getRange(row, 15).setValue('Post 1');         // Post Out (col O)
      sheet.getRange(row, 16).setValue('OUT');            // Status (col P)

      // Highlight the row green for completed
      sheet.getRange(row, 1, 1, COLUMNS.length)
        .setBackground('#e6f4ea');

      found = true;
      break;
    }
  }

  if (!found) {
    return { status: 'error', message: 'Entry ID not found: ' + entry.id };
  }

  return { status: 'ok', message: 'Exit updated', id: entry.id };
}

// ============================================================
// SEARCH PLATE — used by Post 1 to find active entry
// ============================================================
function searchPlate(plate) {
  if (!plate) return { status: 'error', message: 'No plate provided' };

  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = getOrCreateSheet(ss, SHEET_ENTRY);
  var data = sheet.getDataRange().getValues();

  var active = null;
  var alreadyOut = null;

  for (var i = 1; i < data.length; i++) {
    var rowPlate = String(data[i][5]).toUpperCase().trim(); // col F = License Plate
    var status = String(data[i][15]).toUpperCase().trim();  // col P = Status

    if (rowPlate === plate.toUpperCase().trim()) {
      if (status === 'IN') {
        active = {
          id:         data[i][0],
          date:       data[i][1],
          timeIn:     data[i][2],
          plate:      data[i][5],
          driver:     data[i][6],
          company:    data[i][7],
          simtype:    data[i][8],
          ktp:        data[i][9],
          driverCard: data[i][10],
          vtype:      data[i][11],
          dest:       data[i][12]
        };
        break;
      } else if (status === 'OUT') {
        alreadyOut = {
          plate:   data[i][5],
          timeOut: data[i][3]
        };
      }
    }
  }

  if (active) {
    return { status: 'found', record: active };
  } else if (alreadyOut) {
    return { status: 'already_out', timeOut: alreadyOut.timeOut };
  } else {
    return { status: 'not_found' };
  }
}

// ============================================================
// GET ALL ACTIVE ENTRIES (vehicles still inside)
// ============================================================
function getActiveEntries() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = getOrCreateSheet(ss, SHEET_ENTRY);
  var data = sheet.getDataRange().getValues();
  var active = [];

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][15]).toUpperCase().trim() === 'IN') {
      active.push({
        id:      data[i][0],
        date:    data[i][1],
        timeIn:  data[i][2],
        plate:   data[i][5],
        driver:  data[i][6],
        company: data[i][7],
        vtype:   data[i][11],
        dest:    data[i][12]
      });
    }
  }

  return { status: 'ok', entries: active, count: active.length };
}

// ============================================================
// HELPER: get or create a sheet tab by name
// ============================================================
function getOrCreateSheet(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

// ============================================================
// HELPER: format the header row
// ============================================================
function formatHeaderRow(sheet) {
  var headerRange = sheet.getRange(1, 1, 1, COLUMNS.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#1a1a2e');
  headerRange.setFontColor('#ffffff');
  headerRange.setFontSize(11);
  sheet.setFrozenRows(1);

  // Set column widths
  var widths = [120, 100, 80, 80, 80, 120, 160, 160, 80, 140, 130, 120, 120, 80, 80, 70];
  for (var i = 0; i < widths.length; i++) {
    sheet.setColumnWidth(i + 1, widths[i]);
  }
}

// ============================================================
// HELPER: style the last appended row
// ============================================================
function formatLastRow(sheet) {
  var row = sheet.getLastRow();
  var range = sheet.getRange(row, 1, 1, COLUMNS.length);

  // Alternate row shading
  if (row % 2 === 0) {
    range.setBackground('#f8f9fa');
  } else {
    range.setBackground('#ffffff');
  }

  // Highlight Status cell (col P = index 16)
  sheet.getRange(row, 16).setBackground('#e6f4ea').setFontColor('#1a7f4b').setFontWeight('bold');
}
