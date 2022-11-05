//jshint esversion: 8
const nearley = require("nearley");
const grammar = require("./UDMFGrammar");
const UDMF = require('./UDMF');
const Terminal = require('./../lib/term');
const term = new Terminal();

class UDMFParser
{
    /**
     * Strip C style comments out of a string
     * @param { String } str String with C style comments
     * @returns { String } String without comments
     */
    static stripComments (str)
    {
        var s = str
        .replace(/\/\/.*/gm, '')
        .replace(/true/, "true")
        .replace(/false/, "false");
        return s;
    }

    /**
     * Parse UDMF lump to JSON.
     * See {@link https://github.com/rheit/zdoom/blob/master/specs/udmf.txt UDMF Specification} for more details.
     * @param { String } data String contents of TEXTMAP Lump
     * @returns { UDMF.Level } JSON of UDMF lump with helper utilities
     */
    static async parse(data)
    {
        return new Promise (function (resolve, reject){ 

            term.say().yellow('Stripping comments...').print();

            let stripped = UDMFParser.stripComments(data)
            .replace(`namespace = "zdoom";`, '').trim();

            term.say().yellow('Comments Stripped').print();

            term.div();

            term.say().yellow('Finding blocks...').print();

            let chunked = stripped.split(/^\s*$/gm);

            term.say().yellow('Found ').white(chunked.length).yellow( ' UDMF blocks.').print();
        
            var parsedUDMF = {
                thing: [],
                sector: [],
                sidedef: [],
                linedef: [],
                vertex: []
            };

            var lastType;
            var lastProgress = 0;

            chunked.forEach( (datachunk, chunkindex ) => {

                let progress = (chunked.length > 0) ? (chunkindex / chunked.length) * 100 : 1;
                progress =  Math.floor (progress / 10) * 10;

                if (progress !== lastProgress)
                {
                    term.say().yellow('Parsing UDMF: ').white( `${progress}%` ).yellow(' complete...').print(); 
                }

                lastProgress = progress;

                const parser = new nearley.Parser(nearley.Grammar.fromCompiled(grammar));
                datachunk = datachunk.trim();
                parser.feed(datachunk);
        
                if (parser.results )
                {
                    if (parser.results.length > 1) 
                    {
                        term.error('Ambiguous block found...');

                    } else {

                        let result = parser.results[0][0];

                        if (result.blocktype && result.blocktype !== lastType)
                        {
                            term.say().yellow('Parsing ').white( result.blocktype ).yellow(' data blocks').print();
                        }

                        lastType = result.blocktype;

                        parsedUDMF[result.blocktype].push(result);
                    }

                } else {
                    term.error('COULD NOT PARSE BLOCK');
                    console.log(datachunk);
                }
        
            });

            let level = new UDMF.Level(parsedUDMF);

            return resolve(level);
        });
    }
}

module.exports = UDMFParser;


