import Nymph from "Nymph";
import Entity from "NymphEntity";

export default class LogEntry extends Entity {

  // === Static Properties ===

  static etype = "logentry";
  // The name of the server class
  static class = "LogEntry";

  static title = "Generic Log Entry";
  static filePattern = /^not_a_real_log_class/;
  static usesIpLocationInfo = false;
  static checkMalformedLines = false;
  static exactLinePattern = /.*$/; // Only used for checkMalformedLines.

  static aggregateFunctions = {
    ...LogEntry.defaultAggregateFunctions
  }

  static defaultAggregateFunctions = {
    rawLogLine: {
      name: "Raw Logs",
      axisLabel: "Log Line",
      defaultChartFunction: "rawDataEntries",
      sorting: ["unchanged"],
      func: function (entries, sort) {
        const data = [], eventHandlers = {};

        // Add all log entry lines.
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          const label = entry.get("line");

          data.push({
            label: label,
            value: 1
          });

          eventHandlers[label] = function(app) {
            const selectors = app.get("selectors");
            selectors.push({
              type: "&",
              strict: [
                ["line", label]
              ]
            });
            app.set({selectors});
            alert("Added selector to filter for this log entry.");
          };
        }

        return {data, eventHandlers};
      }
    }
  }
  static timeBasedAggregateFunctions = {
    entriesPerSecond: {
      name: "Entries Per Second",
      axisLabel: "Entries",
      defaultChartFunction: "timeSeriesStepped",
      sorting: ["unchanged"],
      func: LogEntry.aggregateExtractPerTime("time", "s")
    },

    entriesPerMinute: {
      name: "Entries Per Minute",
      axisLabel: "Entries",
      defaultChartFunction: "timeSeriesStepped",
      sorting: ["unchanged"],
      func: LogEntry.aggregateExtractPerTime("time", "m")
    },

    entriesPerHour: {
      name: "Entries Per Hour",
      axisLabel: "Entries",
      defaultChartFunction: "timeSeriesStepped",
      sorting: ["unchanged"],
      func: LogEntry.aggregateExtractPerTime("time", "h")
    },

    entriesPerDay: {
      name: "Entries Per Day",
      axisLabel: "Entries",
      defaultChartFunction: "timeSeriesStepped",
      sorting: ["unchanged"],
      func: LogEntry.aggregateExtractPerTime("time", "d")
    }
  }
  static timeLongTermBasedAggregateFunctions = {
    entriesPerWeek: {
      name: "Entries Per Week",
      axisLabel: "Entries",
      defaultChartFunction: "timeSeriesStepped",
      sorting: ["unchanged"],
      func: LogEntry.aggregateExtractPerTime("time", "w")
    },

    entriesPerMonth: {
      name: "Entries Per Month",
      axisLabel: "Entries",
      defaultChartFunction: "timeSeriesStepped",
      sorting: ["unchanged"],
      func: LogEntry.aggregateExtractPerTime("time", "M")
    },

    entriesPerQuarter: {
      name: "Entries Per Quarter",
      axisLabel: "Entries",
      defaultChartFunction: "timeSeriesStepped",
      sorting: ["unchanged"],
      func: LogEntry.aggregateExtractPerTime("time", "Q")
    },

    entriesPerYear: {
      name: "Entries Per Year",
      axisLabel: "Entries",
      defaultChartFunction: "timeSeriesStepped",
      sorting: ["unchanged"],
      func: LogEntry.aggregateExtractPerTime("time", "y")
    }
  }
  static httpRequestBasedAggregateFunctions = {
    remoteHost: {
      name: "Remote Host (Unique Visitors)",
      axisLabel: "Requests",
      defaultChartFunction: "rawDataEntries",
      sorting: ["value", "property"],
      func: LogEntry.aggregateExtractBy("remoteHost", "Unknown")
    },

    resources: {
      name: "Requested Resources",
      axisLabel: "Requests",
      defaultChartFunction: "horizontalBar",
      sorting: ["value", "property"],
      func: LogEntry.aggregateExtractBy("resource", "Unknown")
    },

    methods: {
      name: "Request Methods",
      axisLabel: "Requests",
      defaultChartFunction: "horizontalBar",
      sorting: ["value", "property"],
      func: LogEntry.aggregateExtractBy("method", "Unknown")
    },

    responseStatusCode: {
      name: "Response Status Code",
      axisLabel: "Requests",
      defaultChartFunction: "horizontalBar",
      sorting: ["value", "property"],
      func: LogEntry.aggregateExtractBy("statusCode", "Unknown")
    }
  }
  static refererBasedAggregateFunctions = {
    refererByDomain: {
      name: "Referer By Domain",
      axisLabel: "Requests",
      defaultChartFunction: "horizontalBar",
      sorting: ["value", "property"],
      func: function (entries, sort) {
        const values = {
          "Direct Request": 0,
          "Unknown": 0
        };
        const refererDomainRegex = /^\w+:\/\/(?:www\.)?([A-Za-z0-9-:.]+)/g;
        const data = [], eventHandlers = {};

        // Go through and parse out the domain of the referer.
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          const value = entry.get("referer");

          if (!value || value === "-") {
            values["Direct Request"]++;
          } else {
            const match = refererDomainRegex.exec(value);
            if (match !== null && match.length > 1) {
              if (values[match[1]]) {
                values[match[1]]++;
              } else {
                values[match[1]] = 1;
              }
            } else {
              values["Unknown"]++;
            }
          }
        }

        // Convert every entry to an array.
        for (let k in values) {
          data.push({
            label: k + " (" + (Math.round(values[k] / entries.length * 10000) / 100) + "%, " + values[k] + ")",
            value: values[k],
            sortProperty: k.toLowerCase()
          });
        }

        if (sort === "value") {
          data.sort((a, b) => b.value - a.value);
        } else if (sort === "property") {
          data.sort((a, b) => {
            if (a.sortProperty < b.sortProperty) {
              return -1;
            } else if (b.sortProperty < a.sortProperty) {
              return 1;
            } else {
              return 0;
            }
          });
        }

        return {data, eventHandlers};
      }
    },

    searchTerms: {
      name: "Search Terms",
      axisLabel: "Requests",
      defaultChartFunction: "horizontalBar",
      sorting: ["value", "property"],
      func: function (entries, sort) {
        const values = {};
        const searchTermsByServiceRegex = /^\w+:\/\/(?:www\.)?[A-Za-z0-9-:.]+\/.*q=([^&]+)(?:&|$)/g;
        const data = [], eventHandlers = {};

        // Go through and parse out the search terms and service.
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          const value = entry.get("referer");

          if (!(!value || value === "-")) {
            const match = searchTermsByServiceRegex.exec(value);
            if (match !== null && match.length > 1) {
              const key = decodeURIComponent(match[1].replace(/\+/g, ' '));
              if (values[key]) {
                values[key]++;
              } else {
                values[key] = 1;
              }
            }
          }
        }

        // Convert every entry to an array.
        for (let k in values) {
          const label = k + " (" + (Math.round(values[k] / entries.length * 10000) / 100) + "%, " + values[k] + ")";
          data.push({
            label: label,
            value: values[k],
            sortProperty: k.toLowerCase()
          });
          eventHandlers[label] = function(app) {
            const selectors = app.get("selectors");
            selectors.push({
              type: "&",
              like: [
                ["referer", "%q="+(encodeURIComponent(k).replace(/%20/g, '+').replace(/%/g, '\%').replace(/_/g, '\_'))+"%"]
              ]
            });
            app.set({selectors});
            alert("Added selector to filter for this searth term.");
          };
        }

        if (sort === "value") {
          data.sort((a, b) => b.value - a.value);
        } else if (sort === "property") {
          data.sort((a, b) => {
            if (a.sortProperty < b.sortProperty) {
              return -1;
            } else if (b.sortProperty < a.sortProperty) {
              return 1;
            } else {
              return 0;
            }
          });
        }

        return {data, eventHandlers};
      }
    },

    searchTermsByService: {
      name: "Search Terms by Service",
      axisLabel: "Requests",
      defaultChartFunction: "horizontalBar",
      sorting: ["value", "property"],
      func: function (entries, sort) {
        const values = {};
        const searchTermsByServiceRegex = /^\w+:\/\/(?:www\.)?([A-Za-z0-9-:.]+)\/.*q=([^&]+)(?:&|$)/g;
        const data = [], eventHandlers = {};

        // Go through and parse out the search terms and service.
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          const value = entry.get("referer");

          if (!(!value || value === "-")) {
            const match = searchTermsByServiceRegex.exec(value);
            if (match !== null && match.length > 2) {
              const key = match[1] + ": " + decodeURIComponent(match[2].replace(/\+/g, ' '));
              if (values[key]) {
                values[key]++;
              } else {
                values[key] = 1;
              }
            }
          }
        }

        // Convert every entry to an array.
        for (let k in values) {
          const label = k + " (" + (Math.round(values[k] / entries.length * 10000) / 100) + "%, " + values[k] + ")";
          data.push({
            label: label,
            value: values[k],
            sortProperty: k.toLowerCase()
          });
          eventHandlers[label] = function(app) {
            const selectors = app.get("selectors");
            selectors.push({
              type: "&",
              like: [
                ["referer", "%"+k.split(": ", 2)[0]+"/%q="+(encodeURIComponent(k.split(": ", 2)[1]).replace(/%20/g, '+').replace(/%/g, '\%').replace(/_/g, '\_'))+"%"]
              ]
            });
            app.set({selectors});
            alert("Added selector to filter for this searth term and service.");
          };
        }

        if (sort === "value") {
          data.sort((a, b) => b.value - a.value);
        } else if (sort === "property") {
          data.sort((a, b) => {
            if (a.sortProperty < b.sortProperty) {
              return -1;
            } else if (b.sortProperty < a.sortProperty) {
              return 1;
            } else {
              return 0;
            }
          });
        }

        return {data, eventHandlers};
      }
    },

    allReferers: {
      name: "All Referers",
      axisLabel: "Requests",
      defaultChartFunction: "horizontalBar",
      sorting: ["value", "property"],
      func: LogEntry.aggregateExtractBy("referer", "Direct Request")
    }
  }
  static userAgentBasedAggregateFunctions = {
    browser: {
      name: "Browser",
      axisLabel: "Requests",
      defaultChartFunction: "pie",
      sorting: ["value", "property"],
      func: LogEntry.aggregateExtractBy("uaBrowserName", "Unknown")
    },

    browserVersion: {
      name: "Browser Version",
      axisLabel: "Requests",
      defaultChartFunction: "pie",
      sorting: ["value", "property"],
      func: LogEntry.aggregateExtractBy("uaBrowserName", "Unknown", "uaBrowserVersion")
    },

    cpuArchitecture: {
      name: "CPU Architecture",
      axisLabel: "Requests",
      defaultChartFunction: "pie",
      sorting: ["value", "property"],
      func: LogEntry.aggregateExtractBy("uaCpuArchitecture", "Unknown")
    },

    deviceType: {
      name: "Device Type",
      axisLabel: "Requests",
      defaultChartFunction: "pie",
      sorting: ["value", "property"],
      func: LogEntry.aggregateExtractBy("uaDeviceType", "Unknown")
    },

    deviceVendor: {
      name: "Device Vendor",
      axisLabel: "Requests",
      defaultChartFunction: "pie",
      sorting: ["value", "property"],
      func: LogEntry.aggregateExtractBy("uaDeviceVendor", "Unknown")
    },

    deviceModel: {
      name: "Device Model",
      axisLabel: "Requests",
      defaultChartFunction: "pie",
      sorting: ["value", "property"],
      func: LogEntry.aggregateExtractBy("uaDeviceVendor", "Unknown", "uaDeviceModel")
    },

    engine: {
      name: "Engine",
      axisLabel: "Requests",
      defaultChartFunction: "pie",
      sorting: ["value", "property"],
      func: LogEntry.aggregateExtractBy("uaEngineName", "Unknown")
    },

    engineVersion: {
      name: "Engine Version",
      axisLabel: "Requests",
      defaultChartFunction: "pie",
      sorting: ["value", "property"],
      func: LogEntry.aggregateExtractBy("uaEngineName", "Unknown", "uaEngineVersion")
    },

    os: {
      name: "OS",
      axisLabel: "Requests",
      defaultChartFunction: "pie",
      sorting: ["value", "property"],
      func: LogEntry.aggregateExtractBy("uaOsName", "Unknown")
    },

    osVersion: {
      name: "OS Version",
      axisLabel: "Requests",
      defaultChartFunction: "pie",
      sorting: ["value", "property"],
      func: LogEntry.aggregateExtractBy("uaOsName", "Unknown", "uaOsVersion")
    },

    allUserAgents: {
      name: "All User Agents",
      axisLabel: "Requests",
      defaultChartFunction: "horizontalBar",
      sorting: ["value", "property"],
      func: LogEntry.aggregateExtractBy("userAgent", "Unknown")
    }
  }
  static geoBasedAggregateFunctions = {
    timeZone: {
      name: "Timezone",
      axisLabel: "Requests",
      defaultChartFunction: "pie",
      sorting: ["value", "property"],
      func: LogEntry.aggregateExtractBy("timeZone", "Unknown")
    },

    continentCode: {
      name: "Continent Code",
      axisLabel: "Requests",
      defaultChartFunction: "pie",
      sorting: ["value", "property"],
      func: LogEntry.aggregateExtractBy("continentCode", "Unknown")
    },

    continent: {
      name: "Continent",
      axisLabel: "Requests",
      defaultChartFunction: "pie",
      sorting: ["value", "property"],
      func: LogEntry.aggregateExtractBy("continent", "Unknown")
    },

    countryCode: {
      name: "Country Code",
      axisLabel: "Requests",
      defaultChartFunction: "pie",
      sorting: ["value", "property"],
      func: LogEntry.aggregateExtractBy("countryCode", "Unknown")
    },

    country: {
      name: "Country",
      axisLabel: "Requests",
      defaultChartFunction: "pie",
      sorting: ["value", "property"],
      func: LogEntry.aggregateExtractBy("country", "Unknown")
    },

    provinceCode: {
      name: "Province Code",
      axisLabel: "Requests",
      defaultChartFunction: "pie",
      sorting: ["value", "property"],
      func: LogEntry.aggregateExtractBy("provinceCode", "Unknown")
    },

    province: {
      name: "Province",
      axisLabel: "Requests",
      defaultChartFunction: "pie",
      sorting: ["value", "property"],
      func: LogEntry.aggregateExtractBy("province", "Unknown")
    },

    postalCode: {
      name: "Postal Code",
      axisLabel: "Requests",
      defaultChartFunction: "pie",
      sorting: ["value", "property"],
      func: LogEntry.aggregateExtractBy("postalCode", "Unknown")
    },

    city: {
      name: "City",
      axisLabel: "Requests",
      defaultChartFunction: "pie",
      sorting: ["value", "property"],
      func: LogEntry.aggregateExtractBy("city", "Unknown")
    },

    countryProvince: {
      name: "Country and Province",
      axisLabel: "Requests",
      defaultChartFunction: "pie",
      sorting: ["value", "property"],
      func: LogEntry.aggregateExtractBy("country", "Unknown", "province")
    },

    countryCity: {
      name: "Country and City",
      axisLabel: "Requests",
      defaultChartFunction: "pie",
      sorting: ["value", "property"],
      func: LogEntry.aggregateExtractBy("country", "Unknown", "city")
    },

    countryPostalCode: {
      name: "Country and Postal Code",
      axisLabel: "Requests",
      defaultChartFunction: "pie",
      sorting: ["value", "property"],
      func: LogEntry.aggregateExtractBy("country", "Unknown", "postalCode")
    },

    provinceCity: {
      name: "Province and City",
      axisLabel: "Requests",
      defaultChartFunction: "pie",
      sorting: ["value", "property"],
      func: LogEntry.aggregateExtractBy("province", "Unknown", "city")
    }
  }

  // === Constructor ===

  constructor(id) {
    super(id);

    // === Instance Properties ===

    this.logLines = [];
  }

  // === Instance Methods ===

  /**
   * @return {boolean} True is the line was parsed, false if the entry should be skipped according to options.
   */
  async parseAndSet(line, options, ipDataCache) {
    return false;
  }

  parseFields(line, maxFields, separator = ' ', enclosingPairs = ['""', '[]']) {
    // Parse fields and place them back together for things enclosed in pairs.
    let fieldsBroken = line.split(separator), fields = [], searching = null;
    for (let k = 0; k < fieldsBroken.length; k++) {
      if (searching || fields.length >= maxFields) {
        fields[fields.length - 1] += separator + fieldsBroken[k];
        if (searching && fieldsBroken[k].substr(-1) === searching) {
          searching = null;
        }
      } else {
        fields.push(fieldsBroken[k]);
        for (let pair of enclosingPairs) {
          let [start, end] = pair.split('');
          if (fieldsBroken[k].substr(0, 1) === start && ((start === end && fieldsBroken[k].length === 1) || fieldsBroken[k].substr(-1) !== end)) {
            searching = end;
          }
        }
      }
    }
    return fields;
  }

  parseUAString(userAgent) {
    const uaParser = require('ua-parser-js');

    const uaParts = uaParser(userAgent);

    return {
      uaBrowserName: uaParts.browser.name,
      uaBrowserVersion: uaParts.browser.version,
      uaCpuArchitecture: uaParts.cpu.architecture,
      uaDeviceModel: uaParts.device.model,
      uaDeviceType: uaParts.device.type,
      uaDeviceVendor: uaParts.device.vendor,
      uaEngineName: uaParts.engine.name,
      uaEngineVersion: uaParts.engine.version,
      uaOsName: uaParts.os.name,
      uaOsVersion: uaParts.os.version,
    }
  }

  addLine(line) {
    this.logLines.push(line);
  }

  getLogLine() {
    return this.logLines.join("\n");
  }

  isLogLineContinuation(line) {
    return false;
  }

  isLogLineComplete() {
    return !!this.logLines.length;
  }

  // === Static Methods ===

  static isLogLineStart(line) {
    // Just check the line doesn't start with white space.
    return !line.match(/^\s/);
  }

  static getIpLocationData(ip, ipDataCache) {
    const curl = require('curl');

    if (ipDataCache[ip]) {
      return Promise.resolve(ipDataCache[ip]);
    }

    console.log("Looking up location data for IP: "+ip);

    ipDataCache[ip] = new Promise((resolve, reject) => {
      LogEntry.getGeoLite2IpInfo(ip).then((ipInfo) => {
        let nonNullFound = false;
        for (let p in ipInfo) {
          if (ipInfo[p] !== null) {
            nonNullFound = true;
            break;
          }
        }
        if (!nonNullFound) {
          console.log("IP location data not found in GeoLite2 DB.");
          console.log("Falling back to ip2c.org...");
          fallback();
          return;
        }
        resolve(ipInfo);
      }, (err) => {
        console.log("Couldn't get location data from GeoLite2 DB: "+err);
        console.log("Falling back to ip2c.org...");
        fallback();
      });
      function fallback() {
        const ipInfoUrl = `http://ip2c.org/${ip}`;
        curl.get(ipInfoUrl, null, function(err, response, body) {
          if (err) {
            console.log("Couldn't get location data: "+err);
            reject(err);
            return;
          }
          const [result, countryCode, unused, country] = body.split(';', 4);
          switch (result) {
            case '0':
            case '2':
            default:
              resolve({
                timeZone: null,
                continentCode: null,
                continent: null,
                countryCode: null,
                country: null,
                provinceCode: null,
                province: null,
                postalCode: null,
                city: null
              });
              return;
            case '1':
              resolve({
                timeZone: null,
                continentCode: null,
                continent: null,
                countryCode,
                country,
                provinceCode: null,
                province: null,
                postalCode: null,
                city: null
              });
              return;
          }
          resolve({});
        });
      }
    });

    return ipDataCache[ip];
  }

  static getGeoLite2IpInfo(...args) {
    return LogEntry.serverCallStatic('getGeoLite2IpInfo', args);
  }

  ///////////////////////////////////////
  //  Aggregetor Functions
  ///////////////////////////////////////

  static aggregateExtractBy(property, unknownIsCalled, appendProperty) {
    return function (entries, sort) {
      const values = {};
      const data = [], eventHandlers = {};

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const value = entry.get(property);

        if ((!value && value !== 0) || value === "-") {
          if (values[unknownIsCalled]) {
            values[unknownIsCalled].value++;
          } else {
            values[unknownIsCalled] = {value: 1};
          }
        } else {
          let finalVal = value, valueAppend;
          if (appendProperty) {
            valueAppend = entry.get(appendProperty);
            if (!valueAppend) {
              valueAppend = '-';
            }
            finalVal += ' '+valueAppend;
          }
          if (values[finalVal]) {
            values[finalVal].value++;
          } else {
            if (appendProperty) {
              values[finalVal] = {
                propValue: value,
                appendValue: valueAppend,
                value: 1
              };
            } else {
              values[finalVal] = {
                propValue: value,
                value: 1
              };
            }
          }
        }
      }

      // Convert every entry to an array.
      for (let k in values) {
        const label = k + " (" + (Math.round(values[k].value / entries.length * 10000) / 100) + "%, " + values[k].value + ")";
        data.push({
          label: label,
          value: values[k].value,
          sortProperty: (k.match(/^[0-9.]+$/) && parseFloat(k, 10) !== NaN) ? parseFloat(k, 10) : k.toLowerCase()
        });
        if (k === unknownIsCalled) {
          eventHandlers[label] = function(app) {
            const selectors = app.get("selectors");
            selectors.push({
              type: "&",
              "1": {
                type: "|",
                data: [
                  [property, false]
                ],
                strict: [
                  [property, "-"]
                ],
                "!isset": [property]
              },
              "!strict": [
                [property, 0]
              ]
            });
            app.set({selectors});
            alert("Added selector to filter for an unknown " + property + ".");
          };
        } else {
          eventHandlers[label] = function(app) {
            const selectors = app.get("selectors");
            if (appendProperty) {
              if (values[k].appendValue === "-") {
                selectors.push({
                  type: "&",
                  "1": {
                    type: "|",
                    data: [
                      [appendProperty, false]
                    ],
                    strict: [
                      [appendProperty, "-"]
                    ],
                    "!isset": [appendProperty]
                  },
                  "!strict": [
                    [appendProperty, 0]
                  ],
                  strict: [
                    [property, values[k].propValue]
                  ]
                });
              } else {
                selectors.push({
                  type: "&",
                  strict: [
                    [property, values[k].propValue],
                    [appendProperty, values[k].appendValue]
                  ]
                });
              }
            } else {
              selectors.push({
                type: "&",
                strict: [
                  [property, values[k].propValue]
                ]
              });
            }
            app.set({selectors});
            alert("Added selector to filter for this " + property + (appendProperty ? " and " + appendProperty : "") + ".");
          };
        }
      }

      if (sort === "value") {
        data.sort((a, b) => b.value - a.value);
      } else if (sort === "property") {
        data.sort((a, b) => {
          if (typeof a.sortProperty === "number" && typeof b.sortProperty !== "number") {
            return -1;
          } else if (typeof b.sortProperty === "number" && typeof a.sortProperty !== "number") {
            return 1;
          } else if (a.sortProperty < b.sortProperty) {
            return -1;
          } else if (b.sortProperty < a.sortProperty) {
            return 1;
          } else {
            return 0;
          }
        });
      }

      return {data, eventHandlers};
    };
  }

  static aggregateExtractArray(property) {
    return function (entries, sort) {
      const values = {};
      const data = [], eventHandlers = {};

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const value = entry.get(property);

        if (value === []) {
          if (values["Empty"]) {
            values["Empty"].value++;
          } else {
            values["Empty"] = {value: 1};
          }
        } else if (!value) {
          if (values["Invalid"]) {
            values["Invalid"].value++;
          } else {
            values["Invalid"] = {value: 1};
          }
        } else {
          for (let finalVal of value) {
            if (values[finalVal]) {
              values[finalVal].value++;
            } else {
              values[finalVal] = {
                propValue: value,
                value: 1
              };
            }
          }
        }
      }

      // Convert every entry to an array.
      for (let k in values) {
        const label = k + " (" + (Math.round(values[k].value / entries.length * 10000) / 100) + "%, " + values[k].value + ")";
        data.push({
          label: label,
          value: values[k].value,
          sortProperty: (k.match(/^[0-9.]+$/) && parseFloat(k, 10) !== NaN) ? parseFloat(k, 10) : k.toLowerCase()
        });
        if (k === "Empty") {
          eventHandlers[label] = function(app) {
            const selectors = app.get("selectors");
            selectors.push({
              type: "&",
              strict: [
                [property, []]
              ]
            });
            app.set({selectors});
            alert("Added selector to filter for empty " + property + ".");
          };
        } else if (k === "Invalid") {
          eventHandlers[label] = function(app) {
            const selectors = app.get("selectors");
            selectors.push({
              type: "|",
              data: [
                [property, false]
              ],
              "!isset": [property]
            });
            app.set({selectors});
            alert("Added selector to filter for invalid " + property + ".");
          };
        } else {
          eventHandlers[label] = function(app) {
            const selectors = app.get("selectors");
            selectors.push({
              type: "&",
              array: [
                [property, values[k].propValue]
              ]
            });
            app.set({selectors});
            alert("Added selector to filter for this value in " + property + ".");
          };
        }
      }

      if (sort === "value") {
        data.sort((a, b) => b.value - a.value);
      } else if (sort === "property") {
        data.sort((a, b) => {
          if (typeof a.sortProperty === "number" && typeof b.sortProperty !== "number") {
            return -1;
          } else if (typeof b.sortProperty === "number" && typeof a.sortProperty !== "number") {
            return 1;
          } else if (a.sortProperty < b.sortProperty) {
            return -1;
          } else if (b.sortProperty < a.sortProperty) {
            return 1;
          } else {
            return 0;
          }
        });
      }

      return {data, eventHandlers};
    };
  }

  static aggregateExtractPerTime(property, timeUnit) {
    return function (entries, sort) {
      const timeFormat = "YYYY-MM-DD HH:mm:ss";

      function newDateString(timestamp) {
        return moment(""+timestamp, "X").format(timeFormat);
      }

      let earliest, latest, timePer = {}, data = [];

      // Go through and save every entry per time unit and save earliest/latest.
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        let timeCalc = moment(Math.floor(entry.get(property)) * 1000);
        switch (timeUnit) {
          case 'y':
            timeCalc = timeCalc.dayOfYear(0).hours(0).minutes(0).seconds(0);
            break;
          case 'Q':
            const quarter = timeCalc.quarter();
            timeCalc = timeCalc.dayOfYear(0).hours(0).minutes(0).seconds(0).quarter(quarter);
            break;
          case 'M':
            timeCalc = timeCalc.date(0).hours(0).minutes(0).seconds(0);
            break;
          case 'w':
            timeCalc = timeCalc.day(0);
            // Fall through
          case 'd':
            timeCalc = timeCalc.hours(0);
            // Fall through
          case 'h':
            timeCalc = timeCalc.minutes(0);
            // Fall through
          case 'm':
            timeCalc = timeCalc.seconds(0);
        }
        const time = timeCalc.unix();

        if (time < earliest || earliest === undefined) {
          earliest = time;
        }
        if (time > latest || latest === undefined) {
          latest = time;
        }
        if (timePer[time]) {
          timePer[time]++;
        } else {
          timePer[time] = 1;
        }
      }

      // Now comes the hard part. Going through every time unit from earliest to
      // latest and calculating number of entries.
      let previous;
      for (let i = earliest; i <= latest; i = moment(i * 1000).add(1, timeUnit).unix()) {
        const qps = timePer.hasOwnProperty(i) ? timePer[i] : 0;
        if (qps != previous || previous === undefined) {
          previous = qps;
          data.push({
            label: newDateString(i),
            value: qps
          });
        }
      }

      return {data};
    }
  }
}

Nymph.setEntityClass(LogEntry.class, LogEntry);
export {LogEntry};
