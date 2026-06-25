import assert from "node:assert/strict";
import {
    ARTIFACT_NUMBERS,
    DANGER_NAMES,
    TREASURE_VALUES,
    chooseBotAction,
    createPlayers,
    createRoundDeck,
    distributeTreasure,
    failRound,
    preparePlayersForRound,
    rankPlayers,
    scorePlayer,
    settleReturningPlayers,
    shuffle
} from "../GreedyLittleExplorers.js";

const fullDangerPool = function () {
    return {
        FIRE: 3,
        LANDSLIDE: 3,
        SNAKES: 3,
        SPIDERS: 3,
        MUMMY: 3
    };
};

const display = function (value) {
    return "\n" + JSON.stringify(value, null, 2);
};

const throwIfInvalidArtifact = function (artifact) {
    if (!artifact || typeof artifact !== "object") {
        throw new Error("Artifact is not an object: " + display(artifact));
    }
    if (!ARTIFACT_NUMBERS.includes(artifact.number)) {
        throw new Error("Artifact has an invalid number: " + display(artifact));
    }
    if (!Number.isInteger(artifact.points) || artifact.points <= 0) {
        throw new Error("Artifact points are invalid: " + display(artifact));
    }
};

const throwIfInvalidPlayers = function (players) {
    if (!Array.isArray(players)) {
        throw new Error("Players are not an array: " + display(players));
    }
    const ids = new Set();
    players.forEach(function (player) {
        if (!player || typeof player !== "object") {
            throw new Error("Player is not an object: " + display(player));
        }
        if (typeof player.id !== "string" || player.id.length === 0) {
            throw new Error("Player has no stable id: " + display(player));
        }
        if (ids.has(player.id)) {
            throw new Error("Player ids are not unique: " + display(players));
        }
        ids.add(player.id);
        if (typeof player.name !== "string" || player.name.length === 0) {
            throw new Error("Player has no display name: " + display(player));
        }
        if (typeof player.color !== "string" || player.color.length === 0) {
            throw new Error("Player has no tent colour: " + display(player));
        }
        ["tent", "wallet", "roundLoot"].forEach(function (field) {
            if (!Number.isInteger(player[field]) || player[field] < 0) {
                throw new Error(
                    `Player ${field} is not a non-negative integer: ` +
                    display(player)
                );
            }
        });
        if (!Array.isArray(player.artifacts)) {
            throw new Error("Player relics are not an array: " + display(player));
        }
        player.artifacts.forEach(throwIfInvalidArtifact);
        if (typeof player.active !== "boolean") {
            throw new Error("Player active flag is invalid: " + display(player));
        }
        if (typeof player.dropped !== "boolean") {
            throw new Error("Player dropped flag is invalid: " + display(player));
        }
        if (typeof player.isBot !== "boolean") {
            throw new Error("Player bot flag is invalid: " + display(player));
        }
        if (!["continue", "leave", null].includes(player.choice)) {
            throw new Error("Player choice is invalid: " + display(player));
        }
        if (player.dropped && player.active) {
            throw new Error("Dropped players must not be active: " + display(player));
        }
    });
};

const throwIfInvalidCard = function (card) {
    if (!card || typeof card !== "object") {
        throw new Error("Card is not an object: " + display(card));
    }
    if (!["treasure", "danger", "artifact"].includes(card.type)) {
        throw new Error("Card type is invalid: " + display(card));
    }
    if (card.type === "treasure") {
        if (!TREASURE_VALUES.includes(card.value)) {
            throw new Error("Treasure value is invalid: " + display(card));
        }
        if (!Number.isInteger(card.leftover) || card.leftover < 0) {
            throw new Error("Treasure leftover is invalid: " + display(card));
        }
        if (typeof card.collected !== "boolean") {
            throw new Error("Treasure collected flag is invalid: " + display(card));
        }
    }
    if (card.type === "danger" && !DANGER_NAMES.includes(card.name)) {
        throw new Error("Danger name is invalid: " + display(card));
    }
    if (card.type === "artifact") {
        if (!ARTIFACT_NUMBERS.includes(card.number)) {
            throw new Error("Relic number is invalid: " + display(card));
        }
        if (card.value !== card.number * 10) {
            throw new Error("Relic value does not match its number: " + display(card));
        }
        if (typeof card.claimed !== "boolean") {
            throw new Error("Relic claimed flag is invalid: " + display(card));
        }
    }
};

