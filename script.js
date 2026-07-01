const GOOGLE_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbxsRMg3K3Timaph-WHBf0LX-7e1jslSY6n5CFDq-eXntu67Ybw_P0AAKXl6q9A4fMw/exec";

const prizes = [
  {
    label: "30%",
    lines: ["30%"],
    name: "30% Gift Voucher",
    color: "#13aae3",
    textColor: "light",
    fontSize: 8.3,
    radius: 30,
    rotate: "radial",
  },
  {
    label: "Hard Luck",
    lines: ["HARD", "LUCK"],
    name: "Hard Luck",
    color: "#1f4778",
    textColor: "light",
    fontSize: 5.35,
    radius: 32,
    rotate: "tangent",
  },
  {
    label: "50%",
    lines: ["50%"],
    name: "50% Gift Voucher",
    color: "#d9f0f8",
    textColor: "blue",
    fontSize: 8.3,
    radius: 30,
    rotate: "radial",
  },
  {
    label: "20%",
    lines: ["20%"],
    name: "20% Gift Voucher",
    color: "#09a8e1",
    textColor: "light",
    fontSize: 8.3,
    radius: 30,
    rotate: "radial",
  },
  {
    label: "Get 1 Item Free",
    lines: ["GET 1 ITEM", "FOR FREE"],
    name: "Get 1 Item For Free",
    color: "#e5f6fb",
    textColor: "blue",
    fontSize: 4.8,
    radius: 33,
    rotate: "tangent",
  },
];

const registerScreen = document.getElementById("registerScreen");
const pageLoader = document.getElementById("pageLoader");
const wheelScreen = document.getElementById("wheelScreen");
const resultScreen = document.getElementById("resultScreen");
const screens = [registerScreen, wheelScreen, resultScreen];
const registerForm = document.getElementById("registerForm");
const submitButton = registerForm.querySelector(".submit-btn");
const wheelWrap = document.querySelector(".wheel-wrap");
const wheel = document.getElementById("wheel");
const goButton = document.getElementById("goButton");
const backButton = document.getElementById("backButton");
const copyButton = document.getElementById("copyButton");
const resultTitle = document.getElementById("resultTitle");
const playerName = document.getElementById("playerName");
const playerPhone = document.getElementById("playerPhone");
const resultName = document.getElementById("resultName");
const promoCode = document.getElementById("promoCode");
const expiryDate = document.getElementById("expiryDate");
const hardLuckMessage = document.getElementById("hardLuckMessage");
const promoLabel = document.querySelector(".promo-label");
const expiryLine = document.querySelector(".expiry");
const branchLine = document.querySelector(".branch-line");
const sliceAngle = 360 / prizes.length;
const pointerAngle = 270;
const spinDurationMs = 5000;
const spinFallbackDelayMs = spinDurationMs + 250;
const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const prizeIndexByName = new Map();
let isSpinning = false;
let currentRotation = 0;
let currentResult = null;
let currentCustomer = null;
let pendingSpinResult = null;
let spinFallbackTimer = null;
let pullStartY = null;
let pullDistance = 0;
const pullToRefreshDistance = 90;

window.addEventListener("load", () => {
  window.setTimeout(() => {
    pageLoader.classList.add("is-hidden");
  }, 400);
});

document.addEventListener(
  "touchstart",
  (event) => {
    if (window.scrollY === 0 && event.touches.length === 1) {
      pullStartY = event.touches[0].clientY;
      pullDistance = 0;
    }
  },
  { passive: true },
);

document.addEventListener(
  "touchmove",
  (event) => {
    if (pullStartY === null || event.touches.length !== 1) {
      return;
    }

    pullDistance = Math.max(0, event.touches[0].clientY - pullStartY);
  },
  { passive: true },
);

document.addEventListener("touchend", () => {
  if (pullStartY !== null && pullDistance >= pullToRefreshDistance) {
    window.location.reload();
  }

  pullStartY = null;
  pullDistance = 0;
});

document.addEventListener("touchcancel", () => {
  pullStartY = null;
  pullDistance = 0;
});

prizes.forEach((prize, index) => {
  [prize.name, prize.label].forEach((name) => {
    prizeIndexByName.set(normalizePrizeName(name), index);
  });
});

function showScreen(screen) {
  screens.forEach((item) => {
    item.classList.toggle("is-active", item === screen);
  });
}

