const ENTRIES_SHEET_NAME = "Entries";
const PROMO_CODES_SHEET_NAME = "PromoCodes";
const BRANCH_NAME = "Ghazir";
const PROMO_VALIDITY_DAYS = 15;

const PRIZES = [
  { label: "30% Gift Voucher", winnerLimit: 6000 },
  { label: "Hard Luck", winnerLimit: 0 },
  { label: "50% Gift Voucher", winnerLimit: 10 },
  { label: "20% Gift Voucher", winnerLimit: 100 },
  { label: "Get 1 Item For Free", winnerLimit: 5 },
];

function doPost(e) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(10000);

    const data = JSON.parse(e.postData.contents || "{}");
    const name = cleanText(data.name);
    const email = cleanEmail(data.email);
    const phone = cleanPhone(data.phone);

    if (!name || !phone) {
      return jsonResponse({
        success: false,
        message: "Please enter a valid Lebanese mobile number starting with 03.",
      });
    }

    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const entriesSheet = spreadsheet.getSheetByName(ENTRIES_SHEET_NAME);
    const promoCodesSheet = spreadsheet.getSheetByName(PROMO_CODES_SHEET_NAME);

    if (!entriesSheet || !promoCodesSheet) {
      return jsonResponse({
        success: false,
        message: "Missing Entries or PromoCodes sheet.",
      });
    }

    const entriesRows = entriesSheet.getDataRange().getValues();
    const promoRows = promoCodesSheet.getDataRange().getValues();
    const existingEntry = findExistingEntry(entriesRows, phone);

    if (existingEntry) {
      return jsonResponse({
        success: true,
        alreadyPlayed: true,
        result: existingEntry,
      });
    }

    const prizeStats = getPrizeStats(entriesRows, promoRows);
    const prize = pickPrize(prizeStats);
    const createdAt = new Date();
    const isHardLuck = prize.label === "Hard Luck";
    const promoCodeInfo = isHardLuck
      ? null
      : findNextPromoCode(promoRows, prize.label);

    if (!isHardLuck && !promoCodeInfo) {
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

    if (promoCodeInfo) {
      const promoSheetRow = promoCodeInfo.rowIndex + 1;
      promoCodesSheet.getRange(promoSheetRow, 3, 1, 3).setValues([
        ["Assigned", new Date(), entryRow],
      ]);
    }

    return jsonResponse({
      success: true,
      alreadyPlayed: false,
      result: {
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
    lock.releaseLock();
  }
}

function findExistingEntry(rows, phone) {
  for (let i = 1; i < rows.length; i++) {
    if (cleanPhone(rows[i][3]) === phone) {
      return {
        prize: rows[i][4],
        promoCode: rows[i][5],
        expiryDate: formatSheetDate(rows[i][6]),
        status: rows[i][7],
        branch: rows[i][9],
      };
    }
  }

  return null;
}

function getPrizeStats(entriesRows, promoRows) {
  const stats = new Map(
    PRIZES.map((prize) => [
      prize.label,
      {
        ...prize,
        winnerCount: 0,
        unusedCodeCount: prize.label === "Hard Luck" ? prize.winnerLimit : 0,
      },
    ])
  );

  for (let i = 1; i < entriesRows.length; i++) {
    const prize = String(entriesRows[i][4]).trim();
    const status = String(entriesRows[i][7]).trim();
    const stat = stats.get(prize);

    if (stat && status !== "Duplicate") {
      stat.winnerCount++;
    }
  }

  for (let i = 1; i < promoRows.length; i++) {
    const prize = String(promoRows[i][1]).trim();
    const status = String(promoRows[i][2]).trim();
    const stat = stats.get(prize);

    if (stat && status === "Unused") {
      stat.unusedCodeCount++;
    }
  }

  return Array.from(stats.values()).map((stat) => {
    const remainingByLimit = stat.winnerLimit - stat.winnerCount;
    const remaining = Math.min(remainingByLimit, stat.unusedCodeCount);

    return {
      label: stat.label,
      winnerLimit: stat.winnerLimit,
      remaining,
    };
  });
}

function pickPrize(prizeStats) {
  const availablePrizes = prizeStats.filter((prize) => prize.remaining > 0);
  const hardLuck = PRIZES.find((prize) => prize.label === "Hard Luck");

  if (availablePrizes.length === 0) {
    return hardLuck;
  }

  const totalRemaining = availablePrizes.reduce(
    (sum, prize) => sum + prize.remaining,
    0
  );
  let random = Math.floor(Math.random() * totalRemaining);

  for (const prize of availablePrizes) {
    if (random < prize.remaining) {
      return prize;
    }

    random -= prize.remaining;
  }

  return hardLuck;
}

function findNextPromoCode(rows, prizeLabel) {
  for (let i = 1; i < rows.length; i++) {
    const code = String(rows[i][0]).trim();
    const prize = String(rows[i][1]).trim();
    const status = String(rows[i][2]).trim();

    if (code && prize === prizeLabel && status === "Unused") {
      return {
        code,
        rowIndex: i,
      };
    }
  }

  return null;
}

function cleanText(value) {
  return String(value || "").trim();
}

function cleanEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function cleanPhone(value) {
  let phone = String(value || "").replace(/\D/g, "");

  // Treat 03xxxxxx, 3xxxxxx, +9613xxxxxx and 009613xxxxxx as one number.
  if (phone.startsWith("00961")) {
    phone = phone.slice(5);
  } else if (phone.startsWith("961")) {
    phone = phone.slice(3);
  }

  if (/^3\d{6}$/.test(phone)) {
    phone = `0${phone}`;
  }

  return /^03\d{6}$/.test(phone) ? phone : "";
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
