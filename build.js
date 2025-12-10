// jshint esversion: 8

// Node.js core modules
const path = require('path');   // For file and directory path manipulation
const fs = require('fs');       // For filesystem operations
const _ = require('lodash');    // Utility library for data manipulation

// Custom modules for WAD loading, UDMF parsing, scene creation, and navmesh generation
const WadLoader = require('./src/lib/WadLoader');
const UDMFParser = require('./src/UDMF/UDMFparser');
const UDMFtoTHREE = require('./src/lib/UDMFtoTHREE');
const NavMesher = require('./src/lib/Navmesher');
const { makeZoneJSON } = require('./src/lib/NavJSON');
let configTemplate = require('./src/lib/ConfigTemplate');

// Strip comments from config JSON before parsing
const strip = require('strip-comments');

/**
 * Construct the path to a map's JSON configuration file
 * @param {string} mapname - Name of the map
 * @param {object} MasterConfig - Master configuration object containing paths
 * @returns {string} Full path to map's JSON config
 */
function getConfigPath(mapname, MasterConfig) {
    return path.join(MasterConfig.configspath, `${mapname}.json`);
}

/**
 * Load a level by name and convert it into a THREE.js scene.
 * Can optionally return a preview scene or the full navScene.
 * @param {string} LevelName - Name of the level/map
 * @param {boolean} preview - If true, return preview scene JSON; otherwise full scene
 * @param {object} MasterConfig - Master configuration object containing paths
 * @returns {Promise} Resolves with scene data
 */
var getLevel = function(LevelName, preview, MasterConfig) {
    return new Promise(function(resolve, reject) {
        // Normalize level name to uppercase
        LevelName = _.toUpper(LevelName);

        // Construct path to WAD file for this level
        let mapfile = path.join(MasterConfig.wadspath, `${LevelName}.wad`);

        // Reject if WAD file does not exist
        if (!fs.existsSync(mapfile)) {
            return reject(' file does not exist ');
        }

        // Construct path to the map's JSON config
        const MAP_CONFIG_PATH = getConfigPath(LevelName, MasterConfig);

        // If config does not exist, create default one from template
        if (!fs.existsSync(MAP_CONFIG_PATH)) {
            console.log(" no config found ");
            fs.writeFileSync(MAP_CONFIG_PATH, Buffer.from(configTemplate), { encoding: 'utf-8' });
        }

        // Read and parse the config JSON
        var configData = fs.readFileSync(MAP_CONFIG_PATH, { encoding: 'utf-8' });
        var config = JSON.parse(strip(configData));

        // Extract WAD filename
        let wadpath = path.parse(mapfile);
        let wadname = wadpath.name + wadpath.ext;

        // Load the WAD, extract TEXTMAP lump, parse UDMF, and create THREE.js scene
        WadLoader.loadWAD(mapfile)
        .then(wad => WadLoader.getTextMap(wad))
        .then(TEXTMAP => UDMFParser.parse(TEXTMAP))
        .then(udmfdata => UDMFtoTHREE.makeScene(udmfdata))
        .then(scenes => {
            if (preview) {
                // Return preview scene and config as JSON
                return resolve(JSON.stringify({ scene: scenes.scenePreview.toJSON(), config: config }));
            } else {
                // Return full navigation scene
                return resolve(scenes.navScene);
            }
        })
        .catch(err => {
            console.log(err);
            reject(err);
        });
    });
};

/**
 * Build a navigation mesh for a level and save outputs to disk.
 * @param {string} LevelName - Name of the level/map
 * @param {object} config - Configuration for navmesh generation
 * @param {object} MasterConfig - Master configuration object containing paths
 * @returns {Promise} Resolves with navmesh preview JSON
 */
var buildNavMesh = function(LevelName, config, MasterConfig) {
    var navScene;
    var previewWavefront;
    return new Promise(function(resolve, reject) {

        var threescene;

        // Load level and get full THREE.js scene
        getLevel(LevelName, false, MasterConfig)
        .then(scene => {
            threescene = scene;
            return UDMFtoTHREE.getOBJ(scene); // Convert scene to OBJ format
        })
        .then(OBJData => NavMesher.BuildRecastFromOBJ(OBJData, config)) // Generate polygon data from OBJ
        .then(polydata => NavMesher.CreateSceneFromRecast(polydata, config, threescene)) // Build THREE.js nav scene
        .then(navmesh => {
            let { mesh, preview, alt, wavefront } = navmesh;
            previewWavefront = wavefront;
            navScene = preview;

            // Convert navmesh polygon data into zone JSON
            return makeZoneJSON(mesh, alt);
        })
        .then(data => {
            // Save generated JSON and OBJ files
            let jsonBuffer = Buffer.from(JSON.stringify(data, null));
            let OBJBuffer = Buffer.from(previewWavefront);

            let destJSON = path.join(MasterConfig.meshpath, `${LevelName}.json`);
            let destOBJ = path.join(MasterConfig.meshpath, `navprev.obj`);

            fs.writeFileSync(destJSON, jsonBuffer, { encoding: 'utf-8' });
            fs.writeFileSync(destOBJ, OBJBuffer, { encoding: 'utf-8' });

            // Update map config on disk
            const MAP_CONFIG_PATH = getConfigPath(LevelName, MasterConfig);
            fs.writeFileSync(MAP_CONFIG_PATH, Buffer.from(JSON.stringify(config)), { encoding: 'utf-8' });

            // Resolve with navScene preview JSON
            return resolve(JSON.stringify(navScene.toJSON()));
        })
        .catch(err => {
            console.log(err);
            return reject(err);
        });
    });
};

// Export functions for external use
module.exports = { getLevel, buildNavMesh };
