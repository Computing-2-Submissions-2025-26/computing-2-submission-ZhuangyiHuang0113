/**
 * Rules engine for Temple Treasure.
 *
 * The browser layer handles artwork, timers and clicks. This file keeps the
 * board-game decisions in plain data so the same rules can be tested without a
 * page open.
 *
 * @module TempleTreasure
 */

/** @typedef {"continue"|"leave"} ExplorerChoice */
/** @typedef {"treasure"|"danger"|"artifact"} CardType */

/**
 * @typedef {Object} Explorer
 * @property {string} id Stable player identifier.
 * @property {string} name Display name.
 * @property {string} color Tent colour.
 * @property {number} tent Points secured in the tent.
 * @property {number} wallet Gems available for future deposits.
 * @property {number} roundLoot Unsecured points carried in the cave.
 * @property {Array<{number:number, points:number}>} artifacts Claimed relics.
 * @property {boolean} active Whether the explorer remains in the cave.
 * @property {boolean} dropped Whether the explorer has left the whole game.
 * @property {ExplorerChoice|null} choice Current secret choice.
 * @property {boolean} isBot Whether the UI should choose for this explorer.
 */

/**
 * @typedef {Object} GameCard
 * @property {CardType} type Card category.
 * @property {number} [value] Treasure or relic point value.
 * @property {number} [number] Printed relic number.
 * @property {number} [leftover] Treasure remaining on the route.
 * @property {boolean} [collected] Whether treasure has been taken from this card.
 * @property {string} [name] Danger name.
 * @property {boolean} [claimed] Whether a relic has been claimed.
 */

export const TREASURE_VALUES = Object.freeze([
    1, 2, 3, 4, 5, 5, 7, 7, 9, 11, 11, 13, 14, 15, 17
]);

// These strings are printed on the danger cards.
export const DANGER_NAMES = Object.freeze([
    "FIRE", "LANDSLIDE", "SNAKES", "SPIDERS", "MUMMY"
]);

// One relic enters each round; the number is also its score multiplier.
export const ARTIFACT_NUMBERS = Object.freeze([1, 2, 3, 4, 5]);

// Stable ids let local players rename themselves without breaking saved state.
const PLAYER_TEMPLATES = Object.freeze([
    {id: "you", name: "YOU", color: "red"},
    {id: "atu", name: "ATU", color: "blue"},
    {id: "mira", name: "MIRA", color: "gold"},
    {id: "cusco", name: "CUSCO", color: "purple"}
]);

const cloneExplorer = function (player) {
    // Clone nested relics so a later round cannot mutate an earlier state.
    return {
        ...player,
        artifacts: player.artifacts.map(function (artifact) {
            return {...artifact};
        })
    };
};

/**
 * Return a shuffled copy without modifying the source collection.
 *
 * @param {Array<*>} items Values to shuffle.
 * @param {Function} [random=Math.random] Number generator in the range [0, 1).
 * @returns {Array<*>} Shuffled copy.
 */
export const shuffle = function (items, random = Math.random) {
    const result = [...items];
    // Fisher-Yates keeps the API deterministic when tests pass fake randomness.
    let index = result.length - 1;
    while (index > 0) {
        const swapIndex = Math.floor(random() * (index + 1));
        [result[index], result[swapIndex]] = [
            result[swapIndex],
            result[index]
        ];
        index -= 1;
    }
    return result;
};

/**
 * Create explorers for a bot or same-device multiplayer game.
 *
 * @param {Object} [options] Player setup.
 * @param {"bots"|"local"} [options.mode="bots"] Game mode.
 * @param {number} [options.count=4] Number of local explorers.
 * @param {string[]} [options.names] Optional local display names.
 * @returns {Explorer[]} Fresh explorer records.
 */
export const createPlayers = function ({
    mode = "bots",
    count = 4,
    names = []
} = {}) {
    const playerCount = mode === "local" ? count : 4;
    return PLAYER_TEMPLATES.slice(0, playerCount).map(function (template, index) {
        return {
            ...template,
            name: mode === "local"
                ? (names[index] || `PLAYER ${index + 1}`)
                : template.name,
            // Starting gems count immediately; danger only leaves the deposit lost.
            tent: 4,
            wallet: 4,
            roundLoot: 0,
            artifacts: [],
            active: true,
            dropped: false,
            choice: null,
            isBot: mode === "bots" && index > 0
        };
    });
};

