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
} from "./TempleTreasure.js";

const screens = [...document.querySelectorAll(".screen")];
const boardEl = document.querySelector("#board");
const overlay = document.querySelector("#message-overlay");
const overlayTitle = document.querySelector("#overlay-title");
const overlayMessage = document.querySelector("#overlay-message");
const overlayDetails = document.querySelector("#overlay-details");
const overlayButton = document.querySelector("#overlay-button");
const overlayMenuButton = document.querySelector("#overlay-menu-button");
const continueButton = document.querySelector("#continue-button");
const leaveButton = document.querySelector("#leave-button");
const quitPlayerButton = document.querySelector("#quit-player-button");
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
const flyingGems = document.querySelector("#flying-gems");
const choiceRevealStage = document.querySelector("#choice-reveal-stage");
const choiceResults = document.querySelector("#choice-results");
const finalRankingEl = document.querySelector("#final-ranking");
const playerCountSelect = document.querySelector("#player-count");
const localNameInputs = [...document.querySelectorAll("[data-player-name]")];
const localCharacterSelects = [...document.querySelectorAll("[data-player-character]")];
const tutorialTrack = document.querySelector("#tutorial-track");
const tutorialSlides = [...document.querySelectorAll(".tutorial-slide")];
const tutorialDots = document.querySelector("#tutorial-dots");
const diceButton = document.querySelector("#dice-button");
const pauseButton = document.querySelector("#pause-button");
const pauseOverlay = document.querySelector("#pause-overlay");
const settingsOverlay = document.querySelector("#settings-overlay");
const soundButton = document.querySelector("#sound-button");
const settingsSoundButton = document.querySelector("#settings-sound-button");
const settingsRulesSummary = document.querySelector("#settings-rules-summary");
const settingsRulesTrack = document.querySelector("#settings-rules-track");
const volumeSlider = document.querySelector("#volume-slider");

const bgmTracks = Object.freeze({
  // Temporary local music files. Replace the mp3 files later if a better pair is picked.
  menu: "assets/audio/menu-bgm.mp3",
  game: "assets/audio/game-bgm.mp3"
});
const pathSlots = Array.from({length: 21}, (_, index) => index).filter(index => index !== 10);
const dangerIcons = { FIRE: "F", LANDSLIDE: "L", SNAKES: "S", SPIDERS: "W", MUMMY: "M" };
const dangerArtFiles = Object.freeze({
  FIRE: "assets/danger/fire.jpg",
  LANDSLIDE: "assets/danger/landslide.jpg",
  SNAKES: "assets/danger/snake.jpg",
  SPIDERS: "assets/danger/spider.jpg",
  MUMMY: "assets/danger/mummy.jpg"
});
const artifactArtFiles = Object.freeze({
  1: "assets/artifact/artifact-1.jpg",
  2: "assets/artifact/artifact-2.jpg",
  3: "assets/artifact/artifact-3.jpg",
  4: "assets/artifact/artifact-4.jpg",
  5: "assets/artifact/artifact-5.jpg"
});

// These are only visual roles. They do not change score rules, because adding
// powers would make the game harder to explain and harder to test.
const characterLibrary = Object.freeze([
  {id: "scout", name: "Sun Scout", note: "balanced explorer"},
  {id: "torch", name: "Torch Keeper", note: "carries a flame"},
  {id: "map", name: "Map Reader", note: "holds the cave map"},
  {id: "drummer", name: "Stone Drummer", note: "carries a small drum"},
  {id: "guard", name: "Temple Guard", note: "wears a tall guard helm"},
  {id: "healer", name: "Gem Healer", note: "marked with a healing cross"},
  {id: "runner", name: "Cave Runner", note: "has a faster running pose"},
  {id: "scribe", name: "Moon Scribe", note: "carries a writing reed"}
]);

// Browser state for the current play session.
// This is deliberately separate from TempleTreasure.js. The pure rule module
// is like the "backend" part; this object is the live browser/controller part.
const state = {
  round: 1,
  phase: "menu",
  deck: [],
  revealed: [],
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
  lastRoll: null,
  routePosition: -1,
  routeMarkerColor: null,
  routeMarkerCharacter: null,
  gameMode: "bots",
  localPlayerCount: 2,
  localNames: [],
  localCharacters: characterLibrary.slice(0, 4).map(character => character.id),
  localChoiceQueue: [],
  localChoiceIndex: 0,
  soundOn: true,
  volume: 60,
  audioElement: null,
  audioMode: "menu",
  pausedPhase: null,
  roundStartTent: {},
  localChoicePromptOpen: false
};

function showScreen(id) {
  // Only one screen is visible at a time: menu, rules, game or final ranking.
  if (id !== "game-screen") clearGameOverlays();
  screens.forEach(screen => screen.classList.toggle("active", screen.id === id));
  switchBackgroundMusic(id === "game-screen" ? "game" : "menu");
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
  // The pure API creates the normal player records. The browser layer then adds
  // the selected character, because characters are visual rather than rules.
  const players = createGamePlayers({
    mode: state.gameMode,
    count: state.localPlayerCount,
    names: state.localNames
  });
  const chosenCharacters = state.gameMode === "local"
    ? state.localCharacters
    : characterLibrary.slice(0, 4).map(character => character.id);
  return players.map((player, index) => ({
    ...player,
    character: chosenCharacters[index] || characterLibrary[index % characterLibrary.length].id
  }));
}

