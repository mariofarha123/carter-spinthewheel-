const ENTRIES_SHEET_NAME = "Entries";
const PROMO_CODES_SHEET_NAME = "PromoCodes";
const BRANCH_NAME = "Ghazir";
const PROMO_VALIDITY_DAYS = 15;
const PROMO_SCAN_CHUNK_SIZE = 200;

const PRIZES = [
  { label: "30% Gift Voucher", winnerLimit: 6000 },
  { label: "Hard Luck", winnerLimit: 0 },
  { label: "50% Gift Voucher", winnerLimit: 10 },
  { label: "20% Gift Voucher", winnerLimit: 100 },
  { label: "Get 1 Item For Free", winnerLimit: 5 },
];

function doPost(e) {
  const lock = LockService.getScriptLock();
  let lockAcquired = false;

  try {
    const data = JSON.parse(e.postData.contents || "{}");
    const name = cleanText(data.name);
    const email = cleanEmail(data.email);
    const phone = cleanPhone(data.phone);

    if (!name || !phone) {
      return jsonResponse({
        success: false,
        message: "Missing name or phone.",
      });
    }

    const props = PropertiesService.getDocumentProperties();
    const cachedEntry = findExistingEntryFromCache(props, phone);

    if (cachedEntry) {
      return jsonResponse({
        success: true,
        alreadyPlayed: true,
        result: cachedEntry,
      });
    }

    lock.waitLock(5000);
    lockAcquired = true;

    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const entriesSheet = spreadsheet.getSheetByName(ENTRIES_SHEET_NAME);
    const promoCodesSheet = spreadsheet.getSheetByName(PROMO_CODES_SHEET_NAME);

    if (!entriesSheet || !promoCodesSheet) {
      return jsonResponse({
        success: false,
        message: "Missing Entries or PromoCodes sheet.",
      });
    }

    const existingEntry = findExistingEntryByPhone(props, entriesSheet, phone);

    if (existingEntry) {
      return jsonResponse({
        success: true,
        alreadyPlayed: true,
        result: existingEntry,
      });
    }

    ensureGameState(props, entriesSheet, promoCodesSheet);

    const prize = pickPrizeFromState(props);
    const createdAt = new Date();
    const isHardLuck = prize.label === "Hard Luck";
    const promoCodeInfo = isHardLuck
      ? null
      : findAndReservePromoCode(props, promoCodesSheet, prize.label);

    if (!isHardLuck && !promoCodeInfo) {
      setRemaining(props, prize.label, 0);

      return jsonResponse({
        success: false,
        message: `No unused promo codes left for ${prize.label}.`,
      });
    }

    const expiryDate = isHardLuck
      ? ""
      : new Date(
          createdAt.getTime() + PROMO_VALIDITY_DAYS * 24 * 60 * 60 * 1000
        );
    const promoCode = promoCodeInfo ? promoCodeInfo.code : "";
    const status = isHardLuck ? "Hard Luck" : "Unused";

    entriesSheet.appendRow([
      createdAt,
      name,
      email,
      phone,
      prize.label,
      promoCode,
      expiryDate,
      status,
      "",
      BRANCH_NAME,
    ]);

    const entryRow = entriesSheet.getLastRow();
    props.setProperty(getPhoneEntryKey(phone), String(entryRow));

    if (promoCodeInfo) {
      promoCodesSheet.getRange(promoCodeInfo.sheetRow, 3, 1, 3).setValues([
        ["Assigned", new Date(), entryRow],
      ]);
    }

    incrementWinnerCount(props, prize.label);

    return jsonResponse({
      success: true,
      alreadyPlayed: false,
      result: {
        name,
        phone,
        playerName: name,
        playerPhone: phone,
        prize: prize.label,
        promoCode,
        expiryDate: isHardLuck ? "" : expiryDate.toISOString(),
        status,
        branch: BRANCH_NAME,
      },
    });
  } catch (error) {
    return jsonResponse({
      success: false,
      message: error.toString(),
    });
  } finally {
    if (lockAcquired) {
      lock.releaseLock();
    }
  }
}

function rebuildGameState() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const entriesSheet = spreadsheet.getSheetByName(ENTRIES_SHEET_NAME);
  const promoCodesSheet = spreadsheet.getSheetByName(PROMO_CODES_SHEET_NAME);
  const props = PropertiesService.getDocumentProperties();

  if (!entriesSheet || !promoCodesSheet) {
    throw new Error("Missing Entries or PromoCodes sheet.");
  }

  const entriesRows = entriesSheet.getDataRange().getValues();
  const promoRows = promoCodesSheet.getDataRange().getValues();
  const values = {
    gameStateReady: "true",
  };

  PRIZES.forEach((prize) => {
    values[getWinnerCountKey(prize.label)] = "0";
    values[getUnusedCountKey(prize.label)] =
      prize.label === "Hard Luck" ? String(prize.winnerLimit) : "0";
    values[getPromoPointerKey(prize.label)] = "2";
  });

  for (let i = 1; i < entriesRows.length; i++) {
    const phone = cleanPhone(entriesRows[i][3]);
    const prize = cleanText(entriesRows[i][4]);
    const status = cleanText(entriesRows[i][7]);

    if (phone) {
      values[getPhoneEntryKey(phone)] = String(i + 1);
    }

    if (status !== "Duplicate" && hasPrize(prize)) {
      const key = getWinnerCountKey(prize);
      values[key] = String(Number(values[key] || 0) + 1);
    }
  }

  for (let i = 1; i < promoRows.length; i++) {
    const prize = cleanText(promoRows[i][1]);
    const status = cleanText(promoRows[i][2]);

    if (status === "Unused" && hasPrize(prize)) {
      const key = getUnusedCountKey(prize);
      values[key] = String(Number(values[key] || 0) + 1);
    }
  }

  props.setProperties(values, true);
}

