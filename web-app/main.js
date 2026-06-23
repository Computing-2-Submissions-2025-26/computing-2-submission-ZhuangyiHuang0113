import {
  ARTIFACT_NUMBERS,
  DANGER_NAMES,
  TREASURE_VALUES,
  chooseBotAction,
  createPlayers as createGamePlayers,
  createRoundDeck,
  distributeTreasure as applyTreasureDistribution,
  failRound as applyRoundFailure,
  preparePlayersForRound,
  rankPlayers,
  scorePlayer,
  settleReturningPlayers
} from "./IncaTreasure.js";

const screens = [...document.querySelectorAll(".screen")];
const boardEl = document.querySelector("#board");
const overlay = document.querySelector("#message-overlay");
const overlayTitle = document.querySelector("#overlay-title");
const overlayMessage = document.querySelector("#overlay-message");
const overlayDetails = document.querySelector("#overlay-details");
const overlayButton = document.querySelector("#overlay-button");
const continueButton = document.querySelector("#continue-button");
const leaveButton = document.querySelector("#leave-button");
const timerValue = document.querySelector("#timer-value");
const timerRing = document.querySelector("#timer-ring");
const decisionPanel = document.querySelector(".decision-panel");
const decisionKicker = document.querySelector(".decision-kicker");
const decisionTitle = document.querySelector("#decision-title");
const decisionCopy = document.querySelector("#decision-copy");
const revealCountdown = document.querySelector("#reveal-countdown");
const turnText = document.querySelector("#turn-text");
const roundLabel = document.querySelector("#round-label");
const roundTabs = document.querySelector("#round-tabs");
const inventoryEl = document.querySelector("#player-inventory");
const cardRevealStage = document.querySelector("#card-reveal-stage");
const featuredCard = document.querySelector("#featured-card");
const featuredCardLabel = document.querySelector("#featured-card-label");
const choiceRevealStage = document.querySelector("#choice-reveal-stage");
const choiceResults = document.querySelector("#choice-results");
const finalRankingEl = document.querySelector("#final-ranking");
const playerCountSelect = document.querySelector("#player-count");
const localNameInputs = [...document.querySelectorAll("[data-player-name]")];
const tutorialTrack = document.querySelector("#tutorial-track");
const tutorialSlides = [...document.querySelectorAll(".tutorial-slide")];
const tutorialDots = document.querySelector("#tutorial-dots");
const diceButton = document.querySelector("#dice-button");
const diceValue = document.querySelector("#dice-value");
const startFlag = document.querySelector("#start-flag");
const pauseOverlay = document.querySelector("#pause-overlay");
const settingsOverlay = document.querySelector("#settings-overlay");
const soundButton = document.querySelector("#sound-button");
const volumeSlider = document.querySelector("#volume-slider");

const pathSlots = [0, 1, 2, 3, 4, 5, 6, 13, 20, 27, 34, 33, 32, 31, 30, 29, 28, 21, 14, 7];
const dangerIcons = { FIRE: "F", LANDSLIDE: "L", SNAKES: "S", SPIDERS: "W", MUMMY: "M" };

// Only browser/UI state lives here. The scoring and card rules stay in
// IncaTreasure.js so this file does not become one huge mixed script.
const state = {
  round: 1,
  phase: "menu",
  deck: [],
  revealed: [],
  routeCards: [],
  routeCursor: -1,
  dangerCounts: {},
  dangerPool: {},
  artifactPool: [...ARTIFACT_NUMBERS],
  players: [],
  timer: null,
  seconds: 8,
  playerChoice: null,
  pendingAction: null,
  roundStartPlayer: 0,
  currentTurn: 0,
  gameMode: "bots",
  localPlayerCount: 2,
  localNames: ["", "", "", ""],
  localChoiceQueue: [],
  localChoiceIndex: 0,
  soundOn: true,
  volume: 70,
  paused: false
};

function showScreen(id) {
  // Only one screen is visible at a time: menu, rules, game or final ranking.
  screens.forEach(screen => screen.classList.toggle("active", screen.id === id));
}