/**
 * Create the card deck for one expedition round.
 *
 * @param {Object} options Round setup.
 * @param {Object<string, number>} options.dangerPool Remaining danger counts.
 * @param {number|null} options.artifactNumber Relic added this round.
 * @param {Function} [options.random=Math.random] Shuffle generator.
 * @returns {GameCard[]} New shuffled round deck.
 */
export const createRoundDeck = function ({
    dangerPool,
    artifactNumber,
    random = Math.random
}) {
    const treasures = TREASURE_VALUES.map(function (value) {
        return {type: "treasure", value, leftover: 0, collected: false};
    });
    // Rebuild each round like the table version: remove retired dangers, then shuffle.
    const dangers = DANGER_NAMES.flatMap(function (name) {
        return Array.from(
            {length: dangerPool[name] || 0},
            function () {
                return {type: "danger", name};
            }
        );
    });
    const relics = artifactNumber === null || artifactNumber === undefined
        ? []
        : [{
            type: "artifact",
            number: artifactNumber,
            value: artifactNumber * 10,
            claimed: false
        }];
    return shuffle([...treasures, ...dangers, ...relics], random);
};

/**
 * Pay the deposit from the wallet and tent score, then reset explorer state.
 *
 * @param {Explorer[]} players Current explorers.
 * @param {Object} [options] Round setup.
 * @param {number} [options.round=1] Current round number.
 * @returns {Explorer[]} New explorer records ready for the round.
 */
export const preparePlayersForRound = function (players, {round = 1} = {}) {
    return players.map(function (player) {
        if (player.dropped || (round >= 5 && player.tent <= 0)) {
            // In round five, a player who cannot pay is out of the match.
            return {
                ...cloneExplorer(player),
                roundLoot: 0,
                active: false,
                dropped: player.dropped || round >= 5,
                choice: null
            };
        }
        return {
            ...cloneExplorer(player),
            // Entry deposit is paid up front and refunded only on safe return.
            tent: player.tent - 1,
            wallet: player.wallet - 1,
            roundLoot: 0,
            active: true,
            choice: null
        };
    });
};

/**
 * Add a treasure card's value to the unclaimed route pool.
 *
 * @param {Explorer[]} players Current explorers.
 * @param {GameCard} card Revealed treasure card.
 * @returns {{players: Explorer[], card: GameCard, share: number}} Distribution.
 */
export const distributeTreasure = function (players, card) {
    if (card.type !== "treasure") {
        return {
            players: players.map(cloneExplorer),
            card: {...card},
            share: 0
        };
    }
    // Treasure is public route value until a player returns to the tent.
    return {
        players: players.map(cloneExplorer),
        card: {
            ...card,
            leftover: (card.leftover || 0) + card.value,
            collected: false
        },
        share: 0
    };
};

const removeClaimedTreasure = function (card, amount) {
    if (card.type !== "treasure" || amount <= 0) {
        return {card: {...card}, remaining: amount};
    }
    const taken = Math.min(card.leftover || 0, amount);
    // Drain cards left to right so any remainder has one clear board position.
    return {
        card: {
            ...card,
            leftover: (card.leftover || 0) - taken,
            collected: true
        },
        remaining: amount - taken
    };
};

/**
 * Resolve explorers returning to their tents.
 *
 * Returning explorers share all route leftovers, recover their deposit in the
 * wallet and secure carried loot. A relic is claimed only if exactly one
 * explorer leaves.
 *
 * @param {Explorer[]} players Current explorers.
 * @param {GameCard[]} revealed Revealed route.
 * @param {string[]} leavingIds Explorers choosing to return.
 * @returns {{players: Explorer[], revealed: GameCard[], claimed: Array}}
 */