function ensureGameState(props, entriesSheet, promoCodesSheet) {
  if (props.getProperty("gameStateReady") === "true") {
    return;
  }

  rebuildGameState();
}

function findExistingEntryFromCache(props, phone) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const entriesSheet = spreadsheet.getSheetByName(ENTRIES_SHEET_NAME);
  const rowNumber = Number(props.getProperty(getPhoneEntryKey(phone)) || 0);

  if (!entriesSheet || rowNumber < 2 || rowNumber > entriesSheet.getLastRow()) {
    return null;
  }

  const row = entriesSheet.getRange(rowNumber, 1, 1, 10).getValues()[0];

  if (cleanPhone(row[3]) !== phone) {
    props.deleteProperty(getPhoneEntryKey(phone));
    return null;
  }

  return formatExistingEntry(row);
}

function findExistingEntryByPhone(props, sheet, phone) {
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return null;
  }

  const phoneRange = sheet.getRange(2, 4, lastRow - 1, 1);
  const match = phoneRange
    .createTextFinder(phone)
    .matchEntireCell(true)
    .findNext();

  if (!match) {
    return null;
  }

  const rowNumber = match.getRow();
  const row = sheet.getRange(rowNumber, 1, 1, 10).getValues()[0];
  props.setProperty(getPhoneEntryKey(phone), String(rowNumber));

  return formatExistingEntry(row);
}

function formatExistingEntry(row) {
  return {
    name: row[1],
    phone: row[3],
    playerName: row[1],
    playerPhone: row[3],
    prize: row[4],
    promoCode: row[5],
    expiryDate: formatSheetDate(row[6]),
    status: row[7],
    branch: row[9],
  };
}

function pickPrizeFromState(props) {
  const availablePrizes = PRIZES.map((prize) => {
    const winnerCount = Number(props.getProperty(getWinnerCountKey(prize.label)) || 0);
    const unusedCodeCount = Number(props.getProperty(getUnusedCountKey(prize.label)) || 0);
    const remainingByLimit = prize.winnerLimit - winnerCount;
    const remaining = Math.min(remainingByLimit, unusedCodeCount);

    return {
      ...prize,
      remaining,
    };
  }).filter((prize) => prize.remaining > 0);
  const hardLuck = PRIZES.find((prize) => prize.label === "Hard Luck");

  if (availablePrizes.length === 0) {
    return hardLuck;
  }

  return availablePrizes[Math.floor(Math.random() * availablePrizes.length)];
}

function findAndReservePromoCode(props, sheet, prizeLabel) {
  const lastRow = sheet.getLastRow();
  let nextRow = Number(props.getProperty(getPromoPointerKey(prizeLabel)) || 2);

  if (nextRow < 2) {
    nextRow = 2;
  }

  while (nextRow <= lastRow) {
    const rowCount = Math.min(PROMO_SCAN_CHUNK_SIZE, lastRow - nextRow + 1);
    const rows = sheet.getRange(nextRow, 1, rowCount, 3).getValues();

    for (let i = 0; i < rows.length; i++) {
      const code = cleanText(rows[i][0]);
      const prize = cleanText(rows[i][1]);
      const status = cleanText(rows[i][2]);

      if (code && prize === prizeLabel && status === "Unused") {
        const sheetRow = nextRow + i;

        props.setProperty(getPromoPointerKey(prizeLabel), String(sheetRow + 1));
        decrementUnusedCount(props, prizeLabel);

        return {
          code,
          sheetRow,
        };
      }
    }

    nextRow += rowCount;
    props.setProperty(getPromoPointerKey(prizeLabel), String(nextRow));
  }

  props.setProperty(getPromoPointerKey(prizeLabel), String(lastRow + 1));
  setRemaining(props, prizeLabel, 0);

  return null;
}

function incrementWinnerCount(props, prizeLabel) {
  const key = getWinnerCountKey(prizeLabel);
  props.setProperty(key, String(Number(props.getProperty(key) || 0) + 1));
}

function decrementUnusedCount(props, prizeLabel) {
  const key = getUnusedCountKey(prizeLabel);
  props.setProperty(key, String(Math.max(0, Number(props.getProperty(key) || 0) - 1)));
}

function setRemaining(props, prizeLabel, remaining) {
  props.setProperty(getUnusedCountKey(prizeLabel), String(remaining));
}

function hasPrize(label) {
  return PRIZES.some((prize) => prize.label === label);
}

function getWinnerCountKey(label) {
  return `winnerCount:${label}`;
}

function getUnusedCountKey(label) {
  return `unusedCodeCount:${label}`;
}

function getPromoPointerKey(label) {
  return `promoPointer:${label}`;
}

function getPhoneEntryKey(phone) {
  return `phoneEntry:${phone}`;
}

function cleanText(value) {
  return String(value || "").trim();
}

function cleanEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function cleanPhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function formatSheetDate(value) {
  if (!value) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(
    ContentService.MimeType.JSON
  );
}
