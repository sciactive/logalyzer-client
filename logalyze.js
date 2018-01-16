const fs = require('fs');
const path = require('path');
const readline = require('readline');
const Writable = require('stream').Writable;
const nReadlines = require('n-readlines');
const argv = require('minimist')(process.argv.slice(2));

// Nymph Node client for the win.
const NymphNode = require('nymph-client-node');
NymphNode.enableCookies();
const Nymph = NymphNode.Nymph;

// Making gratuitous requests to someone else's service isn't very nice.
const ipDataCache = {};

if (argv.help || argv.h) {
  printHelp();
  process.exit(0);
}

if (argv.version) {
  printVersion();
  process.exit(0);
}

// Did they call us correctly?
if (argv._.length !== 1) {
  printHelp();
  process.exit(1);
}

// Set up Nymph.
Nymph.init({
  restURL: argv['rest-url'] || 'http://localhost:8080/rest.php'
});
const logEntryTypes = {};
const logEntryFiles = fs.readdirSync('./entities/');
for (let file of logEntryFiles) {
  if (file.match(/\.js$/) && file !== 'LogEntry.js') {
    const name = path.basename(file, '.js');
    logEntryTypes[name] = require('./build/'+file.replace(/\.js$/, ''))[name];
  }
}

const User = require('tilmeld').User;
const Group = require('tilmeld').Group;