function polarToCartesian(centerX, centerY, radius, angleInDegrees) {
  const angleInRadians = (angleInDegrees * Math.PI) / 180;

  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

function describeSlice(centerX, centerY, radius, startAngle, endAngle) {
  const start = polarToCartesian(centerX, centerY, radius, startAngle);
  const end = polarToCartesian(centerX, centerY, radius, endAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

  return [
    `M ${centerX} ${centerY}`,
    `L ${start.x} ${start.y}`,
    `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`,
    "Z",
  ].join(" ");
}

function createSvgElement(name) {
  return document.createElementNS("http://www.w3.org/2000/svg", name);
}

function createWheelDetails() {
  const svg = createSvgElement("svg");
  const wheelFragment = document.createDocumentFragment();
  svg.classList.add("wheel-svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("aria-hidden", "true");

  prizes.forEach((prize, index) => {
    const sliceCenter = index * sliceAngle;
    const slice = createSvgElement("g");
    const labelPoint = polarToCartesian(
      50,
      50,
      prize.radius,
      sliceCenter,
    );
    let labelRotation =
      prize.rotate === "tangent" ? sliceCenter + 90 : sliceCenter;

    if (labelRotation > 90 && labelRotation < 270) {
      labelRotation += 180;
    }

    const path = createSvgElement("path");
    path.setAttribute(
      "d",
      describeSlice(
        50,
        50,
        50,
        sliceCenter - sliceAngle / 2,
        sliceCenter + sliceAngle / 2,
      ),
    );
    path.setAttribute("fill", prize.color);
    slice.appendChild(path);

    const text = createSvgElement("text");
    text.classList.add(
      "slice-text",
      prize.textColor === "blue" ? "is-blue" : "is-light",
    );
    text.setAttribute("x", labelPoint.x.toFixed(3));
    text.setAttribute("y", labelPoint.y.toFixed(3));
    text.setAttribute("font-size", prize.fontSize);
    text.setAttribute(
      "transform",
      `rotate(${labelRotation} ${labelPoint.x.toFixed(3)} ${labelPoint.y.toFixed(3)})`,
    );

    prize.lines.forEach((line, lineIndex, lines) => {
      const tspan = createSvgElement("tspan");
      tspan.setAttribute("x", labelPoint.x.toFixed(3));
      tspan.setAttribute(
        "dy",
        lineIndex === 0
          ? `${(1 - lines.length) * prize.fontSize * 0.52}`
          : `${prize.fontSize * 0.96}`,
      );
      tspan.textContent = line;
      text.appendChild(tspan);
    });

    slice.appendChild(text);
    wheelFragment.appendChild(slice);
  });

  svg.appendChild(wheelFragment);
  wheel.prepend(svg);

  const dotLayer = document.createElement("div");
  const dotFragment = document.createDocumentFragment();
  dotLayer.className = "wheel-dot-layer";

  const standHolePoints = [
    [560.1, 133.7],
    [408.5, 160.7],
    [711.9, 160.8],
    [275.5, 237.8],
    [845.4, 237.8],
    [176.6, 355.1],
    [943.3, 355.1],
    [123.9, 501.7],
    [996.3, 501.7],
    [123.8, 655.6],
    [996.2, 655.7],
    [176.7, 800.6],
    [943.3, 800.7],
    [275.6, 918.6],
    [845.3, 918.7],
    [408.5, 996.3],
    [711.8, 996.3],
    [560.1, 1022.9],
  ];

  standHolePoints.forEach(([x, y]) => {
    const dot = document.createElement("span");
    dot.className = "stand-dot";
    dot.style.setProperty("--dot-x", (x / 1122) * 100);
    dot.style.setProperty("--dot-y", (y / 1402) * 100);
    dotFragment.appendChild(dot);
  });

  dotLayer.appendChild(dotFragment);
  wheelWrap.appendChild(dotLayer);
}

function formatDate(date) {
  return dateFormatter.format(date);
}

function normalizePrizeName(name) {
  return String(name || "")
    .trim()
    .toLowerCase();
}

function getPrizeIndexFromName(prizeName) {
  return prizeIndexByName.get(normalizePrizeName(prizeName)) ?? 1;
}

function isHardLuckResult(result) {
  return normalizePrizeName(result.name || result.prize) === "hard luck";
}

async function getResultFromBackend(customer) {
  if (!GOOGLE_SCRIPT_URL.includes("script.google.com")) {
    throw new Error("Please add your Google Apps Script Web App URL.");
  }

  const response = await fetch(GOOGLE_SCRIPT_URL, {
    method: "POST",
    body: JSON.stringify(customer),
  });

  if (!response.ok) {
    throw new Error("Could not connect to Google Sheets.");
  }

  const data = await response.json();
  console.log("Spin backend response:", data);

  if (!data.success) {
    throw new Error(data.message || "Google Sheets returned an error.");
  }

  return data;
}

function createResultFromBackend(data) {
  const backendResult = data.result || {};
  const expiryValue = backendResult.expiryDate || "";
  const expiryDateValue = expiryValue ? new Date(expiryValue) : null;

  return {
    label: backendResult.prize,
    name: backendResult.prize,
    code: backendResult.promoCode || "",
    expiresAt: expiryValue,
    expiry:
      expiryDateValue && !Number.isNaN(expiryDateValue.getTime())
        ? formatDate(expiryDateValue)
        : expiryValue,
    status: backendResult.status || "",
    branch: backendResult.branch || "Ghazir",
    playerName: backendResult.playerName || backendResult.name || "",
    playerPhone: backendResult.playerPhone || backendResult.phone || "",
    alreadyPlayed: Boolean(data.alreadyPlayed),
  };
}

function isPromoExpired(result) {
  if (!result.expiresAt) {
    return false;
  }

  const expiresAt = new Date(result.expiresAt);

  if (Number.isNaN(expiresAt.getTime())) {
    return false;
  }

  return Date.now() > expiresAt;
}

function showResult(prize) {
  const isHardLuck = isHardLuckResult(prize);
  const isExpired = !isHardLuck && isPromoExpired(prize);

  currentResult = prize;
  resultTitle.textContent = prize.alreadyPlayed
    ? "You already Spun the wheel..."
    : isHardLuck
      ? "Hard Luck!"
      : "Congratulations!";
  playerName.textContent = prize.playerName || "-";
  playerPhone.textContent = prize.playerPhone || "-";
  resultName.textContent = prize.name;
  promoCode.textContent = prize.code;
  branchLine.textContent = `Only in ${prize.branch || "Ghazir"} Branch`;

  if (!isHardLuck) {
    expiryDate.textContent = `${isExpired ? "Expired on" : "Valid until"} ${
      prize.expiry || formatDate(new Date(prize.expiresAt))
    }`;
  }

  promoLabel.classList.toggle("is-hidden", isHardLuck);
  promoCode.classList.toggle("is-hidden", isHardLuck);
  promoCode.classList.toggle("is-expired", isExpired);
  expiryLine.classList.toggle("is-hidden", isHardLuck);
  branchLine.classList.toggle("is-hidden", isHardLuck);
  copyButton.classList.toggle("is-hidden", isHardLuck || isExpired);
  copyButton.textContent = "Copy Promocode";
  hardLuckMessage.classList.toggle("is-hidden", !isHardLuck);
  showScreen(resultScreen);
}

function normalizeRotation(degrees) {
  return ((degrees % 360) + 360) % 360;
}

function getSpinRotation(prizeIndex) {
  const prizeCenterAngle = prizeIndex * sliceAngle;
  const currentAngle = normalizeRotation(currentRotation);
  const targetAngle = normalizeRotation(pointerAngle - prizeCenterAngle);
  const rotationToTarget = normalizeRotation(targetAngle - currentAngle);

  return 360 * 8 + rotationToTarget;
}

function normalizeLebaneseMobilePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return /^(?:03|70|71|76|78|79|81)\d{6}$/.test(digits) ? digits : "";
}

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const phone = normalizeLebaneseMobilePhone(registerForm.customerPhone.value);

  if (!phone) {
    window.alert("Enter 8 digits starting with 03, 70, 71, 76, 78, 79, or 81.");
    return;
  }

  currentCustomer = {
    name: registerForm.customerName.value.trim(),
    email:
      registerForm.customerEmail.value.trim() ||
      `no-email-${phone.replace(/\D/g, "") || "unknown"}@local.invalid`,
    phone,
  };

  if (!currentCustomer.name) {
    window.alert("Please enter name and phone number.");
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Checking...";

  try {
    const data = await getResultFromBackend(currentCustomer);
    const result = createResultFromBackend(data);

    pendingSpinResult = data.alreadyPlayed ? null : result;

    if (data.alreadyPlayed) {
      showResult(result);
    } else {
      goButton.disabled = false;
      goButton.textContent = "GO";
      showScreen(wheelScreen);
    }
  } catch (error) {
    window.alert(error.message || "Something went wrong.");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Submit";
  }
});

goButton.addEventListener("click", () => {
  if (isSpinning) {
    return;
  }

  if (!pendingSpinResult) {
    window.alert("Please register first.");
    showScreen(registerScreen);
    return;
  }

  isSpinning = true;
  goButton.disabled = true;
  goButton.textContent = "GO";

  const result = pendingSpinResult;
  const prizeIndex = getPrizeIndexFromName(result.name);

  currentRotation += getSpinRotation(prizeIndex);
  wheel.classList.add("is-spinning");

  window.requestAnimationFrame(() => {
    wheel.style.transform = `translateZ(0) rotate(${currentRotation}deg)`;
  });

  const finishSpin = () => {
    window.clearTimeout(spinFallbackTimer);
    wheel.removeEventListener("transitionend", handleSpinEnd);
    wheel.classList.remove("is-spinning");
    goButton.disabled = false;
    goButton.textContent = "GO";
    isSpinning = false;
    pendingSpinResult = null;
    showResult(result);
  };

  const handleSpinEnd = (event) => {
    if (event.propertyName === "transform") {
      finishSpin();
    }
  };

  wheel.addEventListener("transitionend", handleSpinEnd);
  spinFallbackTimer = window.setTimeout(finishSpin, spinFallbackDelayMs);
});

copyButton.addEventListener("click", async () => {
  if (!currentResult || isPromoExpired(currentResult)) {
    copyButton.textContent = "Promocode Expired";
    return;
  }

  try {
    await navigator.clipboard.writeText(promoCode.textContent.trim());
    copyButton.textContent = "Copied";
  } catch (error) {
    copyButton.textContent = "Select Promocode";
  }

  window.setTimeout(() => {
    copyButton.textContent = "Copy Promocode";
  }, 1600);
});

backButton.addEventListener("click", () => {
  showScreen(registerScreen);
});

createWheelDetails();
