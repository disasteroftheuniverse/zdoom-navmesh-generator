var str = 
`{
    "triangulation_algorithms": [
        "libtess",  // this will produce the most accurate results most of the time. if you get holes use earcut
        "earcut",   // use earcut algorithm if libtess has missing polys,
        "delaunay", // sometimes gives prettier results
        "smallest" // use all triangulation algorithms and automatically choose the result with lowest polys (slower)
    ],
	"triangulation": "libtess",      //choose one of the above triangulation types
	"options": {
        "cellSize"        : 0.25,   // voxelization cell size
        "cellHeight"      : 0.1 ,   // voxelization cell height
        "agentHeight"     : 1.0 ,   // agent capsule  height
        "agentRadius"     : 0.5 ,   // agent capsule  radius
        "agentMaxClimb"   : 0.3 ,   // how high steps agents can climb, in voxels
        "agentMaxSlope"   : 40.0,   // maximum slope angle, in degrees
        "regionMinSize"   : 12.0,   // minimum isolated region size that is still kept
        "regionMergeSize" : 32.0,   // how large regions can be still merged
        "edgeMaxLen"      : 16.0,   // maximum edge length, in voxels
        "edgeMaxError"    : 2.5     // how loosely the simplification is done
	},
	"merge_distance"    :   1.0,      //if two vertices are less than this distance apart, they will be merged
	"solo"              :   true      //this will divide up the mesh into a grid if false. only use on smaller maps
}`;

module.exports = str;