// Import core Three.js library
let _three = require('three');

// Add custom Three.js extensions for exporting and geometry utilities
_three.OBJExporter = require('./../three/OBJExport'); // Export scene to OBJ format
_three.OBJLoader = require('./../three/OBJLoader');   // Load OBJ files
_three.BufferGeometryUtils = require('./../three/BufferUtils'); // Utility functions for BufferGeometry

let THREE = _three;

// Import pathfinding utilities for navigation mesh processing
let { Pathfinding } = require('three-pathfinding');

// Import Lodash for utility functions
let _ = require('lodash');

// Import Earcut for polygon triangulation
let earcut = require('earcut');

// Grid resolution for spatial partitioning
const GRIDRES = 256;

// Map scale constants from configuration
let { MAPSCALE, MAPSCALEINV } = require('./../config.js');

// Chalk for colored console output
const chalk = require('chalk');

/**
 * Expand a BoxGrid to include a new point
 * @param {THREE.Box2} BoxGrid - bounding box of grid
 * @param {THREE.Vector3} v3 - point to include
 */
var growGrid = function (BoxGrid, v3) {
    let pos2 = new THREE.Vector2(v3.x, v3.y);
    BoxGrid.expandByPoint(pos2);
};

/**
 * BlockMap class represents a 2D grid partition of a scene for spatial queries
 */
class BlockMap {
    constructor(box) {
        this.cols = 0;      // number of columns in the grid
        this.rows = 0;      // number of rows in the grid
        this.center = null; // center of the grid
        this.size = null;   // size of the grid
        this.boxGrid = [];  // array of Box3 objects representing each cell
        this.length = 0;    // total number of cells
        this.cells = [];    // cell contents (polygon IDs)
        this.topLeft = null; // top-left coordinates of the grid

        this.buildGridFrom(box); // initialize grid from bounding box
    }

    /**
     * Snap a box to the nearest GRIDRES multiple
     * Ensures even sizing and alignment
     */
    static snapGrid(box) {
        let box2 = new THREE.Box2().copy(box);

        let size = new THREE.Vector2();
        let center = new THREE.Vector2();

        box2.getCenter(center);
        box2.getSize(size);

        center.divideScalar(GRIDRES).floor();
        size.divideScalar(GRIDRES).floor();

        // Adjust odd sizes to even multiples
        size.x = (size.x % 2 !== 0) ? size.x + 5 : size.x + 4;
        size.y = (size.y % 2 !== 0) ? size.y + 5 : size.y + 4;

        // Ensure center is aligned to even
        if (center.x % 2 !== 0) center.x += 1;
        if (center.y % 2 !== 0) center.y += 1;

        // Convert back to world units
        size.multiplyScalar(GRIDRES);
        center.multiplyScalar(GRIDRES);

        box2.setFromCenterAndSize(center, size);

        return box2;
    }

    /**
     * Retrieve a vertex from a flat vertex map
     * @param {Array} vertexmap - flat array of vertex positions
     * @param {Number} index - vertex index
     */
    static getVertex(vertexmap, index) {
        index = index * 3;
        return new THREE.Vector3(vertexmap[index], vertexmap[index + 1], 0);
    }

    /**
     * Add a polygon ID to a specific cell if not already present
     */
    addIDToCell(cellIndex, id) {
        if (this.cells[cellIndex].indexOf(id) < 0) {
            this.cells[cellIndex].push(id);
        }
    }

    /**
     * Assign a polygon to all intersecting cells in the grid
     * @param {Array} vertexmap - flat array of vertices
     * @param {Object} node - polygon node
     */
    addPolygon(vertexmap, node) {
        let vertices = node.v.map(vid => BlockMap.getVertex(vertexmap, vid));

        // Compute bounding box of polygon
        let box = new THREE.Box3();
        vertices.forEach(v3 => {
            box.expandByPoint(v3);
        });

        // Flatten vertices for triangulation
        let indices = earcut(vertices.map(v => new THREE.Vector2(v.x, v.y).toArray()).flat(), null, 2);

        // Convert triangles to THREE.Triangle objects
        let triangles = _.chunk(indices.map(ind => vertices[ind]), 3)
            .map(shape => new THREE.Triangle(shape[0], shape[1], shape[2]));

        // Check each grid cell for intersection with triangles
        this.boxGrid.forEach((b, cellIndex) => {
            if (!node.b.includes(cellIndex)) {
                triangles.forEach(triangle => {
                    if (b.intersectsTriangle(triangle)) {
                        node.b.push(cellIndex); // assign cell to polygon
                    }
                });
            }
        });
    }

