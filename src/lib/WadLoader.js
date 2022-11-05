//jshint esversion: 8
const path = require('path');
const fs = require('fs');
const nwad = require('nwad');
const utf8decoder = new TextDecoder();

class WadLoader 
{
    /**
     * Loads a {@link https://doomwiki.org/wiki/WAD Doom Wad} file from a path
     * @param { path } waddir Path/to/Map.wad
     * @returns { nwad.wad } wad contents as Object
     */
    static async loadWAD (waddir)
    {
        return new Promise((resolve, reject)=>{
            let buffer = fs.readFileSync(waddir);

            if (!buffer)
            {
                return reject('Invalid wad file!')
            }

            var wad = nwad.load(buffer);
            return resolve(wad);

        });
    }

    /**
     * Extracts the TEXTMAP {@link https://doomwiki.org/wiki/Lump lump} from {@link https://zdoom.org/index ZDoom} specific
     * {@link https://doomwiki.org/wiki/WAD Doom Wad} files.
     * @param { nwad } wad nwad object
     * @returns { String } TEXTMAP {@link https://doomwiki.org/wiki/Lump lump} as string
     */
    static async getTextMap (wad)
    {
        return new Promise((resolve, reject)=>{

            if (!wad) return reject('No wad found!');

            var textMapIndex = wad.lumps.findIndex( lump => lump.name == 'TEXTMAP');

            if (textMapIndex < 0) return reject('No TEXTMAP lump was found');

            return resolve(utf8decoder.decode(wad.lumps[textMapIndex].data));
        });
    }
}

module.exports = WadLoader;