const throwIfInvalidRoute = function (route) {
    if (!Array.isArray(route)) {
        throw new Error("Route is not an array: " + display(route));
    }
    route.forEach(throwIfInvalidCard);
};

const throwIfInvalidDangerPool = function (dangerPool) {
    if (!dangerPool || typeof dangerPool !== "object") {
        throw new Error("Danger pool is not an object: " + display(dangerPool));
    }
    DANGER_NAMES.forEach(function (dangerName) {
        const count = dangerPool[dangerName] || 0;
        if (!Number.isInteger(count) || count < 0 || count > 3) {
            throw new Error("Danger count is invalid: " + display(dangerPool));
        }
    });
};

const routeTreasure = function (route) {
    return route.reduce(function (total, card) {
        return total + (card.type === "treasure" ? card.leftover : 0);
    }, 0);
};

const leavingSubsets = function (players) {
    const ids = players.map(function (player) {
        return player.id;
    });
    return ids.flatMap(function (firstId, firstIndex) {
        return ids.slice(firstIndex).map(function (secondId) {
            return firstId === secondId
                ? [firstId]
                : [firstId, secondId];
        });
    });
};

const assertValidSettlementForLeavingGroup = function (players, route, leavingIds) {
    const originalTreasure = routeTreasure(route);
    const share = Math.floor(originalTreasure / leavingIds.length);
    const soloClaimsRelic = leavingIds.length === 1;
    const relicPoints = soloClaimsRelic
        ? route.filter(function (card) {
            return card.type === "artifact" && !card.claimed;
        }).reduce(function (total, card) {
            return total + card.value;
        }, 0)
        : 0;
    const result = settleReturningPlayers(players, route, leavingIds);

    throwIfInvalidPlayers(result.players);
    throwIfInvalidRoute(result.revealed);
    assert.equal(routeTreasure(result.revealed), originalTreasure % leavingIds.length);

    result.players.forEach(function (player, index) {
        const original = players[index];
        if (!leavingIds.includes(player.id)) {
            assert.deepEqual(player, original);
            return;
        }
        assert.equal(player.active, false);
        assert.equal(player.roundLoot, 0);
        assert.equal(player.wallet, Math.min(4, original.wallet + 1));
        assert.equal(
            player.tent,
            original.tent + original.roundLoot + share + 1 + relicPoints
        );
        assert.equal(player.artifacts.length, original.artifacts.length + (
            soloClaimsRelic
                ? result.claimed.length
                : 0
        ));
    });
};