    /**
     * Build the grid from a bounding box
     * Creates cells and assigns top-left coordinates
     */
    buildGridFrom(box) {
        box = BlockMap.snapGrid(box);

        let size = new THREE.Vector2();
        let center = new THREE.Vector2();
        box.getCenter(center);
        box.getSize(size);

        let cols = size.x / GRIDRES;
        let rows = size.y / GRIDRES;

        let cellSize = new THREE.Vector3(GRIDRES, GRIDRES, 2000000); // large Z size for intersection
        let offset = new THREE.Vector3(GRIDRES, -GRIDRES, 0).multiplyScalar(0.5);

        for (let y = box.max.y; y >= box.min.y; y -= GRIDRES) {
            for (let x = box.min.x; x <= box.max.x; x += GRIDRES) {
                let cellCenter = new THREE.Vector3(x, y, 0).add(offset);
                let cellBox = new THREE.Box3();
                cellBox.setFromCenterAndSize(cellCenter, cellSize);
                this.boxGrid.push(cellBox);
                this.cells.push([]);
            }
        }

        this.topLeft = [box.min.x, box.max.y];
        this.cols = cols;
        this.rows = rows;
        this.length = this.cells.length;
        this.center = center;
        this.size = size;
    }

    /**
     * Convert BlockMap to simplified object for export
     */
    toObj() {
        let cells = this.cells.map(cell => {
            if (!cell.length) cell.push(-1);
            return cell;
        });

        return {
            res: GRIDRES,
            size: this.size.divideScalar(GRIDRES).toArray(),
            length: this.length,
            origin: this.topLeft,
        };
    }
}

/**
 * Convert a 3D point to ZDoom coordinates and expand BoxGrid
 */
function toZDoomPos(BoxGrid, v) {
    v = v.multiplyScalar(MAPSCALEINV).floor().set(v.x, v.z * -1, v.y);
    growGrid(BoxGrid, v);
    return v;
}

/**
 * Convert a polygon node into a ZDoom-compatible node object
 */
function zdoomNode(BoxGrid, node, masterID, groupID) {
    let znode = {};
    znode.c = toZDoomPos(BoxGrid, node.centroid).toArray(); // centroid in ZDoom coords
    znode.d = node.id; // polygon ID
    znode.p = node.portals; // portal connections
    znode.v = node.vertexIds; // vertices
    znode.n = node.neighbours; // neighbor indices
    znode.m = masterID; // master index
    znode.g = groupID; // group ID
    znode.b = []; // grid cells the polygon occupies

    if (node.flags) znode.f = node.flags;
    if (node.helper) znode.h = node.helper;

    return znode;
}

/**
 * Convert a navigation mesh and alt polygon data into a ZDoom-compatible JSON zone
 */
var makeZoneJSON = function (mesh, alt) {
    var BoxGrid = new THREE.Box2();
    let zone = alt;

    // Convert vertices to ZDoom coordinates
    let vertices = zone.vertices.map(v => toZDoomPos(BoxGrid, v).toArray()).flat();

    let masterID = 0;
    var nodes = [];

    // Process each group of polygons
    var groups = zone.groups.map((group, groupIndex) => {
        return group.map(node => {
            var znode = zdoomNode(BoxGrid, node, masterID, groupIndex);
            nodes.push(znode);
            masterID++;
            return znode.m;
        });
    });

    // Sort nodes by masterID
    nodes = nodes.sort((a, b) => a.m - b.m);

    // Reindex neighbors within group
    nodes = nodes.map(znode => {
        let grpID = znode.g;
        znode.n = znode.n.map(neighborID => nodes.findIndex(n => n.g == grpID && n.d == neighborID));
        return znode;
    });

    // Remove redundant properties
    nodes = nodes.map(znode => {
        delete znode.d;
        return znode;
    });

    // Build BlockMap for spatial partitioning
    var boxmap = new BlockMap(BoxGrid);
    nodes.forEach(node => {
        boxmap.addPolygon(vertices, node);
    });

    var boxmapData = boxmap.toObj();

    // Log any issues with unassigned cells
    nodes.forEach(node => {
        if (node.b.indexOf(-1) > 0) {
            console.log(node.b);
        }
    });

    // Build final JSON object
    let obj = {
        vertices: vertices,
        nodes: nodes,
        groups: groups.length,
        length: boxmapData.length,
        sizex: boxmapData.size[0],
        sizey: boxmapData.size[1],
        originx: boxmapData.origin[0],
        originy: boxmapData.origin[1],
        res: GRIDRES
    };

    // Output summary
    console.log(chalk.greenBright(
        `triangles:  ${chalk.whiteBright(obj.nodes.length)}
vertices:   ${chalk.whiteBright(obj.vertices.length)}
groups:     ${chalk.whiteBright(groups.length)}`
    ));

    return obj;
};

// Export only the primary makeZoneJSON function
module.exports = { makeZoneJSON };