(async () => {
  let LogEntry;
  if (argv.type || argv.t) {
    LogEntry = logEntryTypes[argv.type || argv.t];
  } else if (argv.f) {
    const matchedLogEntryTypes = [];
    for (let logEntryType in logEntryTypes) {
      if (path.basename(argv.f).match(logEntryTypes[logEntryType].filePattern)) {
        matchedLogEntryTypes.push(logEntryType);
      }
    }
    if (matchedLogEntryTypes.length === 1) {
      LogEntry = logEntryTypes[matchedLogEntryTypes[0]];
    } else if (matchedLogEntryTypes.length > 1) {
      console.log('Log file matches multiple log entry type patterns. You must specify from the following log types:\n');
      for (let logEntryType of matchedLogEntryTypes) {
        console.log('*', logEntryType, '-', logEntryTypes[logEntryType].title);
      }
      console.log('');
    }
  }
  if (!LogEntry) {
    console.log('Couldn\'t determine the log type. You need to provide one.');
    printHelp();
    process.exit(1);
  } else {
    console.log('Using Log Type:', LogEntry.class, '-', LogEntry.title);
  }

  // Only do this if we need, in case we're reading from stdin.
  let rl, mutableStdout;
  const getRl = () => {
    if (rl) {
      return rl;
    }

    mutableStdout = new Writable({
      write: function(chunk, encoding, callback) {
        if (!this.muted) {
          process.stdout.write(chunk, encoding);
        }
        callback();
      }
    });

    mutableStdout.muted = false;

    rl = readline.createInterface({
      input: process.stdin,
      output: mutableStdout,
      terminal: true
    });
    return rl;
  }

  // Did they provide a username?
  let username = '';
  if (argv.username) {
    username = argv.username;
  } else if (argv.u) {
    username = argv.u;
  } else {
    username = await new Promise((resolve) => getRl().question('Username for Lagalyzer server: ', (answer) => resolve(answer)));
  }

  // Did they provide a password?
  let password = '';
  if (argv.password) {
    password = argv.password;
  } else if (argv.p) {
    password = argv.p;
  } else {
    password = await new Promise((resolve) => {
      getRl().question('Password for Lagalyzer server: ', (answer) => resolve(answer));
      mutableStdout.muted = true;
    });
    console.log('');
    mutableStdout.muted = false;
  }

  // Can we log in?
  try {
    let data = await User.loginUser({username, password});
    if (!data.result) {
      console.log("Couldn't log in: ", data.message);
      process.exit(1);
    }
  } catch (err) {
    console.log("err: ", err);
    process.exit(1);
  }

  if (LogEntry.usesIpLocationInfo) {
    // Did they download the GeoLite2 database?
    try {
      await LogEntry.getGeoLite2IpInfo('8.8.8.8');
    } catch (e) {
      if (e.code === 4000) {
        printIpDbInstructions();
        process.exit(1);
      } else {
        console.log("Can't communicate with backend to lookup IPs.");
        process.exit(1);
      }
    }
  }

  // Main function.
  switch (argv._[0]) {
    case 'add':
    case 'remove':
      if (!argv.f) {
        console.log('You\'re missing the file part of the command...');
        printHelp();
        process.exit(1);
      }

      let inputFile, uncompressedFile;
      if (argv.f.match(/\.gz$/)) {
        // Uncompress the gzipped log file.
        console.log("Uncompressing input file to temporary file.");

        const compressing = require('compressing');
        uncompressedFile = argv.f.replace(/\.gz$/, "");
        await compressing.gzip.uncompress(argv.f, uncompressedFile);
        inputFile = uncompressedFile;
      } else {
        inputFile = argv.f;
      }

      let concurrent = (parseInt(argv.concurrent || argv.c || '1', 10));
      console.log("Going to "+argv._[0]+" "+concurrent+" at a time...");

      // Process a log entry. Once all the lines for an entry are pasted
      // together below, they are processed as one unit.
      let processedEntriesCount = 0;
      const processLogEntry = async (entry) => {
        // Removes are super easy to handle.
        if (argv._[0] === 'remove') {
          try {
            const removes = await Nymph.getEntities({'class': LogEntry.class}, {'type': '&', 'strict': ['line', entry.getLogLine()]});
            if (removes.length) {
              console.log(`\nRemoving ${removes.length} entries...`);
              console.log(await Nymph.deleteEntities(removes));
            }
            // Wait 10 msec between each request, to not overload the server.
            await new Promise((r) => {setTimeout(() => r(), 10)});
          } catch (err) {
            console.log('\nCouldn\'t check for entry. Got err: ', err, '\n');
          }
          return;
        }

        // Parse the log line.
        try {
          const parseResult = await entry.parseAndSet(argv, ipDataCache);
        } catch (e) {
          console.log('\nError while parsing: ', e, '\n');
          return;
        }

        if (!parseResult) {
          // The entry class says not to save this one.
          return;
        }

        // Save the entry to the DB.
        console.log('Saving log entry: ', ++processedEntriesCount);
        try {
          await entry.save();
        } catch (e) {
          console.log('\nError while saving: ', e, '\n');
          return;
        }
        if (!entry.guid) {
          console.log('\nCouldn\'t save log entry: ', entry, '\n');
        }
      };

      // Read the file (or stdin) line by line. The getNextLine function returns
      // a promise that will be resolved with the next line read.
      let getNextLine;
      if (inputFile === '-') {
        // This is convoluted and weird, but it reads from stdin like we need.
        console.log('Reading from stdin...');
        let requested = [], cache = [];
        process.stdin.setEncoding('utf8');
        process.stdin.pipe(require('split')()).on('data', (line) => {
          if (requested.length) {
            const resolve = requested.shift();
            resolve(line);
          } else {
            cache.push(Promise.resolve(line));
          }
        }).on('end', () => {
          console.log('closed...');
          if (requested.length) {
            const resolve = requested.shift();
            resolve(false);
          } else {
            cache.push(Promise.resolve(false));
          }
        });
        getNextLine = () => {
          if (cache.length) {
            return cache.shift();
          }
          return new Promise((resolve) => requested.push(resolve));
        };
      } else {
        // Use n-readlines for regular files.
        console.log(`Reading input file ${inputFile}...`);
        const lineReader = new nReadlines(inputFile);
        getNextLine = async () => {
          const liner = lineReader.next();
          if (!liner) {
            return false;
          }
          return liner.toString('utf-8');
        };
      }

      // Put together each line into a log entry. This allows entries to span
      // multiple lines before they are ultimately processed.
      let origLine, pendingEntries = [], currentProcesses = [];
      while (origLine = await getNextLine()) {
        console.log(origLine);
        const lines = [];

        // Sometimes log lines can be inserted in the middle of others. (I know,
        // it's weird.) This allows an entry class to handle those by using an
        // exact pattern for the whole line.
        if (LogEntry.checkMalformedLines) {
          const match = origLine.match(LogEntry.exactLinePattern);
          if (match && origLine.indexOf(match[0]) !== 0) {
            lines.push(match[0]);
            const nextLine = await getNextLine();
            lines.push(origLine.replace(LogEntry.exactLinePattern, nextLine));
          } else {
            lines.push(origLine);
          }
        } else {
          lines.push(origLine);
        }

        for (let line of lines) {
          // Read lines into pendingEntries until they are complete.
          for (let idx in pendingEntries) {
            let entry = pendingEntries[idx], breakNow = false;
            if (entry.isLogLineContinuation(line)) {
              entry.addLine(line);
              breakNow = true;
            }
            if (entry.isLogLineComplete()) {
              currentProcesses.push(processLogEntry(entry));
              pendingEntries.splice(idx, 1);
            }
            if (breakNow) {
              break;
            }
          }
          if (LogEntry.isLogLineStart(line)) {
            const entry = new LogEntry();
            entry.addLine(line);
            if (entry.isLogLineComplete()) {
              currentProcesses.push(processLogEntry(entry));
            } else {
              pendingEntries.push(entry);
            }
          }

          // Run multiple at a time to speed up processing.
          if (currentProcesses.length >= concurrent) {
            // TODO(hperrin): This will stop every time 10 entries are
            // processed. It should check for only running processes.
            await Promise.all(currentProcesses);
            currentProcesses = [];
          }
        }
      }
      if (pendingEntries.length) {
        console.log(`Incomplete entries: ${pendingEntries.length}`);
      }
      await Promise.all(currentProcesses);

      console.log(`Processed entries: ${processedEntriesCount}`);

      if (argv.f.match(/\.gz$/)) {
        console.log("Removing uncompressed input file.");
        fs.unlinkSync(inputFile);
      }
      break;
    case 'prune':
      break;
    case 'purge':
      console.log('I\'m going to purge all log entries in 5 seconds unless you CTRL+c to cancel me...');
      console.log('5...');
      await new Promise((r) => {setTimeout(() => r(), 1000)});
      console.log('4...');
      await new Promise((r) => {setTimeout(() => r(), 1000)});
      console.log('3...');
      await new Promise((r) => {setTimeout(() => r(), 1000)});
      console.log('2...');
      await new Promise((r) => {setTimeout(() => r(), 1000)});
      console.log('1...');
      await new Promise((r) => {setTimeout(() => r(), 1000)});
      console.log('Purging all entries from the database, 50 at a time...');

      while (1) {
        try {
          const removes = await Nymph.getEntities({'class': LogEntry.class, 'limit': 50});
          if (removes.length) {
            console.log(`\nRemoving ${removes.length} entries...`);
            console.log(await Nymph.deleteEntities(removes));
          } else {
            break;
          }
        } catch (err) {
          console.log('\nCouldn\'t retrieve entities. Got err: ', err, '\n');
        }
        // Wait 10 msec between each request, to not overload the server.
        await new Promise((r) => {setTimeout(() => r(), 10)});
      }
      break;
    default:
      printHelp();
      break;
  }

  process.exit(0);
})();

