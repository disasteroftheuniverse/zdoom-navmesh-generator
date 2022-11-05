//jshint esversion: 8
const path = require('path');
let MasterConfigPath = path.resolve(__dirname,'./../config.json');
var MasterConfig;


/**
 * Configuration for {@link https://www.npmjs.com/package/recastjs}
 * a wrapper for {@link https://github.com/recastnavigation/recastnavigation Recast}
 * 
 */
var RecastOptions = 
{
    cellSize        :  0.25,   // voxelization cell size 
    cellHeight      :  0.1,   // voxelization cell height
    agentHeight     :  1.0,   // agent capsule  height
    agentRadius     :  0.5,   // agent capsule  radius
    agentMaxClimb   :  0.3,   // how high steps agents can climb, in voxels
    agentMaxSlope   : 40.0,   // maximum slope angle, in degrees
    regionMinSize   : 12.0,   // minimum isolated region size that is still kept
    regionMergeSize : 32.0,   // how large regions can be still merged
    edgeMaxLen      : 16.0,   // maximum edge length, in voxels
    edgeMaxError    :  2.5,   // how loosely the simplification is done
};
//'delaunay', 'smallest' or 'libtess' or 'earcut'
const TRIANGULATION_ALGORITHM = 'earcut'; //earcut

//'solo' or 'tiled'
const RecastType = 'solo'; //tiled
const MERGE_TOLERANCE = 1.0;

/**
 * Map Data from UDMF must be scaled down a bit to be usable by Recast.
 * This factor determines scale.
 */
const MAPSCALE = 1 / 64;
const MAPSCALEINV = 64;

let Config = 
{
    RecastOptions, MAPSCALE, MAPSCALEINV, RecastType, MERGE_TOLERANCE, TRIANGULATION_ALGORITHM, MasterConfigPath
};

module.exports = Config;

