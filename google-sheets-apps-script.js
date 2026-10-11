/**
 * ============================================================================
 * KiloFare - Google Apps Script for Saving Trips to Google Sheets
 * ============================================================================
 * 
 * IMPORTANT:
 * DO NOT click "▷ Run" on "doPost" in the toolbar!
 * "doPost" is an HTTP Web Hook that runs automatically when KiloFare saves a trip.
 * 
 * HOW TO DEPLOY:
 * 1. Open Google Sheets (https://sheets.new)
 * 2. Click "Extensions" -> "Apps Script" (so the script is linked to your Sheet)
 * 3. Paste this entire code into the editor
 * 4. (Optional) Select "testRun" from the function dropdown and click "▷ Run" to authorize permissions
 * 5. Click the blue "Deploy" button (top right) -> "New deployment"
 * 6. Click the gear icon (⚙️) next to "Select type" and select "Web app"
 * 7. Set Description: "KiloFare Saver"
 * 8. Set "Execute as": "Me"
 * 9. Set "Who has access": "Anyone"  <--- CRITICAL! Must be "Anyone"
 * 10. Click "Deploy", authorize access, and copy the Web App URL (ends with /exec)
 * 11. Paste that URL into KiloFare's "Sheet URL" settings box!
 */

function doPost(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "error",
        message: "No active spreadsheet linked. Make sure you opened Apps Script via Extensions -> Apps Script inside your Google Sheet."
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    var sheet = ss.getActiveSheet();
    
    // Create header row if sheet is empty
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        "Timestamp",
        "Date",
        "Time",
        "Starting Location",
        "Ending Location",
        "Distance (km)",
        "Rate (₹/km)",
        "Total Fare (₹)",
        "Trip Duration",
        "Tracking Mode"
      ]);
      
      // Style header row
      var headerRange = sheet.getRange(1, 1, 1, 10);
      headerRange.setBackground("#08783F");
      headerRange.setFontColor("#FFFFFF");
      headerRange.setFontWeight("bold");
      sheet.setFrozenRows(1);
    }
    
    // Parse incoming payload safely (supports both POST JSON and test runs)
    var data = {};
    if (e && e.postData && e.postData.contents) {
      try {
        data = JSON.parse(e.postData.contents);
      } catch (jsonErr) {
        data = e.parameter || {};
      }
    } else if (e && e.parameter) {
      data = e.parameter;
    }
    
    var timestamp = new Date();
    var date = data.date || Utilities.formatDate(timestamp, "Asia/Kolkata", "dd/MM/yyyy");
    var time = data.time || Utilities.formatDate(timestamp, "Asia/Kolkata", "hh:mm:ss a");
    var startLocation = data.startLocation || "Auto Start Point";
    var endLocation = data.endLocation || "Auto Stop Point";
    var distance = data.distance || "0.00 km";
    var rate = data.rate || "₹20.00/km";
    var amount = data.amount || "₹0.00";
    var duration = data.duration || "00:00:00";
    var trackingMode = data.trackingMode || "Manual";
    
    // Append the row to Google Sheets
    sheet.appendRow([
      timestamp,
      date,
      time,
      startLocation,
      endLocation,
      distance,
      rate,
      amount,
      duration,
      trackingMode
    ]);
    
    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "Trip saved successfully!"
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Health check endpoint - allows testing the Web App URL in browser
 */
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "active",
    message: "KiloFare Google Apps Script Web App is connected and running!"
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * TEST FUNCTION: Select "testRun" from the function dropdown next to "Run"
 * and click "▷ Run" to test and authorize permissions inside Apps Script!
 */
function testRun() {
  var testPayload = {
    postData: {
      contents: JSON.stringify({
        date: Utilities.formatDate(new Date(), "Asia/Kolkata", "dd/MM/yyyy"),
        time: Utilities.formatDate(new Date(), "Asia/Kolkata", "hh:mm:ss a"),
        startLocation: "Karumbukkadai, Coimbatore",
        endLocation: "Gandhipuram, Coimbatore",
        distance: "4.50 km",
        rate: "₹20.00/km",
        amount: "₹90.00",
        duration: "00:12:30",
        trackingMode: "Test Run"
      })
    }
  };
  
  var response = doPost(testPayload);
  Logger.log(response.getContent());
}
