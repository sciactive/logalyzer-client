(function (global, factory) {
  if (typeof define === "function" && define.amd) {
    define(["exports", "./LogEntry"], factory);
  } else if (typeof exports !== "undefined") {
    factory(exports, require("./LogEntry"));
  } else {
    var mod = {
      exports: {}
    };
    factory(mod.exports, global.LogEntry);
    global.index = mod.exports;
  }
})(this, function (exports, _LogEntry) {
  "use strict";

  Object.defineProperty(exports, "__esModule", {
    value: true
  });
  exports.LogEntry = undefined;

  var _LogEntry2 = _interopRequireDefault(_LogEntry);

  function _interopRequireDefault(obj) {
    return obj && obj.__esModule ? obj : {
      default: obj
    };
  }

  exports.LogEntry = _LogEntry2.default;
});