function buildDeck() {
  // One relic is added each round. The pure module only needs the relic number.
  const artifactNumber = state.artifactPool.length
    ? state.artifactPool.shift()
    : null;
  return createRoundDeck({
    dangerPool: state.dangerPool,
    artifactNumber
  });
}

function createPlayers() {
  return createGamePlayers({
    mode: state.gameMode,
    count: state.localPlayerCount,
    names: state.localNames
  });
}

function startGame(mode = state.gameMode) {
  // Starting a new game resets all rule state, not just the visible board.
  clearTimer();
  state.gameMode = mode;
  state.round = 1;
  state.artifactPool = [...ARTIFACT_NUMBERS];
  state.dangerPool = Object.fromEntries(DANGER_NAMES.map(name => [name, 3]));
  state.players = createPlayers();
  state.roundStartPlayer = 0;
  showScreen("game-screen");
  startRound();
}

function startRound() {
  // A round starts by building a fresh deck and charging each explorer's deposit.
  state.phase = "round-start";
  state.deck = buildDeck();
  state.revealed = [];
  state.routeCards = Array(pathSlots.length).fill(null);
  state.routeCursor = -1;
  state.dangerCounts = {};
  state.playerChoice = null;
  state.currentTurn = state.roundStartPlayer % state.players.length;
  state.players = preparePlayersForRound(state.players);
  renderAll();
  showResult(
    `ROUND ${state.round}`,
    "Each explorer must offer one blue gem to enter the cave. Only those who return safely may reclaim it.",
    "",
    "ENTER THE CAVE",
    () => {
      hideResult();
      setReadyToReveal();
    }
  );
}

function renderAll() {
  // This is the small "refresh the whole game UI" helper after rule state changes.
  renderRoundTabs();
  renderPlayers();
  renderInventory();
  renderBoard();
  roundLabel.textContent = `ROUND ${state.round}`;
}

function renderRoundTabs() {
  // The round tabs are just visual feedback, but they make the five-round game clearer.
  roundTabs.innerHTML = "";
  for (let round = 1; round <= 5; round += 1) {
    const tab = document.createElement("span");
    tab.className = "round-tab";
    if (round === state.round) tab.classList.add("active");
    if (round < state.round) tab.classList.add("done");
    tab.textContent = round;
    roundTabs.append(tab);
  }
}

function renderPlayers() {
  // Tent wealth is deliberately hidden until the final screen, like the board game.
  ["you", "atu", "mira", "cusco"].forEach(id => {
    const panel = document.querySelector(`#player-${id}`);
    if (panel) panel.classList.toggle("unused", !state.players.some(player => player.id === id));
  });
  state.players.forEach((player, index) => {
    const panel = document.querySelector(`#player-${player.id}`);
    if (!panel) return;
    panel.className = `player-panel player-${player.color}${player.active ? "" : " out"}`;
    panel.classList.toggle("current-turn", player.active && index === state.currentTurn && ["ready", "rolling"].includes(state.phase));
    const revealChoice = state.phase === "resolving";
    const choiceText = revealChoice && player.choice === "continue" ? "KEEP EXPLORING" : revealChoice && player.choice === "leave" ? "RETURN TO TENT" : "";
    const choiceClass = player.choice ? ` choice-${player.choice}` : "";
    panel.innerHTML = `
      <h3>${player.name}</h3>
      <div class="tent" aria-hidden="true"><img src="assets/tent-${player.color}.png" alt=""></div>
      <p><b>TENT WEALTH: HIDDEN</b></p>
      <p class="round-loot">ROUND LOOT ${player.roundLoot}</p>
      <span class="choice-badge${choiceClass}">${player.active ? choiceText : "RETURNED TO TENT"}</span>
    `;
  });
}

