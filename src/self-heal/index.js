"use strict";
/**
 * BarrHawk Self-Healing Selectors
 *
 * Automatic selector recovery when DOM changes.
 * Uses multiple strategies to find elements when original selectors fail.
 *
 * @packageDocumentation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SqliteStorage = exports.InMemoryStorage = exports.resetStorage = exports.getStorage = exports.meetsThreshold = exports.rankCandidates = exports.calculateScore = exports.DEFAULT_WEIGHTS = exports.getStrategyNames = exports.getStrategies = exports.allStrategies = exports.cssPathStrategy = exports.textStrategy = exports.ariaStrategy = exports.dataTestIdStrategy = exports.idStrategy = exports.CssPathStrategy = exports.TextStrategy = exports.AriaStrategy = exports.DataTestIdStrategy = exports.IdStrategy = exports.captureElement = exports.healSelector = exports.resetSelfHealingManager = exports.getSelfHealingManager = exports.SelfHealingManager = exports.DEFAULT_CONFIG = void 0;
var types_js_1 = require("./types.js");
Object.defineProperty(exports, "DEFAULT_CONFIG", { enumerable: true, get: function () { return types_js_1.DEFAULT_CONFIG; } });
// =============================================================================
// Healer
// =============================================================================
var healer_js_1 = require("./healer.js");
Object.defineProperty(exports, "SelfHealingManager", { enumerable: true, get: function () { return healer_js_1.SelfHealingManager; } });
Object.defineProperty(exports, "getSelfHealingManager", { enumerable: true, get: function () { return healer_js_1.getSelfHealingManager; } });
Object.defineProperty(exports, "resetSelfHealingManager", { enumerable: true, get: function () { return healer_js_1.resetSelfHealingManager; } });
Object.defineProperty(exports, "healSelector", { enumerable: true, get: function () { return healer_js_1.healSelector; } });
Object.defineProperty(exports, "captureElement", { enumerable: true, get: function () { return healer_js_1.captureElement; } });
// =============================================================================
// Strategies
// =============================================================================
var index_js_1 = require("./strategies/index.js");
// Strategy classes
Object.defineProperty(exports, "IdStrategy", { enumerable: true, get: function () { return index_js_1.IdStrategy; } });
Object.defineProperty(exports, "DataTestIdStrategy", { enumerable: true, get: function () { return index_js_1.DataTestIdStrategy; } });
Object.defineProperty(exports, "AriaStrategy", { enumerable: true, get: function () { return index_js_1.AriaStrategy; } });
Object.defineProperty(exports, "TextStrategy", { enumerable: true, get: function () { return index_js_1.TextStrategy; } });
Object.defineProperty(exports, "CssPathStrategy", { enumerable: true, get: function () { return index_js_1.CssPathStrategy; } });
// Strategy instances
Object.defineProperty(exports, "idStrategy", { enumerable: true, get: function () { return index_js_1.idStrategy; } });
Object.defineProperty(exports, "dataTestIdStrategy", { enumerable: true, get: function () { return index_js_1.dataTestIdStrategy; } });
Object.defineProperty(exports, "ariaStrategy", { enumerable: true, get: function () { return index_js_1.ariaStrategy; } });
Object.defineProperty(exports, "textStrategy", { enumerable: true, get: function () { return index_js_1.textStrategy; } });
Object.defineProperty(exports, "cssPathStrategy", { enumerable: true, get: function () { return index_js_1.cssPathStrategy; } });
// Strategy utilities
Object.defineProperty(exports, "allStrategies", { enumerable: true, get: function () { return index_js_1.allStrategies; } });
Object.defineProperty(exports, "getStrategies", { enumerable: true, get: function () { return index_js_1.getStrategies; } });
Object.defineProperty(exports, "getStrategyNames", { enumerable: true, get: function () { return index_js_1.getStrategyNames; } });
// =============================================================================
// Scoring
// =============================================================================
var scoring_js_1 = require("./scoring.js");
Object.defineProperty(exports, "DEFAULT_WEIGHTS", { enumerable: true, get: function () { return scoring_js_1.DEFAULT_WEIGHTS; } });
Object.defineProperty(exports, "calculateScore", { enumerable: true, get: function () { return scoring_js_1.calculateScore; } });
Object.defineProperty(exports, "rankCandidates", { enumerable: true, get: function () { return scoring_js_1.rankCandidates; } });
Object.defineProperty(exports, "meetsThreshold", { enumerable: true, get: function () { return scoring_js_1.meetsThreshold; } });
// =============================================================================
// Storage
// =============================================================================
var storage_js_1 = require("./storage.js");
Object.defineProperty(exports, "getStorage", { enumerable: true, get: function () { return storage_js_1.getStorage; } });
Object.defineProperty(exports, "resetStorage", { enumerable: true, get: function () { return storage_js_1.resetStorage; } });
Object.defineProperty(exports, "InMemoryStorage", { enumerable: true, get: function () { return storage_js_1.InMemoryStorage; } });
Object.defineProperty(exports, "SqliteStorage", { enumerable: true, get: function () { return storage_js_1.SqliteStorage; } });
//# sourceMappingURL=index.js.map