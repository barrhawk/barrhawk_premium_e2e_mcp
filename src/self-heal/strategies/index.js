"use strict";
/**
 * Self-Healing Strategies Index
 *
 * Exports all healing strategies and provides a unified interface
 * for strategy management.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.allStrategies = exports.cssPathStrategy = exports.CssPathStrategy = exports.textStrategy = exports.TextStrategy = exports.ariaStrategy = exports.AriaStrategy = exports.dataTestIdStrategy = exports.DataTestIdStrategy = exports.idStrategy = exports.IdStrategy = void 0;
exports.getStrategies = getStrategies;
exports.getStrategyNames = getStrategyNames;
var id_js_1 = require("./id.js");
Object.defineProperty(exports, "IdStrategy", { enumerable: true, get: function () { return id_js_1.IdStrategy; } });
Object.defineProperty(exports, "idStrategy", { enumerable: true, get: function () { return id_js_1.idStrategy; } });
var data_testid_js_1 = require("./data-testid.js");
Object.defineProperty(exports, "DataTestIdStrategy", { enumerable: true, get: function () { return data_testid_js_1.DataTestIdStrategy; } });
Object.defineProperty(exports, "dataTestIdStrategy", { enumerable: true, get: function () { return data_testid_js_1.dataTestIdStrategy; } });
var aria_js_1 = require("./aria.js");
Object.defineProperty(exports, "AriaStrategy", { enumerable: true, get: function () { return aria_js_1.AriaStrategy; } });
Object.defineProperty(exports, "ariaStrategy", { enumerable: true, get: function () { return aria_js_1.ariaStrategy; } });
var text_js_1 = require("./text.js");
Object.defineProperty(exports, "TextStrategy", { enumerable: true, get: function () { return text_js_1.TextStrategy; } });
Object.defineProperty(exports, "textStrategy", { enumerable: true, get: function () { return text_js_1.textStrategy; } });
var css_path_js_1 = require("./css-path.js");
Object.defineProperty(exports, "CssPathStrategy", { enumerable: true, get: function () { return css_path_js_1.CssPathStrategy; } });
Object.defineProperty(exports, "cssPathStrategy", { enumerable: true, get: function () { return css_path_js_1.cssPathStrategy; } });
const id_js_2 = require("./id.js");
const data_testid_js_2 = require("./data-testid.js");
const aria_js_2 = require("./aria.js");
const text_js_2 = require("./text.js");
const css_path_js_2 = require("./css-path.js");
/**
 * All available strategies in priority order
 */
exports.allStrategies = [
    id_js_2.idStrategy,
    data_testid_js_2.dataTestIdStrategy,
    aria_js_2.ariaStrategy,
    text_js_2.textStrategy,
    css_path_js_2.cssPathStrategy,
];
/**
 * Get strategies by name
 */
function getStrategies(names) {
    const strategyMap = {
        'id': id_js_2.idStrategy,
        'data-testid': data_testid_js_2.dataTestIdStrategy,
        'aria-label': aria_js_2.ariaStrategy,
        'text': text_js_2.textStrategy,
        'css-path': css_path_js_2.cssPathStrategy,
        'xpath': css_path_js_2.cssPathStrategy, // Fall back to CSS path for now
        'proximity': css_path_js_2.cssPathStrategy, // Fall back to CSS path for now
    };
    return names.map(name => strategyMap[name]).filter(Boolean);
}
/**
 * Get all strategy names
 */
function getStrategyNames() {
    return exports.allStrategies.map(s => s.name);
}
//# sourceMappingURL=index.js.map