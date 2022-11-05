//jshint esversion: 8
const path = require('path');
const fs = require('fs');
const _ = require('lodash');

const WadLoader = require('./src/lib/WadLoader');
const UDMFParser = require('./src/UDMF/UDMFparser');
const UDMFtoTHREE = require('./src/lib/UDMFtoTHREE');
const NavMesher = require('./src/lib/Navmesher');
const { makeZoneJSON } = require('./src/lib/NavJSON');
let configTemplate = require('./src/lib/ConfigTemplate');

const strip = require('strip-comments');


function getConfigPath(mapname, MasterConfig)
{
    return path.join(MasterConfig.configspath, `${mapname}.json`);
}

var getLevel = function( LevelName, preview, MasterConfig )
{
    return new Promise( function(resolve, reject) 
    {
        LevelName = _.toUpper( LevelName );

        let mapfile = path.join(MasterConfig.wadspath, `${LevelName}.wad`);

        if ( !fs.existsSync(mapfile) )
        {
            return reject(' file does not exist ');
        }

        const MAP_CONFIG_PATH = getConfigPath(LevelName, MasterConfig);
    
        if ( !fs.existsSync(MAP_CONFIG_PATH) ) 
        {
            console.log (" no config found ");
            fs.writeFileSync( MAP_CONFIG_PATH, Buffer.from (configTemplate), {encoding: 'utf-8'});
        } 
    
        var configData = fs.readFileSync(MAP_CONFIG_PATH, {encoding: 'utf-8'});
        var config = JSON.parse( strip(configData) );

        let wadpath = path.parse(mapfile);
        let wadname = wadpath.name + wadpath.ext;
    
        WadLoader.loadWAD(mapfile)
        .then( wad => {
            return WadLoader.getTextMap(wad);
        })
    
        .then(TEXTMAP => {
            return UDMFParser.parse(TEXTMAP);
        })
    
        .then( udmfdata => {
            return UDMFtoTHREE.makeScene(udmfdata);
        })
    
        .then( scenes => {

            if (preview)
            {
                return resolve( JSON.stringify( {scene: scenes.scenePreview.toJSON(), config: config }) );
            } else {
                return resolve( scenes.navScene );
            }
            
        })
    
        .catch ( err => {
            console.log(err);
            reject(err);
        });
    });
};

var buildNavMesh = function (LevelName, config, MasterConfig)
{
    var navScene;
    return new Promise ( function(resolve, reject){

        var threescene;

        getLevel ( LevelName, false, MasterConfig )

        .then( scene => {
            threescene = scene;
            return UDMFtoTHREE.getOBJ( scene );
        })
    
        .then( OBJData => {
            return NavMesher.BuildRecastFromOBJ( OBJData , config);
        })
    
        .then( polydata => {
            return NavMesher.CreateSceneFromRecast( polydata, config, threescene );
        })
    
        .then( navmesh => {
            let { mesh, preview, alt } = navmesh;
            navScene = preview;
            return makeZoneJSON(mesh, alt);
        })
    
        .then( data => {
            //console.log(data);
            let thing1 = JSON.stringify( data, null);
            let buffer1 = Buffer.from(thing1);
            let destJSON = path.join(MasterConfig.meshpath, `${LevelName}.json`);

            fs.writeFileSync(destJSON, buffer1, {encoding: 'utf-8'});

            const MAP_CONFIG_PATH = getConfigPath(LevelName, MasterConfig);
            fs.writeFileSync( MAP_CONFIG_PATH, Buffer.from ( JSON.stringify(config) ), {encoding: 'utf-8'});
            return resolve ( JSON.stringify(navScene.toJSON()) );
        })

        .catch ( err => {
            console.log(err);
            return reject(err);
        });
    });
};

module.exports = { getLevel, buildNavMesh };