function startGame(mode = state.gameMode) {
  // Starting a new game resets all rule state, not just the visible board.
  clearTimer();
  ensureBackgroundSound();
  state.gameMode = mode;
  state.round = 1;
  state.artifactPool = [...ARTIFACT_NUMBERS];
  state.dangerPool = Object.fromEntries(DANGER_NAMES.map(name => [name, 3]));
  state.players = createPlayers();
  state.roundStartPlayer = 0;
  state.lastRoll = null;
  showScreen("game-screen");
  startRound();
}

function startRound() {
  // A round starts by building a fresh deck and charging each explorer's deposit.
  state.phase = "round-start";
  state.localChoicePromptOpen = false;
  state.deck = buildDeck();

  // The route is stored as fixed slots, not as a simple growing list. That makes
  // the dice mechanic possible: landing on slot 6 always means the same board
  // space, even if other cards were opened earlier.
  state.revealed = emptyRoute();
  state.routePosition = -1;
  state.routeMarkerColor = null;
  state.routeMarkerCharacter = null;
  state.dangerCounts = {};
  state.playerChoice = null;
  state.currentTurn = state.roundStartPlayer % state.players.length;
  state.players = preparePlayersForRound(state.players);
  state.roundStartTent = Object.fromEntries(state.players.map(player => [player.id, player.tent]));
  state.currentTurn = nextActivePlayerIndex(state.currentTurn - 1);
  renderAll();
  showResult(
    `ROUND ${state.round}`,
    "Each explorer pays one blue gem from their starting fund to enter the cave. Safe explorers recover it; explorers caught by danger lose that point.",
    "",
    "ENTER THE CAVE",
    () => {
      hideResult();
      setReadyToReveal();
    },
    {showMenuButton: true}
  );
}

function renderAll() {
  // This is the small "refresh the whole game UI" helper after rule state changes.
  renderRoundTabs();
  renderPlayers();
  renderInventory();
  renderBoard();
  updatePauseButton();
  roundLabel.textContent = `ROUND ${state.round}`;
}

function updatePauseButton() {
  const locked = ["rolling", "revealing", "resolving"].includes(state.phase);
  pauseButton.disabled = locked;
  pauseButton.classList.toggle("locked", locked);
  pauseButton.title = locked ? "Pause is available after this animation." : "";
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
  state.players.forEach(player => {
    const panel = document.querySelector(`#player-${player.id}`);
    if (!panel) return;
    const activeTurn = player.id === highlightedPlayerId();
    panel.className = `player-panel player-${player.color}${player.active ? "" : " out"}${player.dropped ? " dropped" : ""}${activeTurn ? " current-player" : ""}`;
    const revealChoice = state.phase === "resolving";
    const choiceText = revealChoice && player.choice === "continue" ? "KEEP EXPLORING" : revealChoice && player.choice === "leave" ? "RETURN TO TENT" : "";
    const choiceClass = player.choice ? ` choice-${player.choice}` : "";
    panel.innerHTML = `
      <h3>${player.name}</h3>
      <div class="tent" aria-hidden="true"><img src="assets/tent-${player.color}.png" alt=""></div>
      ${createCharacterFigure(player.character, player.color, "panel-character")}
      <p><b>TENT WEALTH: HIDDEN</b></p>
      <p class="round-loot">ROUND LOOT ${player.roundLoot}</p>
      <span class="choice-badge${choiceClass}">${player.dropped ? "LEFT GAME" : player.active ? choiceText : "RETURNED TO TENT"}</span>
    `;
  });
}

function highlightedPlayerId() {
  // The glow follows either the explorer rolling the dice or the explorer
  // currently making a private local choice.
  if (state.phase === "decision" && state.gameMode === "local") {
    return state.localChoiceQueue[state.localChoiceIndex]?.id;
  }
  if (["ready", "rolling", "revealing"].includes(state.phase)) {
    return state.players[state.currentTurn]?.id;
  }
  return null;
}

function renderInventory() {
  const player = inventoryPlayer();
  if (!player) {
    inventoryEl.innerHTML = "";
    return;
  }
  const artifactText = player.artifacts.length
    ? player.artifacts.map(artifact => `#${artifact.number} +${artifact.points}`).join(" ")
    : "NONE";
  if (shouldHideInventory()) {
    inventoryEl.innerHTML = `
      <div class="inventory-title"><span>PLAYER PACK</span></div>
      <div class="inventory-private">Private until the choice step.</div>
    `;
    return;
  }
  inventoryEl.innerHTML = `
    <div class="inventory-title">
      <span>${player.name}'S PACK</span>
      <details class="pack-help">
        <summary aria-label="Explain Your Pack">?</summary>
        <div>
          <p><b>Saved Total</b> is treasure already stored in the tent. It cannot be lost.</p>
          <p><b>Artifacts</b> are relic bonuses you have safely claimed.</p>
          <p><b>Current Round</b> is this round's gain. It shows -1 if the entry deposit is lost to danger.</p>
        </div>
      </details>
    </div>
    <div class="inventory-row"><span>SAVED TOTAL</span><strong>${player.tent}</strong></div>
    <div class="inventory-row artifacts"><span>ARTIFACTS</span><strong>${artifactText}</strong></div>
    <div class="inventory-current"><span>CURRENT ROUND</span><strong>${currentRoundPackTotal(player)}</strong></div>
  `;
}

function currentRoundPackTotal(player) {
  if (player.active) return player.roundLoot;
  const roundStart = state.roundStartTent[player.id] || 0;
  return player.tent - roundStart;
}

