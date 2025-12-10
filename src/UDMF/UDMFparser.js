// jshint esversion: 8
// Import dependencies
const nearley = require("nearley");        // Nearley parser for parsing grammar
const grammar = require("./UDMFGrammar");  // Precompiled UDMF grammar for Nearley
const UDMF = require('./UDMF');            // UDMF data structures (Level, Sector, LineDef, etc.)
const Terminal = require('./../lib/term'); // Terminal helper for logging styled messages
const term = new Terminal();               // Instance of Terminal for logging
const strip = require('strip-comments');   // Utility to remove comments from code
const eol = require('eol');                // Normalize line endings

/**
 * UDMFParser
 * Parses UDMF TEXTMAP lumps into structured JSON using Nearley grammar.
 */
class UDMFParser
{
    /**
     * Strip comments from UDMF text.
     * This removes // comments and ensures boolean literals are preserved as strings.
     * @param {String} str - UDMF text with comments
     * @returns {String} - Text with comments removed
     */
    static stripComments(str)
    {
        var s = str
            .replace(/\/\/.*/gm, '')  // Remove single-line C++ style comments
            .replace(/true/, "true")  // Preserve 'true' as string (may be redundant)
            .replace(/false/, "false"); // Preserve 'false' as string
        return s;
    }

    /**
     * Parse UDMF lump to structured Level object.
     * @param {String} data - Contents of TEXTMAP lump
     * @returns {Promise<UDMF.Level>} - Parsed level with sectors, linedefs, things, etc.
     */
    static async parse(data)
    {
        return new Promise(function (resolve, reject) { 
            // Normalize line endings to LF
            term.say().yellow('CLRF => LF').print();
            data = eol.lf(data);

            // Strip comments using strip-comments package
            term.say().yellow('Stripping comments...').print();
            let stripped = strip(data);

            // Remove first line and trim whitespace
            let lines = stripped.split('\n');
            lines.splice(0, 1);
            stripped = lines.join('\n').trim();

            term.say().yellow('Comments Stripped').print();
            term.div();

            // Split into chunks (UDMF blocks) by empty lines
            term.say().yellow('Finding blocks...').print();
            let chunked = stripped
                .split(/^\s*$/gm)
                .filter(str => str !== '');

            term.say().yellow('Found ').white(chunked.length).yellow(' UDMF blocks.').print();

            // Initialize parsed structure
            var parsedUDMF = {
                thing: [],
                sector: [],
                sidedef: [],
                linedef: [],
                vertex: []
            };

            var lastType;        // Track last parsed block type for logging
            var lastProgress = 0; // Track progress in 10% increments

            // Parse each chunk (UDMF block)
            chunked.forEach((datachunk, chunkindex) => {
                // Calculate progress percentage
                let progress = (chunked.length > 0) ? (chunkindex / chunked.length) * 100 : 1;
                progress = Math.floor(progress / 10) * 10;

                // Log progress if changed
                if (progress !== lastProgress) {
                    term.say().yellow('Parsing UDMF: ').white(`${progress}%`).yellow(' complete...').print(); 
                }
                lastProgress = progress;

                // Create new Nearley parser for this chunk
                const parser = new nearley.Parser(nearley.Grammar.fromCompiled(grammar));

                // Reject if chunk does not contain opening brace
                if (!datachunk.match(/\{/)) {
                    console.log(datachunk);
                    reject('BAD BLOCK');
                }

                datachunk = datachunk.trim();
                parser.feed(datachunk); // Parse the chunk

                // Handle parse results
                if (parser.results) {
                    if (parser.results.length > 1) {
                        // Ambiguous parse
                        term.error('Ambiguous block found...');
                    } else {
                        let result = parser.results[0][0];

                        // Log new block type
                        if (result.blocktype && result.blocktype !== lastType) {
                            term.say().yellow('Parsing ').white(result.blocktype).yellow(' data blocks').print();
                        }
                        lastType = result.blocktype;

                        // Push result to appropriate array
                        parsedUDMF[result.blocktype].push(result);
                    }
                } else {
                    term.error('COULD NOT PARSE BLOCK');
                    console.log(datachunk);
                }
            });

            // Remove null or undefined entries from parsed arrays
            for (var elem in parsedUDMF) {
                parsedUDMF[elem] = parsedUDMF[elem].filter(blk => blk !== null && blk !== undefined);
            }

            // Create a Level object from parsed data
            let level = new UDMF.Level(parsedUDMF);

            // Resolve promise with parsed level
            return resolve(level);
        });
    }
}

// Export parser
module.exports = UDMFParser;