function printVersion() {
  console.log(`Logalyzer Client by Hunter Perrin
Version 1.0.0`);
}

function printHelp() {
  printVersion();
  console.log(`
This Logalyzer client requires you to have a Logalyzer server.
TODO(hperrin): expand this help printout.

usage: node logalyzer.js <command> [--rest-url=<Logalyzer server Rest URL>]
                         [--username=<username> | -u <username>]
                         [--password=<password> | -p <password>]
                         [--type=<type> | -t <type>]

If you don't specify a Rest URL, 'http://localhost:8080/rest.php' will be used.

Commands are:

  add -f <file> [--skip-dupe-check] [--dont-skip-status] [--dont-skip-metadata]
                [--concurrent=<concurrent> | -c <concurrent>]
    Reads the log file <file> and adds all the entries to the database. Use '-'
    to read from stdin.
    --skip-dupe-check will cause Logalyzer to skip the duplicate entry check it
      does for each entry. (Use this if you know you've never imported these
      entries before.)
    --dont-skip-status will cause Logalyzer to not skip /status.xsl requests.
    --dont-skip-metadata will cause Logalyzer to not skip /admin/metadata
      requests.
    --concurrent will save <concurrent> entries at a time. This may affect
      checking for duplicates.

  remove -f <file> [--concurrent=<concurrent> | -c <concurrent>]
    Reads the log file <file> and removes all the matching entries from the
    database. Don't you hate when you accidentally import the wrong file and you
    have to rebuild the entire database? Not anymore, you don't.
    --concurrent will remove <concurrent> entries at a time.

  prune -h <hostname>
    Removes log entries from the database that are from <hostname>. You probably
    want to do this with your own hostname so that you don't have to filter out
    your own requests each time you view the logs.

  purge
    Removes all logs from the database.


If you want to have a long running process that adds log lines as they're
appended into the log file, you can use \`tail -f\` and read from stdin using
'-' as the filename. Something like:

  \`tail -f /logs/server.log | node logalyze.js add -u you@example.com \\
    -p password -t ExampleLogEntry -f -\`


Thanks for using Logalyzer. I hope you find it useful.
`);
}

function printIpDbInstructions() {
  console.log(`
It looks like you haven't set up the IP geolocation database on your server. You
should do that now.

1. Go to https://dev.maxmind.com/geoip/geoip2/geolite2/
2. Download the GeoLite2 City database in "MaxMind DB binary, gzipped" format.
3. Extract it, and take the "GeoLite2-City.mmdb" file.
4. Put that file in the "geolite2db" folder in the Logalyzer folder on your
   server.
5. MaxMind releases an updated DB the first Tuesday of each month, so remember
   to update it.

Kudos to MaxMind for providing this DB for free!
`);
}