function inventoryPlayer() {
  if (state.gameMode === "local" && state.phase === "decision") {
    return state.localChoiceQueue[state.localChoiceIndex] || null;
  }
  return state.players.find(player => player.id === "you") || state.players[0] || null;
}

function shouldHideInventory() {
  return state.gameMode === "local"
    && (state.localChoicePromptOpen || ["ready", "rolling", "revealing", "resolving"].includes(state.phase));
}

function renderBoard() {
  // Twenty fixed card spaces. The dice moves through them in reading order.
  boardEl.innerHTML = "";
  for (let index = 0; index < 21; index += 1) {
    const slot = document.createElement("div");
    const pathIndex = pathSlots.indexOf(index);
    slot.className = `board-slot${pathIndex >= 0 ? " path" : " pack-space"}`;
    if (pathIndex === state.routePosition) slot.classList.add("current");

    if (pathIndex >= 0) {
      const card = state.revealed[pathIndex];
      if (card) {
        slot.append(createCardElement(card));
      } else {
        const back = document.createElement("div");
        back.className = "card back";
        slot.append(back);
      }
      if (pathIndex === 0 && state.routePosition < 0) {
        // The flag disappears naturally after the first move, because
        // routePosition changes from -1 to an actual slot.
        const flag = document.createElement("span");
        flag.className = "start-flag";
        flag.textContent = "START";
        slot.append(flag);
      }
      if (pathIndex === state.routePosition) {
        const marker = document.createElement("span");
        marker.className = "route-marker";
        marker.innerHTML = createCharacterFigure(state.routeMarkerCharacter || "scout", state.routeMarkerColor || "red", "walker-character");
        slot.append(marker);
      }
    }
    boardEl.append(slot);
  }
}

function emptyRoute() {
  // Null means this route slot is still face down. Open cards keep their exact slot.
  return Array.from({length: pathSlots.length}, () => null);
}

function revealedCards() {
  // Settlement functions only care about opened cards, so null route spaces are
  // removed before calling the pure rules API.
  return state.revealed.filter(Boolean);
}

function createCardElement(card) {
  // Cards are built in one place so the board and reveal animation always match.
  const el = document.createElement("div");
  el.className = `card ${card.type}`;
  if (card.type === "treasure") {
    el.innerHTML = `
      <div class="card-type">TREASURE</div>
      ${createGemCluster(card.value, "card-gem-cluster")}
      <div class="card-value">${card.value}</div>
      ${createLeftoverGems(card.leftover || 0)}
    `;
  } else if (card.type === "danger") {
    el.innerHTML = `
      <img class="danger-card-image full-card-image" src="${dangerArtFiles[card.name]}" alt="${card.name} danger">
    `;
  } else {
    el.innerHTML = `
      <img class="artifact-card-image full-card-image" src="${artifactArtFiles[card.number]}" alt="Artifact ${card.number}, ${card.value} points">
      ${card.claimed ? `<span class="artifact-claimed-badge" aria-label="Artifact already claimed">CLAIMED</span>` : ""}
    `;
  }
  return el;
}

function gemBreakdown(value) {
  // One visual rule is used everywhere: yellow = 10, black = 5, blue = 1.
  // That keeps the large reveal, flying gems and small board cards consistent.
  const gems = [];
  let remaining = value;
  while (remaining >= 10) {
    gems.push("yellow");
    remaining -= 10;
  }
  while (remaining >= 5) {
    gems.push("black");
    remaining -= 5;
  }
  while (remaining > 0) {
    gems.push("blue");
    remaining -= 1;
  }
  return gems;
}

function createGemCluster(value, className) {
  return `
    <div class="${className}" aria-label="${value} treasure shown as gems">
      ${gemBreakdown(value).map(color => `<i class="gem gem-${color}"></i>`).join("")}
    </div>
  `;
}

function createLeftoverGems(value) {
  if (!value) return "";
  return `
    <span class="card-leftover-gems" aria-label="${value} treasure left on this card">
      ${gemBreakdown(value).map(color => `<i class="gem gem-${color}"></i>`).join("")}
    </span>
  `;
}

function setReadyToReveal() {
  // A card is no longer revealed automatically. The active explorer rolls the
  // dice first, which gives the player time to read the screen and understand
  // whose turn is happening.
  const explorer = ensureCurrentTurnActive();
  if (!explorer) {
    diceButton.classList.add("hidden");
    endRoundSafely("All remaining explorers left or returned.");
    return;
  }
  state.phase = "ready";
  state.lastRoll = null;
  decisionPanel.dataset.phase = "ready";
  updatePauseButton();
  decisionKicker.textContent = "READY TO EXPLORE";
  turnText.textContent = `${explorer.name} ROLLS THE DICE`;
  decisionTitle.textContent = "KEEP EXPLORING";
  decisionCopy.textContent = "Roll the dice to move along the cave path. Hidden landing spots reveal a card.";
  timerValue.textContent = "08";
  continueButton.classList.add("hidden");
  leaveButton.classList.add("hidden");
  quitPlayerButton.classList.toggle("hidden", state.gameMode !== "local");
  revealCountdown.textContent = "";
  diceButton.dataset.roll = "ready";
  diceButton.classList.remove("hidden", "rolling");
  diceButton.disabled = shouldAutoRoll(explorer);
  renderPlayers();
  renderInventory();
  if (shouldAutoRoll(explorer)) {
    window.setTimeout(rollDiceAndReveal, 900);
  }
}

