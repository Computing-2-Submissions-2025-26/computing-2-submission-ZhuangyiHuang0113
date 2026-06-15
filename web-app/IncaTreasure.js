/**
 * Pure game rules for Inca Treasure.
 *
 * This module is kept away from the DOM on purpose. The page can look different,
 * but these functions still describe the game itself. Every operation receives
 * data and returns new data, so a complete game can be simulated in a console
 * or a unit test.
 *
 * @module IncaTreasure
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
 * @property {ExplorerChoice|null} choice Current secret choice.
 * @property {boolean} isBot Whether the UI should choose for this explorer.
 */

/**
 * @typedef {Object} GameCard
 * @property {CardType} type Card category.
 * @property {number} [value] Treasure or relic point value.
 * @property {number} [number] Printed relic number.
 * @property {number} [leftover] Treasure remaining on the route.
 * @property {string} [name] Danger name.
 * @property {boolean} [claimed] Whether a relic has been claimed.
 */

export const TREASURE_VALUES = Object.freeze([
    1, 2, 3, 4, 5, 5, 7, 7, 9, 11, 11, 13, 14, 15, 17
]);

export const DANGER_NAMES = Object.freeze([
    "FIRE", "LANDSLIDE", "SNAKES", "SPIDERS", "MUMMY"
]);

export const ARTIFACT_NUMBERS = Object.freeze([1, 2, 3, 4, 5]);

const PLAYER_TEMPLATES = Object.freeze([
    {id: "you", name: "YOU", color: "red"},
    {id: "atu", name: "ATU", color: "blue"},
    {id: "mira", name: "MIRA", color: "gold"},
    {id: "cusco", name: "CUSCO", color: "purple"}
]);

const cloneExplorer = function (player) {
    // Nested artifacts are cloned too, otherwise tests can accidentally share
    // old object references between turns.
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
    // Tests can pass a random function in when a predictable deck is needed.
    const result = [...items];
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
            tent: 0,
            wallet: 5,
            roundLoot: 0,
            artifacts: [],
            active: true,
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
    // The treasure values follow the published Incan Gold / Diamant style deck.
    const treasures = TREASURE_VALUES.map(function (value) {
        return {type: "treasure", value, leftover: 0};
    });
    // dangerPool is passed in because duplicate danger cards are removed after
    // a failed round, so later rounds may not have all 15 danger cards.
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
            // This version scores relics as printed number times 10.
            value: artifactNumber * 10,
            claimed: false
        }];
    return shuffle([...treasures, ...dangers, ...relics], random);
};

/**
 * Pay the deposit and reset explorer state for a new round.
 *
 * @param {Explorer[]} players Current explorers.
 * @returns {Explorer[]} New explorer records ready for the round.
 */
export const preparePlayersForRound = function (players) {
    return players.map(function (player) {
        return {
            ...cloneExplorer(player),
            // The deposit is paid at the start. It is recovered only if the
            // explorer gets back to camp safely.
            wallet: player.wallet - 1,
            roundLoot: 0,
            active: true,
            choice: null
        };
    });
};

/**
 * Divide a treasure card equally between active explorers.
 *
 * @param {Explorer[]} players Current explorers.
 * @param {GameCard} card Revealed treasure card.
 * @returns {{players: Explorer[], card: GameCard, share: number}} Distribution.
 */
export const distributeTreasure = function (players, card) {
    const activeCount = players.filter(function (player) {
        return player.active;
    }).length;
    if (card.type !== "treasure" || activeCount === 0) {
        return {
            players: players.map(cloneExplorer),
            card: {...card},
            share: 0
        };
    }
    // Treasure is divided only between explorers still in the cave. Any
    // remainder stays on the route and can be picked up later by returners.
    const share = Math.floor(card.value / activeCount);
    return {
        players: players.map(function (player) {
            return player.active
                ? {...cloneExplorer(player), roundLoot: player.roundLoot + share}
                : cloneExplorer(player);
        }),
        card: {...card, leftover: card.value % activeCount},
        share
    };
};

/**
 * Resolve explorers returning to their tents.
 *
 * Returning explorers share all route leftovers, recover their deposit and
 * secure carried loot. A relic is claimed only if exactly one explorer leaves.
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
    // When several explorers leave together, leftovers are split between them
    // but relics are not awarded. A single returning explorer gets the relics.
    const share = leaving.size > 0
        ? Math.floor(routeTreasure / leaving.size)
        : 0;
    const claimRelics = leaving.size === 1;
    const claimed = revealed.filter(function (card) {
        return claimRelics && card.type === "artifact" && !card.claimed;
    }).map(function (card) {
        return {number: card.number, points: card.value};
    });
    const relicPoints = claimed.reduce(function (total, artifact) {
        return total + artifact.points;
    }, 0);
    // The returned deposit is added back here with +1. That keeps the wallet and
    // tent totals easy to reason about in the tests.
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
    const updatedRoute = revealed.map(function (card) {
        if (card.type === "treasure" && leaving.size > 0) {
            return {...card, leftover: card.leftover % leaving.size};
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
 * @returns {{players: Explorer[], dangerPool: Object<string, number>}}
 */
export const failRound = function (players, dangerPool, dangerName) {
    return {
        players: players.map(function (player) {
            return player.active
                ? {...cloneExplorer(player), roundLoot: 0, active: false}
                : cloneExplorer(player);
        }),
        // One copy of the danger that caused the failure is removed, so later
        // rounds remember what happened before.
        dangerPool: {
            ...dangerPool,
            [dangerName]: Math.max(0, (dangerPool[dangerName] || 0) - 1)
        }
    };
};

/**
 * Return an explorer's final score.
 *
 * Relic points are already secured in the tent when claimed.
 *
 * @param {Explorer} player Explorer to score.
 * @returns {number} Final points.
 */
export const scorePlayer = function (player) {
    return player.tent + player.wallet;
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
    // The bot is intentionally simple: the more danger and carried loot it sees,
    // the more likely it is to go home.
    const pressure = Object.values(dangerCounts).filter(function (count) {
        return count === 1;
    }).length;
    let leaveChance = 0.08 + pressure * 0.1
        + Math.min(player.roundLoot / 38, 0.5);
    leaveChance += artifactOnBoard ? 0.08 : 0;
    leaveChance += round === 5 ? 0.05 : 0;
    return random() < leaveChance ? "leave" : "continue";
};