describe("Greedy Little Explorers game module", function () {
    describe("state validation helpers", function () {
        it("accepts a freshly-created bot game as a valid player state", function () {
            const players = createPlayers();
            throwIfInvalidPlayers(players);
            assert.deepEqual(players.map(function (player) {
                return player.isBot;
            }), [false, true, true, true]);
        });

        it("creates valid named local explorers without bot players", function () {
            const players = createPlayers({
                mode: "local",
                count: 3,
                names: ["Ava", "Ben"]
            });
            throwIfInvalidPlayers(players);
            assert.deepEqual(players.map(function (player) {
                return player.name;
            }), ["Ava", "Ben", "PLAYER 3"]);
            assert.deepEqual(players.map(function (player) {
                return player.isBot;
            }), [false, false, false]);
        });
    });

    describe("utility API", function () {
        it("shuffles a copy without changing the original list", function () {
            const source = [1, 2, 3, 4];
            // Fixed randomness keeps this test about API behaviour, not luck.
            const shuffled = shuffle(source, function () {
                return 0;
            });
            assert.deepEqual(source, [1, 2, 3, 4]);
            assert.deepEqual(shuffled, [2, 3, 4, 1]);
        });
    });

    describe("round setup", function () {
        it("charges every explorer one deposit and resets round state", function () {
            const players = createPlayers();
            players[0].roundLoot = 9;
            players[0].active = false;
            players[0].choice = "leave";
            const result = preparePlayersForRound(players);

            throwIfInvalidPlayers(result);
            assert.deepEqual(result.map(function (player) {
                return player.tent;
            }), [3, 3, 3, 3]);
            assert.deepEqual(result.map(function (player) {
                return player.wallet;
            }), [3, 3, 3, 3]);
            assert.deepEqual(result.map(function (player) {
                return player.roundLoot;
            }), [0, 0, 0, 0]);
            assert.deepEqual(result.map(function (player) {
                return player.active;
            }), [true, true, true, true]);
            assert.equal(result[0].choice, null);
            assert.equal(players[0].wallet, 4);
        });

        it("keeps dropped explorers out of later rounds", function () {
            const players = createPlayers();
            players[1].dropped = true;
            players[1].active = false;
            players[1].roundLoot = 6;
            const result = preparePlayersForRound(players);

            throwIfInvalidPlayers(result);
            assert.equal(result[1].active, false);
            assert.equal(result[1].wallet, 4);
            assert.equal(result[1].roundLoot, 0);
            assert.equal(result[1].dropped, true);
        });

        it("drops final-round explorers who cannot pay the deposit", function () {
            const players = createPlayers();
            players[0].tent = 0;
            const result = preparePlayersForRound(players, {round: 5});

            throwIfInvalidPlayers(result);
            assert.equal(result[0].active, false);
            assert.equal(result[0].dropped, true);
            assert.equal(result[0].tent, 0);
            assert.equal(result[0].wallet, 4);
        });

        it("builds a valid full deck with exact treasure, danger and relic counts", function () {
            const deck = createRoundDeck({
                dangerPool: fullDangerPool(),
                artifactNumber: 4,
                random: function () {
                    return 0;
                }
            });

            throwIfInvalidRoute(deck);
            assert.equal(deck.length, 31);
            assert.equal(deck.filter(function (card) {
                return card.type === "treasure";
            }).length, 15);
            assert.equal(deck.filter(function (card) {
                return card.type === "danger";
            }).length, 15);
            assert.equal(deck.find(function (card) {
                return card.type === "artifact";
            }).value, 40);
        });

        it("honours removed danger types and omitted relics when building decks", function () {
            const dangerPool = {
                FIRE: 0,
                LANDSLIDE: 3,
                SNAKES: 2,
                SPIDERS: 1,
                MUMMY: 0
            };
            const deck = createRoundDeck({
                dangerPool,
                artifactNumber: null,
                random: function () {
                    return 0;
                }
            });

            throwIfInvalidRoute(deck);
            assert.equal(deck.length, 21);
            assert.equal(deck.filter(function (card) {
                return card.type === "artifact";
            }).length, 0);
            assert.deepEqual(DANGER_NAMES.map(function (dangerName) {
                return deck.filter(function (card) {
                    return card.name === dangerName;
                }).length;
            }), [0, 3, 2, 1, 0]);
        });
    });

    describe("treasure distribution", function () {
        it("adds treasure to the route pool instead of giving it immediately", function () {
            const players = createPlayers();
            const treasure = {type: "treasure", value: 15, leftover: 0, collected: false};
            const result = distributeTreasure(players, treasure);

            throwIfInvalidPlayers(result.players);
            throwIfInvalidCard(result.card);
            assert.deepEqual(result.players.map(function (player) {
                return player.roundLoot;
            }), [0, 0, 0, 0]);
            assert.equal(result.card.leftover, 15);
            assert.equal(result.card.collected, false);
            assert.equal(result.share, 0);
            assert.equal(treasure.leftover, 0);
        });

        it("keeps accumulating treasure on an already-valued route card", function () {
            const players = createPlayers();
            const result = distributeTreasure(
                players,
                {type: "treasure", value: 11, leftover: 4, collected: false}
            );

            throwIfInvalidCard(result.card);
            assert.equal(result.card.leftover, 15);
        });

        it("adds a revisited treasure value to the route pool again", function () {
            const players = createPlayers();
            const first = distributeTreasure(
                players,
                {type: "treasure", value: 7, leftover: 0, collected: false}
            );
            const second = distributeTreasure(players, first.card);

            throwIfInvalidCard(second.card);
            assert.equal(second.card.leftover, 14);
        });

        it("leaves non-treasure cards and explorer loot unchanged", function () {
            const players = createPlayers();
            players[0].roundLoot = 5;
            const danger = {type: "danger", name: "FIRE"};
            const result = distributeTreasure(players, danger);

            throwIfInvalidPlayers(result.players);
            throwIfInvalidCard(result.card);
            assert.equal(result.players[0].roundLoot, 5);
            assert.deepEqual(result.card, danger);
            assert.equal(result.share, 0);
        });
    });

    describe("returning to camp", function () {
        it("does not change route treasure when nobody returns", function () {
            const players = createPlayers();
            const route = [
                {type: "treasure", value: 7, leftover: 7, collected: false},
                {type: "artifact", number: 2, value: 20, claimed: false}
            ];
            const result = settleReturningPlayers(players, route, []);

            throwIfInvalidPlayers(result.players);
            throwIfInvalidRoute(result.revealed);
            assert.deepEqual(result.players, players);
            assert.deepEqual(result.revealed, route);
            assert.deepEqual(result.claimed, []);
        });

        it("secures loot and route leftovers without scoring the returned deposit twice", function () {
            const players = createPlayers();
            players[0] = {...players[0], tent: 3, wallet: 3, roundLoot: 8};
            // Safe return refunds the entry deposit; it is not extra treasure.
            const result = settleReturningPlayers(
                players,
                [{type: "treasure", value: 7, leftover: 3, collected: false}],
                ["you"]
            );

            throwIfInvalidPlayers(result.players);
            throwIfInvalidRoute(result.revealed);
            assert.equal(result.players[0].tent, 15);
            assert.equal(result.players[0].wallet, 4);
            assert.equal(result.players[0].active, false);
            assert.equal(result.players[0].roundLoot, 0);
            assert.equal(result.revealed[0].leftover, 0);
        });

        it("awards numbered relic points only to a single returning explorer", function () {
            const players = createPlayers();
            players[0] = {...players[0], tent: 3, wallet: 3};
            players[1] = {...players[1], tent: 3, wallet: 3};
            const route = [{
                type: "artifact",
                number: 3,
                value: 30,
                claimed: false
            }];
            const single = settleReturningPlayers(players, route, ["you"]);
            const group = settleReturningPlayers(players, route, ["you", "atu"]);

            throwIfInvalidPlayers(single.players);
            throwIfInvalidRoute(single.revealed);
            throwIfInvalidPlayers(group.players);
            throwIfInvalidRoute(group.revealed);
            assert.equal(single.players[0].tent, 34);
            assert.deepEqual(single.players[0].artifacts, [
                {number: 3, points: 30}
            ]);
            assert.equal(single.revealed[0].claimed, true);
            assert.equal(group.players[0].tent, 4);
            assert.equal(group.players[0].artifacts.length, 0);
            assert.equal(group.revealed[0].claimed, false);
        });

        it("splits the whole route pool and leaves only the global remainder", function () {
            const players = createPlayers();
            players[0] = {...players[0], tent: 3, wallet: 3};
            players[1] = {...players[1], tent: 3, wallet: 3};
            // Two players sharing 11 leaves the visible one-gem remainder.
            const result = settleReturningPlayers(
                players,
                [
                    {type: "treasure", value: 4, leftover: 4, collected: false},
                    {type: "treasure", value: 7, leftover: 7, collected: false}
                ],
                ["you", "atu"]
            );

            throwIfInvalidPlayers(result.players);
            throwIfInvalidRoute(result.revealed);
            assert.equal(result.players[0].tent, 9);
            assert.equal(result.players[1].tent, 9);
            assert.deepEqual(result.revealed.map(function (card) {
                return card.leftover;
            }), [0, 1]);
            assert.deepEqual(result.revealed.map(function (card) {
                return card.collected;
            }), [true, true]);
        });

        it("produces valid states for every one-player or two-player exit group", function () {
            const players = createPlayers().slice(0, 3).map(function (player, index) {
                return {
                    ...player,
                    tent: 3,
                    wallet: index === 0 ? 3 : 2,
                    roundLoot: index + 2
                };
            });
            const route = [
                {type: "treasure", value: 5, leftover: 5, collected: false},
                {type: "treasure", value: 9, leftover: 8, collected: false},
                {type: "artifact", number: 2, value: 20, claimed: false}
            ];

            leavingSubsets(players).forEach(function (leavingIds) {
                assertValidSettlementForLeavingGroup(players, route, leavingIds);
            });
        });

        it("does not claim relics that were already claimed earlier", function () {
            const players = createPlayers();
            players[0] = {...players[0], tent: 3, wallet: 3};
            const result = settleReturningPlayers(
                players,
                [{type: "artifact", number: 5, value: 50, claimed: true}],
                ["you"]
            );

            throwIfInvalidPlayers(result.players);
            throwIfInvalidRoute(result.revealed);
            assert.equal(result.players[0].tent, 4);
            assert.deepEqual(result.players[0].artifacts, []);
            assert.deepEqual(result.claimed, []);
        });
    });

    describe("danger failures", function () {
        it("removes carried loot only from explorers still inside the cave", function () {
            const players = createPlayers();
            players[0].active = false;
            players[0].roundLoot = 9;
            players[1].roundLoot = 12;
            const result = failRound(players, fullDangerPool(), "FIRE");

            throwIfInvalidPlayers(result.players);
            throwIfInvalidDangerPool(result.dangerPool);
            assert.equal(result.players[0].roundLoot, 9);
            assert.equal(result.players[0].active, false);
            assert.equal(result.players[1].roundLoot, 0);
            assert.equal(result.players[1].active, false);
            assert.equal(result.dangerPool.FIRE, 0);
        });

        it("removes the first occurrence of every failed danger type from the pool", function () {
            DANGER_NAMES.forEach(function (dangerName) {
                const players = createPlayers();
                players[0].roundLoot = 12;
                const result = failRound(players, fullDangerPool(), dangerName);

                throwIfInvalidPlayers(result.players);
                throwIfInvalidDangerPool(result.dangerPool);
                assert.equal(result.dangerPool[dangerName], 0);
                assert.deepEqual(result.removedDangerTypes, [dangerName]);
                assert.deepEqual(result.players.map(function (player) {
                    return player.active;
                }), [false, false, false, false]);
            });
        });

        it("does not remove more danger types after the removal cap is reached", function () {
            const result = failRound(
                createPlayers(),
                {FIRE: 0, LANDSLIDE: 0, SNAKES: 3, SPIDERS: 3, MUMMY: 3},
                "MUMMY",
                {removedDangerTypes: ["FIRE", "LANDSLIDE"]}
            );

            throwIfInvalidPlayers(result.players);
            throwIfInvalidDangerPool(result.dangerPool);
            assert.equal(result.dangerPool.MUMMY, 3);
            assert.deepEqual(result.removedDangerTypes, ["FIRE", "LANDSLIDE"]);
        });

        it("does not duplicate a danger type that was already removed", function () {
            const result = failRound(
                createPlayers(),
                {FIRE: 0, LANDSLIDE: 3, SNAKES: 3, SPIDERS: 3, MUMMY: 3},
                "FIRE",
                {removedDangerTypes: ["FIRE"]}
            );

            throwIfInvalidPlayers(result.players);
            throwIfInvalidDangerPool(result.dangerPool);
            assert.deepEqual(result.removedDangerTypes, ["FIRE"]);
            assert.equal(result.dangerPool.FIRE, 0);
        });
    });

    describe("bot choices", function () {
        it("chooses to leave when the deterministic risk score beats randomness", function () {
            const bot = createPlayers()[1];
            bot.roundLoot = 20;
            const action = chooseBotAction(bot, {
                dangerCounts: {FIRE: 1, SNAKES: 1, MUMMY: 0},
                artifactOnBoard: true,
                round: 5,
                random: function () {
                    return 0;
                }
            });
            assert.equal(action, "leave");
        });

        it("chooses to continue when risk is low and randomness is high", function () {
            const bot = createPlayers()[1];
            const action = chooseBotAction(bot, {
                dangerCounts: {FIRE: 0, SNAKES: 0, MUMMY: 0},
                artifactOnBoard: false,
                round: 1,
                random: function () {
                    return 0.99;
                }
            });
            assert.equal(action, "continue");
        });
    });

    describe("final scoring and ranking", function () {
        it("uses tent score as the final score and ignores wallet gems", function () {
            const players = createPlayers();
            players[0].tent = 5;
            players[0].wallet = 4;
            players[1].tent = 6;
            players[1].wallet = 0;

            assert.equal(scorePlayer(players[0]), 5);
            assert.equal(scorePlayer(players[1]), 6);
            assert.equal(rankPlayers(players.slice(0, 2))[0].id, "atu");
        });

        it("ranks by final score and then by relic count", function () {
            const players = createPlayers();
            players[0].tent = 20;
            players[1].tent = 20;
            players[1].artifacts = [{number: 1, points: 10}];
            const ranking = rankPlayers(players.slice(0, 2));

            throwIfInvalidPlayers(ranking);
            assert.equal(ranking[0].id, "atu");
        });

        it("sorts a copy instead of changing the original player order", function () {
            const players = createPlayers();
            players[0].tent = 5;
            players[1].tent = 9;
            const ranking = rankPlayers(players.slice(0, 2));

            assert.deepEqual(players.slice(0, 2).map(function (player) {
                return player.id;
            }), ["you", "atu"]);
            assert.deepEqual(ranking.map(function (player) {
                return player.id;
            }), ["atu", "you"]);
        });
    });
});