function shouldAutoRoll(explorer) {
  // Bot turns still roll by themselves, but only after the player sees who is
  // acting. Local multiplayer leaves every roll to the person holding the device.
  return state.gameMode === "bots" && explorer?.isBot;
}

function rollDiceAndReveal() {
  if (state.phase !== "ready") return;
  const explorer = ensureCurrentTurnActive();
  if (!explorer) {
    diceButton.classList.add("hidden");
    endRoundSafely("All remaining explorers left or returned.");
    return;
  }
  state.phase = "rolling";
  decisionPanel.dataset.phase = "rolling";
  updatePauseButton();
  diceButton.disabled = true;
  diceButton.classList.add("rolling");
  state.lastRoll = 1 + Math.floor(Math.random() * 6);

  // CSS reads data-roll and turns the dice cube to the correct final face.
  diceButton.dataset.roll = String(state.lastRoll);
  turnText.textContent = `${explorer.name} ROLLED ${state.lastRoll}`;
  renderPlayers();
  renderInventory();
  window.setTimeout(() => revealCard(state.lastRoll), 2100);
}

function revealCard(steps = 1) {
  // The dice moves the explorer one route slot at a time before any card flips.
  if (state.phase !== "rolling") return;
  if (!state.deck.length && state.revealed.every(Boolean)) {
    endRoundSafely("The cave has been fully explored!");
    return;
  }
  state.routeMarkerColor = state.players[state.currentTurn]?.color || "red";
  state.routeMarkerCharacter = state.players[state.currentTurn]?.character || "scout";
  let moved = 0;
  const stepDelay = 520;

  const walkOneSlot = () => {
    if (state.phase !== "rolling") return;
    state.routePosition = (state.routePosition + 1 + pathSlots.length) % pathSlots.length;
    moved += 1;
    renderBoard();

    // A visible delay is useful here. If it is too fast, the dice mechanic feels
    // like an automatic card draw again.
    if (moved < steps) {
      window.setTimeout(walkOneSlot, stepDelay);
      return;
    }
    revealLandedCard();
  };

  walkOneSlot();
}

function revealLandedCard() {
  state.phase = "revealing";
  decisionPanel.dataset.phase = "revealing";
  updatePauseButton();
  diceButton.classList.add("hidden");
  renderInventory();
  let card = state.revealed[state.routePosition];
  const newReveal = !card;

  // Revisited cards are shown again only. Hidden cards are the only ones that
  // change score, relics or danger counts.
  if (newReveal) {
    if (!state.deck.length) {
      endRoundSafely("No hidden cards remain in the cave.");
      return;
    }
    card = state.deck.pop();
    state.revealed[state.routePosition] = card;
  }
  renderBoard();
  state.currentTurn = nextActivePlayerIndex(state.currentTurn);
  showFeaturedCard(card, () => resolveRevealedCard(card, newReveal));
}

function resolveRevealedCard(card, newReveal = true) {
  // After the reveal animation, the real rule result is applied from TempleTreasure.js.
  renderBoard();
  if (!newReveal) {
    if (card.type === "treasure") {
      distributeTreasure(card, {accumulateLeftover: true});
      renderBoard();
    } else if (card.type === "danger") {
      turnText.textContent = `DANGER AGAIN: ${card.name}`;
      renderPlayers();
      renderInventory();
      failRound(card.name);
      return;
    }
    turnText.textContent = `REVISITED: ${cardLabel(card)}`;
    renderPlayers();
    renderInventory();
    beginDecision();
    return;
  }
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
  beginDecision();
}

function cardLabel(card) {
  if (card.type === "treasure") return `TREASURE ${card.value}`;
  if (card.type === "danger") return `${card.name} DANGER`;
  return `RELIC ${card.number}`;
}

function showFeaturedCard(card, onComplete) {
  // The big centre card is only presentation; the actual card is already in state.
  // Treasure cards also show small gems flying into the card so the value is
  // readable before the card shrinks back to the board.
  featuredCard.replaceChildren(createCardElement(card));
  flyingGems.replaceChildren();
  if (card.type === "treasure") createFlyingGems(card.value);
  featuredCardLabel.textContent = card.type === "treasure"
    ? `TREASURE ${card.value}`
    : card.type === "danger"
      ? `${card.name} DANGER`
      : `RELIC ${card.number} - ${card.value} POINTS`;
  cardRevealStage.classList.remove("hidden", "flying");
  featuredCard.getAnimations().forEach(animation => animation.cancel());

  window.setTimeout(() => {
    cardRevealStage.classList.add("flying");
    featuredCard.animate(
      [
        { transform: "translate(-50%, -50%) scale(1)", opacity: 1 },
        { transform: "translate(-50%, -50%) scale(.22)", opacity: 0 }
      ],
      { duration: 520, easing: "cubic-bezier(.4,0,.8,.2)", fill: "forwards" }
    );
  }, 4000);

  window.setTimeout(() => {
    cardRevealStage.classList.add("hidden");
    cardRevealStage.classList.remove("flying");
    featuredCard.replaceChildren();
    flyingGems.replaceChildren();
    onComplete();
  }, 4550);
}

function createFlyingGems(value) {
  // Use the same value breakdown as the treasure card itself.
  const gems = gemBreakdown(value);
  gems.forEach((color, index) => {
    const gem = document.createElement("span");
    gem.className = `gem gem-${color} flying-gem`;
    gem.style.setProperty("--gem-angle", `${index * 47}deg`);
    gem.style.setProperty("--gem-delay", `${index * 70}ms`);
    flyingGems.append(gem);
  });
}