export const settleReturningPlayers = function (
    players,
    revealed,
    leavingIds
) {
    const leaving = new Set(leavingIds);
    const routeTreasure = revealed.reduce(function (total, card) {
        return total + (card.type === "treasure" ? (card.leftover || 0) : 0);
    }, 0);
    // Shared exits split evenly; indivisible treasure stays on the route.
    const share = leaving.size > 0
        ? Math.floor(routeTreasure / leaving.size)
        : 0;
    const claimRelics = leaving.size === 1;
    // Relics reward a solo return, not a group exit.
    const claimed = revealed.filter(function (card) {
        return claimRelics && card.type === "artifact" && !card.claimed;
    }).map(function (card) {
        return {number: card.number, points: card.value};
    });
    const relicPoints = claimed.reduce(function (total, artifact) {
        return total + artifact.points;
    }, 0);
    const updatedPlayers = players.map(function (player) {
        if (!leaving.has(player.id)) {
            return cloneExplorer(player);
        }
        return {
            ...cloneExplorer(player),
            tent: player.tent + player.roundLoot + share + 1 + (
                claimRelics
                    ? relicPoints
                    : 0
            ),
            wallet: Math.min(4, player.wallet + 1),
            roundLoot: 0,
            active: false,
            artifacts: claimRelics
                ? [...player.artifacts.map(function (artifact) {
                    return {...artifact};
                }), ...claimed]
                : player.artifacts.map(function (artifact) {
                    return {...artifact};
                })
        };
    });
    let claimedTreasure = share * leaving.size;
    const updatedRoute = revealed.map(function (card) {
        if (card.type === "treasure" && leaving.size > 0) {
            const result = removeClaimedTreasure(card, claimedTreasure);
            claimedTreasure = result.remaining;
            return result.card;
        }
        if (claimRelics && card.type === "artifact" && !card.claimed) {
            return {...card, claimed: true};
        }
        return {...card};
    });
    return {players: updatedPlayers, revealed: updatedRoute, claimed};
};

/**
 * Apply a duplicate danger failure.
 *
 * @param {Explorer[]} players Current explorers.
 * @param {Object<string, number>} dangerPool Remaining danger counts.
 * @param {string} dangerName Duplicated danger.
 * @param {Object} [options] Failure options.
 * @param {string[]} [options.removedDangerTypes=[]] Danger types already removed by earlier failures.
 * @param {number} [options.maxRemovedDangerTypes=2] Maximum danger types removed across the match.
 * @returns {{players: Explorer[], dangerPool: Object<string, number>, removedDangerTypes: string[]}}
 */
export const failRound = function (players, dangerPool, dangerName, {
    removedDangerTypes = [],
    maxRemovedDangerTypes = 2
} = {}) {
    const alreadyRemoved = removedDangerTypes.includes(dangerName);
    // Cap retired danger types so late rounds still have real risk.
    const shouldRemoveDanger = !alreadyRemoved
        && removedDangerTypes.length < maxRemovedDangerTypes;
    const nextRemovedDangerTypes = shouldRemoveDanger
        ? [...removedDangerTypes, dangerName]
        : [...removedDangerTypes];
    return {
        players: players.map(function (player) {
            return player.active
                ? {
                    ...cloneExplorer(player),
                    roundLoot: 0,
                    active: false
                }
                : cloneExplorer(player);
        }),
        // Later failures still end the round, but the pool stops shrinking.
        dangerPool: shouldRemoveDanger
            ? {
                ...dangerPool,
                [dangerName]: 0
            }
            : {...dangerPool},
        removedDangerTypes: nextRemovedDangerTypes
    };
};

/**
 * Return an explorer's final score.
 *
 * Initial gems, secured treasure and relic points live in the tent score.
 * Wallet gems only pay future deposits; they do not count again.
 *
 * @param {Explorer} player Explorer to score.
 * @returns {number} Final points.
 */
export const scorePlayer = function (player) {
    return player.tent;
};

/**
 * Rank explorers by score, breaking ties by number of relics.
 *
 * @param {Explorer[]} players Explorers to rank.
 * @returns {Explorer[]} New sorted collection.
 */
export const rankPlayers = function (players) {
    return [...players].sort(function (left, right) {
        return scorePlayer(right) - scorePlayer(left)
            || right.artifacts.length - left.artifacts.length;
    });
};

/**
 * Choose a bot action from visible risk and carried loot.
 *
 * @param {Explorer} player Bot explorer.
 * @param {Object} context Visible round information.
 * @param {Object<string, number>} context.dangerCounts Revealed dangers.
 * @param {boolean} context.artifactOnBoard Whether an unclaimed relic is shown.
 * @param {number} context.round Current round.
 * @param {Function} [context.random=Math.random] Random generator.
 * @returns {ExplorerChoice} Bot decision.
 */
export const chooseBotAction = function (player, {
    dangerCounts,
    artifactOnBoard,
    round,
    random = Math.random
}) {
    // Simple risk model for a cautious cave buddy.
    const pressure = Object.values(dangerCounts).filter(function (count) {
        return count === 1;
    }).length;
    // Keep this fuzzy; the bot should feel playable, not mathematically optimal.
    let leaveChance = 0.08 + pressure * 0.1
        + Math.min(player.roundLoot / 38, 0.5);
    leaveChance += artifactOnBoard ? 0.08 : 0;
    leaveChance += round === 5 ? 0.05 : 0;
    return random() < leaveChance ? "leave" : "continue";
};
