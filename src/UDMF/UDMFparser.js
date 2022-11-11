//jshint esversion: 8
const nearley = require("nearley");
const grammar = require("./UDMFGrammar");
const UDMF = require('./UDMF');
const Terminal = require('./../lib/term');
const term = new Terminal();
const strip = require('strip-comments');
const eol = require('eol');

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

            
            term.say().yellow('CLRF => LF').print();
            data = eol.lf( data );

            term.say().yellow('Stripping comments...').print();
            let stripped = strip ( data );
            let lines = stripped.split('\n');
            lines.splice(0,1);
            stripped = lines.join('\n');
            stripped = stripped.trim();


            term.say().yellow('Comments Stripped').print();

            term.div();

            term.say().yellow('Finding blocks...').print();

            let chunked = 
                stripped.split(/^\s*$/gm)
                .filter ( str => str !== '');
                
            
            /*.split(/^\}$/gm).map( str => {
                    if (str.match(/\{/ )) str += '}';
                    return str.trim();
                })
                .filter ( str => str.match(/\{/) && str.match(/\}/) && str !== '' );

            //console.log(chunked[0]);*/

            /*chunked = chunked
                .map( str => str.trim() )
                .filter ( str => str !== '' );*/

            //chunked = chunked.map( str => str.trim() );
            //chunked.shift();
            //chunked = chunked.filter ( str => str !== '' && !str.match() );

            //let preview = stripped.substring(0, 100);
            

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

                if ( !datachunk.match(/\{/)  ) {
                    console.log(datachunk);
                    reject('BAD BLOCK');
                }

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

            for ( var elem in parsedUDMF)
            {
                parsedUDMF[elem] = parsedUDMF[elem].filter ( blk => {
                    return blk !== null && blk !== undefined;
                });
            }

            let level = new UDMF.Level(parsedUDMF);

            return resolve(level);
        });
    }
}

module.exports = UDMFParser;