function distributeTreasure(card, {accumulateLeftover = false} = {}) {
  // The pure API is called here, then the updated leftover value is copied back to the card.
  const previousLeftover = card.leftover || 0;
  const result = applyTreasureDistribution(state.players, card);
  state.players = result.players;
  Object.assign(card, result.card, {
    leftover: (accumulateLeftover ? previousLeftover : 0) + (result.card.leftover || 0)
  });
  renderInventory();
}

function beginDecision() {
  // In local multiplayer each explorer chooses in turn on the same screen.
  // All choices are still revealed together so nobody's choice is shown early.
  state.phase = "decision";
  state.localChoicePromptOpen = false;
  state.seconds = 8;
  updatePauseButton();
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
  diceButton.classList.add("hidden");
  quitPlayerButton.classList.toggle("hidden", state.gameMode !== "local");
  continueButton.disabled = isSpectating;
  leaveButton.disabled = isSpectating;
  quitPlayerButton.disabled = isSpectating || state.gameMode !== "local";
  continueButton.classList.toggle("locked", isSpectating);
  leaveButton.classList.toggle("locked", isSpectating);
  revealCountdown.textContent = "";
  timerValue.textContent = String(state.seconds).padStart(2, "0");
  timerRing.style.borderTopColor = "var(--red)";
  renderPlayers();
  clearTimer();
  if (state.gameMode === "local") {
    // The queue is rebuilt each time because some players may already have
    // returned to tent or quit the match.
    decisionPanel.dataset.phase = "decision";
    decisionKicker.textContent = "PRIVATE CHOICE";
    state.localChoiceQueue = state.players.filter(player => player.active);
    state.localChoiceIndex = 0;
    promptLocalChoiceTurn();
    return;
  }
  startBotChoiceTimer();
}