function renderInventory() {
  // The player's own pack is visible so the user can understand what they risk.
  const you = state.players.find(player => player.id === "you");
  if (!you) return;
  inventoryEl.innerHTML = `
    <div class="inventory-title">YOUR PACK</div>
    <div class="inventory-row"><span>ROUND LOOT</span><strong>${you.roundLoot}</strong></div>
    <div class="inventory-row"><span>SECURED</span><strong>${you.tent}</strong></div>
    <div class="inventory-row"><span>WALLET</span><strong>${you.wallet}</strong></div>
    <div class="inventory-row artifacts"><span>ARTIFACTS</span><strong>${you.artifacts.length ? you.artifacts.map(artifact => `#${artifact.number}`).join(", ") : "NONE"}</strong></div>
    <div class="inventory-total">KNOWN TOTAL ${you.tent + you.wallet + you.roundLoot}</div>
  `;
}

function renderBoard() {
  // The board path is a fixed set of grid slots, so cards can appear around the cave.
  boardEl.innerHTML = "";
  for (let index = 0; index < 35; index += 1) {
    const slot = document.createElement("div");
    const pathIndex = pathSlots.indexOf(index);
    slot.className = `board-slot${pathIndex >= 0 ? " path" : ""}`;
    if (pathIndex === state.routeCursor) slot.classList.add("current");
    if (pathIndex === 0 && state.routeCursor < 0) slot.classList.add("start");

    if (pathIndex >= 0) {
      const card = state.routeCards[pathIndex];
      if (card) {
        slot.append(createCardElement(card));
      } else {
        const back = document.createElement("div");
        back.className = "card back";
        slot.append(back);
      }
    }
    boardEl.append(slot);
  }
}

function createCardElement(card) {
  // Cards are built in one place so the board and reveal animation always match.
  const el = document.createElement("div");
  el.className = `card ${card.type}`;
  if (card.type === "treasure") {
    el.innerHTML = `
      <div class="card-type">TREASURE</div>
      <div class="card-gems">${gemMarkupForValue(card.value)}</div>
      <div class="card-value">${card.value}</div>
      <span class="card-leftover">LEFT ${card.leftover}</span>
    `;
  } else if (card.type === "danger") {
    el.innerHTML = `
      <div class="card-type">${card.name}</div>
      <div class="card-art danger-art" data-danger="${card.name}">${dangerIcons[card.name] || "!"}</div>
      <small>DANGER</small>
    `;
  } else {
    el.innerHTML = `
      <div class="card-type">ARTIFACT</div>
      <div class="artifact-vase" aria-hidden="true"><b>${card.number}</b></div>
      <small>${card.value} POINTS</small>
    `;
  }
  return el;
}

function gemColorForValue(value) {
  // This is only a display choice. The actual treasure value is still stored as a number.
  if (value >= 10) return "yellow";
  if (value >= 5) return "black";
  return "blue";
}

function gemMarkupForValue(value) {
  const yellow = Math.floor(value / 10);
  const black = Math.floor((value % 10) / 5);
  const blue = value % 5;
  const gems = [
    ...Array(yellow).fill("yellow"),
    ...Array(black).fill("black"),
    ...Array(blue).fill("blue")
  ];
  return gems.map(color => `<i class="gem gem-${color}"></i>`).join("");
}

function setReadyToReveal() {
  // The dice keeps the next reveal in the player's hands instead of auto-playing.
  state.phase = "ready";
  decisionPanel.dataset.phase = "ready";
  decisionKicker.textContent = "READY TO EXPLORE";
  const explorer = state.players[state.currentTurn];
  turnText.textContent = `${explorer.name} ROLLS THE DICE`;
  decisionTitle.textContent = explorer.isBot ? `${explorer.name} IS ROLLING` : "ROLL THE DICE";
  decisionCopy.textContent = explorer.isBot ? "The explorer is choosing a path." : "Click the dice above your pack to move and reveal.";
  timerValue.textContent = "";
  continueButton.classList.add("hidden");
  leaveButton.classList.add("hidden");
  revealCountdown.textContent = "";
  diceValue.textContent = "?";
  diceButton.classList.remove("hidden", "rolling");
  diceButton.disabled = false;
  startFlag.classList.toggle("hidden", state.routeCursor >= 0);
  renderPlayers();
  if (explorer.isBot) {
    diceButton.disabled = true;
    window.setTimeout(rollDiceAndMove, 900);
  }
}

function rollDiceAndMove() {
  if (state.phase !== "ready") return;
  state.phase = "rolling";
  diceButton.disabled = true;
  diceButton.classList.add("rolling");
  const roll = Math.floor(Math.random() * 6) + 1;
  diceValue.textContent = roll;
  turnText.textContent = `${state.players[state.currentTurn].name} ROLLED ${roll}`;
  window.setTimeout(() => revealCardAtRoll(roll), 700);
}

function revealCardAtRoll(roll) {
  // The roll moves around the path. New spaces reveal cards; old spaces replay them.
  if (state.phase !== "rolling") return;
  if (!state.deck.length || state.revealed.length >= pathSlots.length) {
    endRoundSafely("The cave has been fully explored!");
    return;
  }

  state.phase = "revealing";
  decisionPanel.dataset.phase = "revealing";
  state.routeCursor = (state.routeCursor + roll + pathSlots.length) % pathSlots.length;
  const existingCard = state.routeCards[state.routeCursor];
  renderBoard();

  if (existingCard) {
    showFeaturedCard(existingCard, () => resolveRevisitedCard(existingCard));
    return;
  }

  const card = state.deck.pop();
  state.routeCards[state.routeCursor] = card;
  state.revealed = state.routeCards.filter(Boolean);
  showFeaturedCard(card, () => resolveRevealedCard(card));
}

function resolveRevealedCard(card) {
  // After the reveal animation, the real rule result is applied from IncaTreasure.js.
  renderBoard();
  if (card.type === "treasure") {
    distributeTreasure(card);
    renderBoard();
    turnText.textContent = `TREASURE ${card.value}`;
  } else if (card.type === "danger") {
    state.dangerCounts[card.name] = (state.dangerCounts[card.name] || 0) + 1;
    turnText.textContent = `DANGER: ${card.name}`;
    if (state.dangerCounts[card.name] >= 2) {
      renderPlayers();
      window.setTimeout(() => failRound(card.name), 550);
      return;
    }
  } else {
    turnText.textContent = `RELIC ${card.number} - ${card.value} POINTS`;
  }

  renderPlayers();
  renderInventory();
  state.currentTurn = nextActivePlayerIndex(state.currentTurn);
  beginDecision();
}

function resolveRevisitedCard(card) {
  renderBoard();
  turnText.textContent = card.type === "treasure"
    ? `REVISITED TREASURE ${card.value}`
    : card.type === "danger"
      ? `REVISITED ${card.name}`
      : `REVISITED RELIC ${card.number}`;
  renderPlayers();
  renderInventory();
  state.currentTurn = nextActivePlayerIndex(state.currentTurn);
  beginDecision();
}

function showFeaturedCard(card, onComplete) {
  // The big centre card is only presentation; the actual card is already in state.
  featuredCard.replaceChildren(createCardElement(card));
  featuredCardLabel.textContent = card.type === "treasure"
    ? `TREASURE ${card.value}`
    : card.type === "danger"
      ? `${card.name} DANGER`
      : `RELIC ${card.number} - ${card.value} POINTS`;
  cardRevealStage.classList.remove("hidden", "flying");
  featuredCard.getAnimations().forEach(animation => animation.cancel());

  const holdTime = card.type === "treasure" ? 4000 : 2300;
  window.setTimeout(() => {
    cardRevealStage.classList.add("flying");
    featuredCard.animate(
      [
        { transform: "translate(-50%, -50%) scale(1)", opacity: 1 },
        { transform: "translate(-50%, -50%) scale(.22)", opacity: 0 }
      ],
      { duration: 520, easing: "cubic-bezier(.4,0,.8,.2)", fill: "forwards" }
    );
  }, holdTime);

  window.setTimeout(() => {
    cardRevealStage.classList.add("hidden");
    cardRevealStage.classList.remove("flying");
    featuredCard.replaceChildren();
    onComplete();
  }, holdTime + 560);
}

function distributeTreasure(card) {
  // The pure API is called here, then the updated leftover value is copied back to the card.
  const result = applyTreasureDistribution(state.players, card);
  state.players = result.players;
  Object.assign(card, result.card);
  renderInventory();
}

function beginDecision() {
  // In local multiplayer each explorer chooses in turn on the same screen.
  // All choices are still revealed together so nobody's choice is shown early.
  state.phase = "decision";
  state.seconds = 8;
  state.playerChoice = null;
  state.players.forEach(player => {
    if (player.active) player.choice = null;
  });
  const you = state.players.find(player => player.id === "you");
  const isSpectating = !you?.active;
  decisionPanel.dataset.phase = isSpectating ? "spectating" : "decision";
  decisionKicker.textContent = isSpectating ? "WATCHING EXPLORERS" : "CHOOSE SECRETLY";
  decisionTitle.textContent = isSpectating ? "YOU ARE SAFE" : "MAKE YOUR CHOICE";
  decisionCopy.textContent = isSpectating ? "You already returned to your tent." : "Choose within eight seconds.";
  continueButton.classList.remove("hidden");
  leaveButton.classList.remove("hidden");
  continueButton.disabled = isSpectating;
  leaveButton.disabled = isSpectating;
  continueButton.classList.toggle("locked", isSpectating);
  leaveButton.classList.toggle("locked", isSpectating);
  revealCountdown.textContent = "";
  timerValue.textContent = String(state.seconds).padStart(2, "0");
  timerRing.style.borderTopColor = "var(--red)";
  renderPlayers();
  clearTimer();
  if (state.gameMode === "local") {
    decisionPanel.dataset.phase = "decision";
    decisionKicker.textContent = "PRIVATE CHOICE";
    state.localChoiceQueue = state.players.filter(player => player.active);
    state.localChoiceIndex = 0;
    beginLocalChoiceTurn();
    return;
  }
  state.timer = window.setInterval(() => {
    state.seconds -= 1;
    timerValue.textContent = String(state.seconds).padStart(2, "0");
    if (state.seconds <= 3) revealCountdown.textContent = state.seconds || "REVEAL";
    if (state.seconds <= 0) {
      if (!state.playerChoice) state.playerChoice = "continue";
      resolveChoices();
    }
  }, 1000);
}

function choose(action) {
  // This handles both the normal player button and the local multiplayer queue.
  if (state.phase !== "decision") return;
  if (state.gameMode === "local") {
    const player = state.localChoiceQueue[state.localChoiceIndex];
    if (!player || player.choice) return;
    player.choice = action;
    continueButton.disabled = true;
    leaveButton.disabled = true;
    clearTimer();
    state.localChoiceIndex += 1;
    if (state.localChoiceIndex >= state.localChoiceQueue.length) {
      decisionCopy.textContent = "All choices are locked.";
      window.setTimeout(resolveChoices, 350);
    } else {
      const nextPlayer = state.localChoiceQueue[state.localChoiceIndex];
      showResult(
        "PASS THE DEVICE",
        `Hand the screen to ${nextPlayer.name}. Their choice must stay secret.`,
        "",
        `${nextPlayer.name} IS READY`,
        () => {
          hideResult();
          beginLocalChoiceTurn();
        }
      );
    }
    return;
  }
  if (state.playerChoice) return;
  const you = state.players.find(player => player.id === "you");
  if (!you?.active) return;
  state.playerChoice = action;
  continueButton.disabled = true;
  leaveButton.disabled = true;
  decisionCopy.textContent = "Choice locked. Waiting for reveal.";
}

function beginLocalChoiceTurn() {
  // Local multiplayer is kept simple: pass the device, choose, then pass again.
  const player = state.localChoiceQueue[state.localChoiceIndex];
  if (!player || state.phase !== "decision") return;
  state.seconds = 8;
  decisionKicker.textContent = "PRIVATE CHOICE";
  decisionTitle.textContent = player.name;
  decisionCopy.textContent = "Choose before passing the device.";
  continueButton.disabled = false;
  leaveButton.disabled = false;
  continueButton.classList.remove("locked");
  leaveButton.classList.remove("locked");
  timerValue.textContent = "08";
  clearTimer();
  state.timer = window.setInterval(() => {
    state.seconds -= 1;
    timerValue.textContent = String(state.seconds).padStart(2, "0");
    if (state.seconds <= 0) choose("continue");
  }, 1000);
}

function botChoice(player) {
  // The bot only sees public information: danger already revealed, relic on board,
  // current round and its own carried loot.
  const artifactOnBoard = state.revealed.some(card => card.type === "artifact" && !card.claimed);
  return chooseBotAction(player, {
    dangerCounts: state.dangerCounts,
    artifactOnBoard,
    round: state.round
  });
}

async function resolveChoices() {
  // The reveal screen waits briefly so the user can actually read who left.
  if (state.phase !== "decision") return;
  clearTimer();
  state.phase = "resolving";
  decisionPanel.dataset.phase = "resolving";
  continueButton.classList.add("hidden");
  leaveButton.classList.add("hidden");
  choiceResults.innerHTML = "";
  choiceRevealStage.classList.remove("hidden", "show-results");

  state.players.forEach(player => {
    if (!player.active) return;
    if (state.gameMode === "bots") {
      player.choice = player.isBot ? botChoice(player) : state.playerChoice || "continue";
    } else if (!player.choice) {
      player.choice = "continue";
    }
  });
  renderPlayers();
  renderInventory();

  choiceResults.innerHTML = state.players.map(player => {
    const alreadyAtTent = !player.active;
    const leaving = player.choice === "leave";
    const resultClass = alreadyAtTent ? "camp" : leaving ? "leave" : "continue";
    const resultText = alreadyAtTent ? "ALREADY AT TENT" : leaving ? "RETURNS TO TENT" : "KEEPS EXPLORING";
    return `
      <div class="choice-result ${resultClass}">
        <strong>${player.name}</strong>
        <span>${resultText}</span>
      </div>
    `;
  }).join("");
  choiceRevealStage.classList.add("show-results");
  await delay(2400);
  choiceRevealStage.classList.add("hidden");
  choiceRevealStage.classList.remove("show-results");

  const leaving = state.players.filter(player => player.active && player.choice === "leave");
  if (leaving.length) settleLeavingPlayers(leaving);

  const active = state.players.filter(player => player.active);
  if (!active.length) {
    endRoundSafely("All explorers returned safely!");
    return;
  }

  state.players.forEach(player => {
    if (player.active) player.choice = null;
  });
  renderPlayers();
  renderInventory();
  setReadyToReveal();
}

function delay(milliseconds) {
  return new Promise(resolve => window.setTimeout(resolve, milliseconds));
}

function settleLeavingPlayers(leaving) {
  // Leaving players are resolved by the module, including leftover gems and relics.
  const result = settleReturningPlayers(
    state.players,
    state.revealed,
    leaving.map(player => player.id)
  );
  state.players = result.players;
  state.revealed = result.revealed;
  const updatedCards = [...state.revealed];
  state.routeCards = state.routeCards.map(card => {
    return card ? updatedCards.shift() : null;
  });
  renderBoard();
  renderInventory();
}

function failRound(dangerName) {
  // A duplicate danger ends the round for everyone still inside the cave.
  clearTimer();
  state.phase = "round-end";
  const result = applyRoundFailure(
    state.players,
    state.dangerPool,
    dangerName
  );
  state.players = result.players;
  state.dangerPool = result.dangerPool;
  renderPlayers();
  renderInventory();
  showResult(
    "DUPLICATE DANGER!",
    `A second ${dangerName} card appeared. Explorers still inside lose their round loot and deposit.`,
    "",
    state.round === 5 ? "REVEAL FINAL WEALTH" : "NEXT ROUND",
    finishRound
  );
}

function endRoundSafely(message) {
  // If everyone returns or the deck ends, active players are settled as safe.
  clearTimer();
  state.phase = "round-end";
  const remaining = state.players.filter(player => player.active);
  if (remaining.length) settleLeavingPlayers(remaining);
  showResult(
    "SAFE RETURN",
    message,
    "Round loot is stored in each tent and remains hidden.",
    state.round === 5 ? "REVEAL FINAL WEALTH" : "NEXT ROUND",
    finishRound
  );
}

function finishRound() {
  // After round five, no more decks are made and the final ranking is shown.
  hideResult();
  if (state.round >= 5) {
    showFinalRanking();
    return;
  }
  state.round += 1;
  state.roundStartPlayer = (state.roundStartPlayer + 1) % state.players.length;
  startRound();
}

function showFinalRanking() {
  state.phase = "game-over";
  renderRoundTabs();
  const ranking = rankPlayers(state.players);
  finalRankingEl.innerHTML = ranking.map((player, index) => createFinalRankRow(player, index)).join("");
  showScreen("final-screen");
}

function finalScore(player) {
  return scorePlayer(player);
}

function createFinalRankRow(player, index) {
  // The final score is split into gem icons and relic icons for a clearer result page.
  const artifactPoints = player.artifacts.reduce((sum, artifact) => sum + artifact.points, 0);
  const artifactIcons = player.artifacts.length
    ? player.artifacts.map(artifact => `<i class="mini-artifact">${artifact.number}</i>`).join("")
    : `<i class="mini-artifact empty">-</i>`;
  const gemPoints = Math.max(0, finalScore(player) - artifactPoints);
  const yellow = Math.floor(gemPoints / 10);
  const black = Math.floor((gemPoints % 10) / 5);
  const blue = gemPoints % 5;
  return `
    <article class="final-rank-row${index === 0 ? " champion" : ""}">
      <div class="rank-position">${index + 1}</div>
      <div class="rank-player">
        <img src="assets/tent-${player.color}.png" alt="">
        <strong>${player.name}</strong>
      </div>
      <div class="rank-breakdown">
        <span><i class="gem gem-yellow"></i><b>${yellow}</b><small>${yellow * 10} PTS</small></span>
        <span><i class="gem gem-black"></i><b>${black}</b><small>${black * 5} PTS</small></span>
        <span><i class="gem gem-blue"></i><b>${blue}</b><small>${blue} PTS</small></span>
        <span class="artifact-score"><span class="artifact-icons">${artifactIcons}</span><b>${player.artifacts.length}</b><small>${artifactPoints} PTS</small></span>
      </div>
      <div class="rank-total"><small>TOTAL</small><strong>${finalScore(player)}</strong></div>
    </article>
  `;
}

function nextActivePlayerIndex(fromIndex) {
  // This chooses which active explorer is shown as revealing the next card.
  for (let step = 1; step <= state.players.length; step += 1) {
    const index = (fromIndex + step) % state.players.length;
    if (state.players[index].active) return index;
  }
  return fromIndex;
}

function showResult(title, message, details, buttonText, action) {
  // One overlay is reused for round starts, pass-device messages and end-round results.
  overlayTitle.textContent = title;
  overlayMessage.textContent = message;
  overlayDetails.innerHTML = details;
  overlayButton.textContent = buttonText;
  state.pendingAction = action;
  overlay.classList.remove("hidden");
}

function hideResult() {
  overlay.classList.add("hidden");
}

function clearTimer() {
  // Timers are cleared before changing phase so old countdowns do not keep firing.
  if (state.timer) window.clearInterval(state.timer);
  state.timer = null;
}

function returnToMenu() {
  clearTimer();
  hideResult();
  pauseOverlay.classList.add("hidden");
  settingsOverlay.classList.add("hidden");
  diceButton.classList.add("hidden");
  showScreen("menu-screen");
}

function pauseGame() {
  if (!document.querySelector("#game-screen").classList.contains("active")) return;
  if (["game-over", "menu"].includes(state.phase)) return;
  state.paused = true;
  clearTimer();
  document.querySelector("#game-screen").classList.add("paused");
  pauseOverlay.classList.remove("hidden");
}

function resumeDecisionTimer() {
  if (state.phase !== "decision") return;
  clearTimer();
  state.timer = window.setInterval(() => {
    state.seconds -= 1;
    timerValue.textContent = String(state.seconds).padStart(2, "0");
    if (state.gameMode !== "local" && state.seconds <= 3) {
      revealCountdown.textContent = state.seconds || "REVEAL";
    }
    if (state.seconds <= 0) {
      if (state.gameMode === "local") choose("continue");
      else {
        if (!state.playerChoice) state.playerChoice = "continue";
        resolveChoices();
      }
    }
  }, 1000);
}

function resumeGame() {
  state.paused = false;
  pauseOverlay.classList.add("hidden");
  document.querySelector("#game-screen").classList.remove("paused");
  resumeDecisionTimer();
}

function syncLocalNameInputs() {
  const count = Number(playerCountSelect.value);
  state.localPlayerCount = count;
  localNameInputs.forEach((input, index) => {
    input.closest("label").classList.toggle("hidden", index >= count);
  });
}

function updateSoundButton() {
  soundButton.textContent = state.soundOn ? "SOUND ON" : "SOUND OFF";
  soundButton.classList.toggle("muted", !state.soundOn);
}

document.querySelector("#solo-button").addEventListener("click", () => startGame("bots"));
document.querySelector("#room-button").addEventListener("click", () => {
  syncLocalNameInputs();
  showScreen("room-screen");
});
document.querySelector("#rules-button").addEventListener("click", () => showScreen("rules-screen"));
document.querySelectorAll("[data-back]").forEach(button => {
  button.addEventListener("click", () => showScreen(button.dataset.back));
});
document.querySelector("#start-local-button").addEventListener("click", () => {
  state.localPlayerCount = Number(playerCountSelect.value);
  state.localNames = localNameInputs.slice(0, state.localPlayerCount).map((input, index) => input.value.trim() || `PLAYER ${index + 1}`);
  startGame("local");
});
playerCountSelect.addEventListener("change", syncLocalNameInputs);
document.querySelector("#leave-game-button").addEventListener("click", returnToMenu);
document.querySelector("#fullscreen-button").addEventListener("click", () => {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
  else document.exitFullscreen?.();
});
soundButton.addEventListener("click", () => {
  state.soundOn = !state.soundOn;
  updateSoundButton();
});
volumeSlider.addEventListener("input", event => {
  state.volume = Number(event.target.value);
  state.soundOn = state.volume > 0;
  updateSoundButton();
});
document.querySelector("#pause-button").addEventListener("click", pauseGame);
document.querySelector("#resume-button").addEventListener("click", resumeGame);
document.querySelector("#pause-menu-button").addEventListener("click", returnToMenu);
document.querySelector("#game-settings-button").addEventListener("click", () => settingsOverlay.classList.remove("hidden"));
document.querySelector("#settings-close-button").addEventListener("click", () => settingsOverlay.classList.add("hidden"));
document.querySelector("#final-replay-button").addEventListener("click", () => startGame(state.gameMode));
document.querySelector("#final-menu-button").addEventListener("click", () => showScreen("menu-screen"));
const menuChoices = [...document.querySelectorAll(".menu-card > .menu-button")];
menuChoices.forEach(button => {
  const selectButton = () => {
    menuChoices.forEach(choice => choice.classList.toggle("menu-selected", choice === button));
  };
  button.addEventListener("mouseenter", selectButton);
  button.addEventListener("focus", selectButton);
});
continueButton.addEventListener("click", () => choose("continue"));
leaveButton.addEventListener("click", () => choose("leave"));
diceButton.addEventListener("click", rollDiceAndMove);
overlayButton.addEventListener("click", () => {
  const action = state.pendingAction;
  state.pendingAction = null;
  action?.();
});

function updateTutorial(index) {
  // The rules page is a horizontal set of screenshots with short explanations.
  const target = tutorialSlides[index];
  if (!target) return;
  tutorialTrack.scrollTo({ left: target.offsetLeft - tutorialTrack.offsetLeft, behavior: "smooth" });
}

tutorialSlides.forEach((slide, index) => {
  const dot = document.createElement("button");
  dot.type = "button";
  dot.setAttribute("aria-label", `Rule ${index + 1}`);
  dot.addEventListener("click", () => updateTutorial(index));
  tutorialDots.append(dot);
});

function tutorialIndex() {
  if (!tutorialSlides.length) return 0;
  const slideWidth = tutorialSlides[0].offsetWidth + 18;
  return Math.max(0, Math.min(tutorialSlides.length - 1, Math.round(tutorialTrack.scrollLeft / slideWidth)));
}

function syncTutorialDots() {
  const active = tutorialIndex();
  [...tutorialDots.children].forEach((dot, index) => dot.classList.toggle("active", index === active));
}

document.querySelector("#tutorial-prev").addEventListener("click", () => updateTutorial(tutorialIndex() - 1));
document.querySelector("#tutorial-next").addEventListener("click", () => updateTutorial(tutorialIndex() + 1));
tutorialTrack.addEventListener("scroll", syncTutorialDots, { passive: true });
syncTutorialDots();
syncLocalNameInputs();
updateSoundButton();

showScreen("menu-screen");