function startBotChoiceTimer() {
  // This countdown is kept separate so pausing can stop and resume it cleanly.
  clearTimer();
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
    continueLocalChoiceFlow();
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

function continueLocalChoiceFlow() {
  if (state.localChoiceIndex >= state.localChoiceQueue.length) {
    decisionCopy.textContent = "All choices are locked.";
    window.setTimeout(resolveChoices, 350);
    return;
  }
  promptLocalChoiceTurn();
}

function quitCurrentLocalPlayer() {
  // Quitting removes the explorer from the whole match. Returning to tent only
  // leaves the current round, so this is a separate local multiplayer action.
  if (state.gameMode !== "local") return;
  const player = currentLocalPlayerForQuit();
  if (!player || player.dropped) return;
  clearTimer();
  player.dropped = true;

  // Dropped means "out of the match", while active=false only means "not inside
  // the cave right now". Keeping both flags avoids mixing up quit and return.
  player.active = false;
  player.roundLoot = 0;
  player.choice = null;
  quitPlayerButton.disabled = true;
  if (state.phase === "ready" || state.phase === "rolling") {
    diceButton.classList.add("hidden");
    state.phase = "ready";
    if (!activeExplorers().length) {
      endRoundSafely("All remaining explorers left or returned.");
      return;
    }
    state.currentTurn = nextActivePlayerIndex(state.currentTurn);
    renderPlayers();
    setReadyToReveal();
    return;
  }
  if (state.phase === "decision") {
    state.localChoiceQueue = state.localChoiceQueue.filter(queued => !queued.dropped && queued.active);
    if (state.localChoiceIndex >= state.localChoiceQueue.length) {
      if (!activeExplorers().length) {
        endRoundSafely("All remaining explorers left or returned.");
        return;
      }
      window.setTimeout(resolveChoices, 250);
    } else {
      promptLocalChoiceTurn();
    }
    renderPlayers();
  }
}

function currentLocalPlayerForQuit() {
  if (state.phase === "decision") {
    return state.localChoiceQueue[state.localChoiceIndex];
  }
  if (state.phase === "ready" || state.phase === "rolling") {
    return state.players[state.currentTurn];
  }
  return null;
}

function activeExplorers() {
  return state.players.filter(player => player.active && !player.dropped);
}

function promptLocalChoiceTurn() {
  const player = state.localChoiceQueue[state.localChoiceIndex];
  if (!player || state.phase !== "decision") return;
  state.localChoicePromptOpen = true;
  renderPlayers();
  renderInventory();
  showResult(
    "PASS THE DEVICE",
    `Hand the screen to ${player.name}. Their pack and choice will appear together after they confirm.`,
    "",
    `${player.name} IS READY`,
    () => {
      state.localChoicePromptOpen = false;
      hideResult();
      beginLocalChoiceTurn();
    }
  );
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
  quitPlayerButton.disabled = false;
  quitPlayerButton.classList.remove("hidden");
  continueButton.classList.remove("locked");
  leaveButton.classList.remove("locked");
  timerValue.textContent = "08";
  clearTimer();
  startLocalChoiceTimer();
  renderPlayers();
  renderInventory();
}

function startLocalChoiceTimer() {
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
  const artifactOnBoard = revealedCards().some(card => card.type === "artifact" && !card.claimed);
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
  updatePauseButton();
  continueButton.classList.add("hidden");
  leaveButton.classList.add("hidden");
  quitPlayerButton.classList.add("hidden");
  choiceResults.innerHTML = "";

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

  if (state.gameMode === "local") {
    await showChoicesRevealPrompt();
  }

  choiceResults.innerHTML = state.players.map(player => {
    if (player.dropped) {
      return `
        <div class="choice-result camp">
          <strong>${player.name}</strong>
          <span>LEFT GAME</span>
        </div>
      `;
    }
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
  choiceRevealStage.classList.remove("hidden", "show-results");
  choiceRevealStage.classList.add("show-results");
  await delay(2400);
  choiceRevealStage.classList.add("hidden");
  choiceRevealStage.classList.remove("show-results");

  const leaving = state.players.filter(player => player.active && player.choice === "leave");
  const returnSummaries = leaving.length ? settleLeavingPlayers(leaving) : [];

  const active = activeExplorers();
  if (!active.length) {
    showReturnSummaries(returnSummaries, () => endRoundSafely("All explorers returned safely!"));
    return;
  }

  state.players.forEach(player => {
    if (player.active) player.choice = null;
  });
  renderPlayers();
  renderInventory();
  showReturnSummaries(returnSummaries, setReadyToReveal);
}

function delay(milliseconds) {
  return new Promise(resolve => window.setTimeout(resolve, milliseconds));
}

function showChoicesRevealPrompt() {
  return new Promise(resolve => {
    showResult(
      "PASS TO EVERYONE",
      "Turn the screen so everyone can see this round's choices.",
      "",
      "SHOW CHOICES",
      () => {
        hideResult();
        resolve();
      }
    );
  });
}

function settleLeavingPlayers(leaving) {
  // Leaving players are resolved by the module, including leftover gems and relics.
  const beforeById = Object.fromEntries(state.players.map(player => [
    player.id,
    {
      tent: player.tent
    }
  ]));
  const result = settleReturningPlayers(
    state.players,
    revealedCards(),
    leaving.map(player => player.id)
  );
  const openPositions = state.revealed
    .map((card, index) => card ? index : -1)
    .filter(index => index >= 0);

  // The pure API returns a compact list of opened cards. This remaps those
  // updated cards back into their original board slots.
  state.players = result.players;
  result.revealed.forEach((card, index) => {
    state.revealed[openPositions[index]] = card;
  });
  ensureCurrentTurnActive();
  renderBoard();
  renderPlayers();
  renderInventory();
  return leaving.map(player => {
    const updated = state.players.find(candidate => candidate.id === player.id);
    const before = beforeById[player.id] || {tent: 0, total: 0};
    return {
      id: player.id,
      name: updated?.name || player.name,
      roundGain: Math.max(0, (updated?.tent || 0) - before.tent)
    };
  });
}

function showReturnSummaries(summaries, onComplete) {
  const returned = summaries.filter(summary => summary.roundGain >= 0);
  if (!returned.length) {
    onComplete?.();
    return;
  }
  showResult(
    "SAFE RETURN",
    "These explorers returned to the tent this round.",
    `
      <div class="return-summary">
        ${returned.map(summary => `
          <span><small>${summary.name}</small><strong>+${summary.roundGain}</strong></span>
        `).join("")}
      </div>
    `,
    "CONTINUE",
    () => {
      hideResult();
      onComplete?.();
    }
  );
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
    `<div class="danger-impact-text">THE CAVE STRIKES BACK</div>`,
    state.round === 5 ? "REVEAL FINAL WEALTH" : "NEXT ROUND",
    finishRound,
    {variant: "danger-result"}
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
    "",
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
  // The final score is split into secured gem points and relic icons for a clearer result page.
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
    if (state.players[index].active && !state.players[index].dropped) return index;
  }
  return fromIndex;
}

function ensureCurrentTurnActive() {
  const current = state.players[state.currentTurn];
  if (current?.active && !current.dropped) return current;
  state.currentTurn = nextActivePlayerIndex(state.currentTurn);
  const next = state.players[state.currentTurn];
  return next?.active && !next.dropped ? next : null;
}

function showResult(title, message, details, buttonText, action, options = {}) {
  // One overlay is reused for round starts, pass-device messages and end-round results.
  overlay.classList.remove("danger-result");
  if (options.variant) overlay.classList.add(options.variant);
  overlayTitle.textContent = title;
  overlayMessage.textContent = message;
  overlayDetails.innerHTML = details;
  overlayButton.textContent = buttonText;
  overlayMenuButton.classList.toggle("hidden", !options.showMenuButton);
  state.pendingAction = action;
  overlay.classList.remove("hidden");
}

function hideResult() {
  overlay.classList.add("hidden");
  overlay.classList.remove("danger-result");
  overlayMenuButton.classList.add("hidden");
}

function clearTimer() {
  // Timers are cleared before changing phase so old countdowns do not keep firing.
  if (state.timer) window.clearInterval(state.timer);
  state.timer = null;
}

function updatePlayerNameFields() {
  // The visible name boxes always match the selected player count. Empty boxes
  // keep a placeholder instead of pretending to be bot names.
  const count = Number(playerCountSelect.value);
  state.localPlayerCount = count;
  localNameInputs.forEach((input, index) => {
    input.closest("label").classList.toggle("hidden", index >= count);
  });
  localCharacterSelects.forEach((select, index) => {
    select.closest("label").classList.toggle("hidden", index >= count);
  });
}

function leaveGameForMenu() {
  clearTimer();
  clearGameOverlays();
  diceButton.classList.add("hidden");
  quitPlayerButton.classList.add("hidden");
  showScreen("menu-screen");
}

function clearGameOverlays() {
  state.localChoicePromptOpen = false;
  hideResult();
  pauseOverlay.classList.add("hidden");
  settingsOverlay.classList.add("hidden");
  settingsRulesSummary.classList.add("hidden");
  choiceRevealStage.classList.add("hidden");
  choiceRevealStage.classList.remove("show-results");
  document.querySelector("#game-screen")?.classList.remove("paused");
  state.pausedPhase = null;
}

function setSound(enabled) {
  state.soundOn = enabled;
  const label = enabled ? "SOUND ON" : "SOUND OFF";
  soundButton.textContent = label;
  settingsSoundButton.textContent = label;
  if (enabled) ensureBackgroundSound();
  else stopBackgroundSound();
}

function switchBackgroundMusic(mode) {
  state.audioMode = mode;
  if (state.soundOn) ensureBackgroundSound(mode);
}

function ensureBackgroundSound(mode = state.audioMode) {
  if (!state.soundOn) return;
  const track = bgmTracks[mode] || bgmTracks.menu;
  if (state.audioElement?.dataset.track === mode) {
    updateBackgroundVolume();
    state.audioElement.play().catch(() => {});
    return;
  }
  stopBackgroundSound();
  const audio = new Audio(track);
  audio.loop = true;
  audio.dataset.track = mode;
  state.audioElement = audio;
  updateBackgroundVolume();
  audio.play().catch(() => {});
}

function stopBackgroundSound() {
  state.audioElement?.pause();
  if (state.audioElement) state.audioElement.currentTime = 0;
  state.audioElement = null;
}

function updateBackgroundVolume() {
  if (state.audioElement) state.audioElement.volume = (state.volume / 100) * 0.45;
}

function pauseGame() {
  if (state.phase === "game-over") return;
  if (["rolling", "revealing", "resolving"].includes(state.phase)) return;
  state.pausedPhase = state.phase;
  clearTimer();
  diceButton.classList.add("hidden");
  document.querySelector("#game-screen").classList.add("paused");
  pauseOverlay.classList.remove("hidden");
}

function resumeGame() {
  pauseOverlay.classList.add("hidden");
  document.querySelector("#game-screen").classList.remove("paused");
  if (state.phase === "ready") {
    diceButton.classList.remove("hidden");
  }
  if (state.phase === "decision") {
    if (state.gameMode === "local") startLocalChoiceTimer();
    else startBotChoiceTimer();
  }
  state.pausedPhase = null;
}

document.querySelector("#solo-button").addEventListener("click", () => startGame("bots"));
document.querySelector("#room-button").addEventListener("click", () => showScreen("room-screen"));
document.querySelector("#rules-button").addEventListener("click", () => showScreen("rules-screen"));
document.addEventListener("pointerdown", () => ensureBackgroundSound(), {once: true});
document.querySelectorAll("[data-back]").forEach(button => {
  button.addEventListener("click", () => showScreen(button.dataset.back));
});
document.querySelector("#start-local-button").addEventListener("click", () => {
  state.localPlayerCount = Number(playerCountSelect.value);
  state.localNames = localNameInputs.slice(0, state.localPlayerCount).map((input, index) => input.value.trim() || `PLAYER ${index + 1}`);
  state.localCharacters = localCharacterSelects.slice(0, state.localPlayerCount).map(select => select.value);
  startGame("local");
});
playerCountSelect.addEventListener("change", updatePlayerNameFields);
document.querySelector("#leave-game-button")?.addEventListener("click", leaveGameForMenu);
document.querySelector("#fullscreen-button").addEventListener("click", () => {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
  else document.exitFullscreen?.();
});
soundButton.addEventListener("click", () => setSound(!state.soundOn));
settingsSoundButton.addEventListener("click", () => setSound(!state.soundOn));
volumeSlider.addEventListener("input", event => {
  state.volume = Number(event.currentTarget.value);
  updateBackgroundVolume();
});
pauseButton.addEventListener("click", pauseGame);
document.querySelector("#resume-button").addEventListener("click", resumeGame);
document.querySelector("#pause-menu-button").addEventListener("click", leaveGameForMenu);
document.querySelector("#settings-button").addEventListener("click", () => {
  diceButton.classList.add("hidden");
  settingsOverlay.classList.remove("hidden");
});
document.querySelector("#close-settings-button").addEventListener("click", () => {
  settingsOverlay.classList.add("hidden");
  settingsRulesSummary.classList.add("hidden");
  if (state.phase === "ready") diceButton.classList.remove("hidden");
});
document.querySelector("#settings-rules-button").addEventListener("click", () => {
  settingsRulesSummary.classList.toggle("hidden");
});
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
quitPlayerButton.addEventListener("click", quitCurrentLocalPlayer);
diceButton.addEventListener("click", rollDiceAndReveal);
overlayMenuButton.addEventListener("click", leaveGameForMenu);
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
buildSettingsRules();
buildCharacterSelectors();
updatePlayerNameFields();
setSound(true);

function buildCharacterSelectors() {
  // The same eight small explorer designs are used in setup, tents and walkers.
  localCharacterSelects.forEach((select, playerIndex) => {
    select.innerHTML = characterLibrary.map((character, characterIndex) => `
      <option value="${character.id}"${characterIndex === playerIndex ? " selected" : ""}>${character.name}</option>
    `).join("");
    const preview = document.createElement("div");
    preview.className = "character-preview";

    // The preview is created in JavaScript because the character options are
    // also created in JavaScript. That keeps the setup HTML shorter.
    select.insertAdjacentElement("afterend", preview);
    select.addEventListener("change", () => updateCharacterPreview(select));
    updateCharacterPreview(select);
  });
}

function updateCharacterPreview(select) {
  const character = characterLibrary.find(item => item.id === select.value) || characterLibrary[0];
  const label = select.closest("label");
  const preview = label.querySelector(".character-preview");
  const playerIndex = localCharacterSelects.indexOf(select);
  const colors = ["red", "blue", "gold", "purple"];
  preview.innerHTML = `
    ${createCharacterFigure(character.id, colors[playerIndex] || "red", "setup-character")}
    <span><b>${character.name}</b><small>${character.note}</small></span>
  `;
}

function createCharacterFigure(characterId, color, extraClass = "") {
  const safeCharacter = characterLibrary.some(character => character.id === characterId)
    ? characterId
    : "scout";
  return `
    <span class="character-figure character-${safeCharacter} character-${color} ${extraClass}" aria-hidden="true">
      <i class="char-shadow"></i>
      <i class="char-leg left-leg"></i>
      <i class="char-leg right-leg"></i>
      <i class="char-body"></i>
      <i class="char-arm left-arm"></i>
      <i class="char-arm right-arm"></i>
      <i class="char-head"></i>
      <i class="char-hat"></i>
      <i class="char-tool"></i>
    </span>
  `;
}

function buildSettingsRules() {
  // Settings reuses the same rule copy as the home How to Play page.
  // This avoids two different versions of the rules drifting apart.
  settingsRulesTrack.replaceChildren(...tutorialSlides.map(slide => {
    const item = document.createElement("article");
    item.className = "settings-rule-item";
    const copy = slide.querySelector(".tutorial-copy")?.cloneNode(true);
    if (copy) item.append(copy);
    return item;
  }));
}

function setupCaptureScene(scene) {
  // This path is used only for regenerating tutorial screenshots. Normal users
  // never enter it because the URL needs a ?capture=... query string.
  setSound(false);
  state.gameMode = "local";
  state.localPlayerCount = 4;
  state.localNames = ["YOU", "ATU", "MIRA", "CUSCO"];
  state.localCharacters = ["scout", "torch", "map", "guard"];
  state.players = createPlayers();
  state.dangerPool = Object.fromEntries(DANGER_NAMES.map(name => [name, 3]));
  state.artifactPool = [...ARTIFACT_NUMBERS];
  state.round = scene === "final" ? 5 : 1;
  state.currentTurn = 0;
  state.phase = "ready";
  state.deck = [];
  state.dangerCounts = {};
  state.revealed = captureRoute(scene);
  state.routePosition = lastOpenRoutePosition();
  state.players = preparePlayersForRound(state.players);
  if (scene === "choice") state.phase = "decision";
  if (scene === "final") {
    state.players[0].tent = 42;
    state.players[0].wallet = 4;
    state.players[0].artifacts = [{number: 4, points: 40}];
    state.players[1].tent = 23;
    state.players[1].wallet = 3;
    state.players[2].tent = 17;
    state.players[2].wallet = 2;
    state.players[3].dropped = true;
    showFinalRanking();
    return;
  }
  showScreen("game-screen");
  renderAll();
  decisionPanel.dataset.phase = scene === "choice" ? "decision" : "ready";
  decisionKicker.textContent = scene === "choice" ? "PRIVATE CHOICE" : "READY TO EXPLORE";
  decisionTitle.textContent = scene === "choice" ? "YOU" : "ROLL THE DICE";
  decisionCopy.textContent = scene === "choice" ? "Choose before passing the device." : "Click the dice to walk the cave path.";
  continueButton.classList.toggle("hidden", scene !== "choice");
  leaveButton.classList.toggle("hidden", scene !== "choice");
  quitPlayerButton.classList.toggle("hidden", scene !== "choice");
  diceButton.classList.toggle("hidden", scene === "choice");
  diceButton.dataset.roll = scene === "roll" ? "4" : "ready";
  timerValue.textContent = scene === "danger" ? "!!" : "08";
  turnText.textContent = captureTurnText(scene);
}

function captureRoute(scene) {
  const treasure = value => ({type: "treasure", value, leftover: 0});
  const danger = name => ({type: "danger", name});
  const relic = number => ({
    type: "artifact",
    number,
    value: number * 10,
    claimed: false
  });
  const route = emptyRoute();
  const cards = scene === "treasure"
    ? [treasure(7), treasure(11)]
    : scene === "choice"
      ? [treasure(9), danger("FIRE"), treasure(4)]
      : scene === "danger"
        ? [danger("FIRE"), treasure(5), danger("FIRE")]
        : scene === "relic"
          ? [treasure(7), relic(3), treasure(13)]
          : [];
  cards.forEach((card, index) => {
    route[index] = card;
  });
  return route;
}

function lastOpenRoutePosition() {
  for (let index = state.revealed.length - 1; index >= 0; index -= 1) {
    if (state.revealed[index]) return index;
  }
  return -1;
}

function captureTurnText(scene) {
  if (scene === "treasure") return "TREASURE IS SHARED";
  if (scene === "choice") return "CHOOSE SECRETLY";
  if (scene === "danger") return "DUPLICATE DANGER";
  if (scene === "relic") return "ONE RETURNER CAN CLAIM A RELIC";
  if (scene === "roll") return "YOU ROLLED 4";
  return "YOU ROLL THE DICE";
}

const captureScene = new URLSearchParams(window.location.search).get("capture");
if (captureScene) setupCaptureScene(captureScene);
else showScreen("menu-screen");
