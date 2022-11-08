let _three = require('three');
_three.OBJExporter = require('./../three/OBJExport');
_three.OBJLoader = require('./../three/OBJLoader');
_three.BufferGeometryUtils = require('./../three/BufferUtils');
let THREE = _three;
let { Pathfinding } = require( 'three-pathfinding');
let _ = require('lodash');
let earcut = require('earcut');

const GRIDRES = 256;
let { MAPSCALE, MAPSCALEINV } = require ('./../config.js');
const chalk = require('chalk');


var growGrid = function( BoxGrid, v3 )
{
    let pos2 = new THREE.Vector2(v3.x, v3.y);
    BoxGrid.expandByPoint(pos2);
};

class BlockMap 
{
    constructor(box)
    {
        this.cols = 0;
        this.rows = 0;
        this.center = null;
        this.size = null;
        this.boxGrid = [];
        this.length = 0;
        this.cells = [];
        this.topLeft = null;

        this.buildGridFrom(box);
    }

    static snapGrid (box)
    {
        let box2 = new THREE.Box2().copy(box);

        let size = new THREE.Vector2();
        let center = new THREE.Vector2();

        box2.getCenter(center);
        box2.getSize(size);

        center.divideScalar(GRIDRES).floor();
        size.divideScalar(GRIDRES).floor();

        size.x = (size.x % 2 !== 0) ? size.x+5 : size.x+4;
        size.y = (size.y % 2 !== 0) ? size.y+5 : size.y+4;

        if (center.x % 2 !== 0) center.x+=1;
        if (center.y % 2 !== 0) center.y+=1;

        size.multiplyScalar(GRIDRES);
        center.multiplyScalar(GRIDRES);

        box2.setFromCenterAndSize(center, size);

        return box2;
    }

    static getVertex( vertexmap, index )
    {
        index = index * 3;
        return new THREE.Vector3(vertexmap[index], vertexmap[index+1], 0);
    }

    addIDToCell(cellIndex, id)
    {
        if ( this.cells[cellIndex].indexOf(id) < 0 )
        {
            this.cells[cellIndex].push(id);
        }
    }

    addPolygon (vertexmap, node)
    {
        let vertices = node.v.map ( vid => {
            return BlockMap.getVertex(vertexmap, vid);
        });

        //console.log(vertices);

        let box = new THREE.Box3();
        vertices.forEach (v3 => {
            box.expandByPoint(v3);
        });

        let flatVertices = vertices.map (vert => {
            return new THREE.Vector3(vert.x, vert.y, 0);
        });

        let indices = earcut ( vertices.map( v=> new THREE.Vector2(v.x, v.y).toArray()).flat(), null, 2);

        let triangles = 
        _.chunk( indices
            .map ( ind => vertices[ind] ), 3)
        .map ( shape => {
            return new THREE.Triangle(shape[0],shape[1],shape[2]);
        });



        //let triangle = new THREE.Triangle(vertices[0],vertices[1],vertices[2]);

        this.boxGrid.forEach ( (b, cellIndex) => {
            var inCell = (node.b.indexOf ( cellIndex ) > -1);
            if (!inCell)
            {
                //if ( b.containsBox(box) || b.intersectsBox(box) )
                //{
                    triangles.forEach( triangle =>
                    {
                        if ( node.b.indexOf(cellIndex) < 0)
                        {
                            if (b.intersectsTriangle(triangle))
                            {
                                //console.log(`triangles found in box ${cellIndex}`);
                                node.b.push(cellIndex);
                            }
                        }
                    });
                //}
            }
        }, this);
    }

    buildGridFrom (box)
    {
        box = BlockMap.snapGrid(box);

        var size = new THREE.Vector2();
        var center = new THREE.Vector2();

        box.getCenter(center);
        box.getSize(size);

        var cols = size.x / GRIDRES;
        var rows = size.y / GRIDRES;

        //console.log( cols, rows, center );
        //console.log( rows );
        var cellSize = new THREE.Vector3(GRIDRES, GRIDRES, 2000000);
        var offset = new THREE.Vector3(GRIDRES, -GRIDRES, 0).multiplyScalar(0.5);

        for (var y = box.max.y; y >= box.min.y; y = y - GRIDRES)
        {
            for (var x = box.min.x; x <= box.max.x; x = x + GRIDRES)
            {
                let cellCenter = new THREE.Vector3(x,y,0).add(offset);
                var cellBox = new THREE.Box3();
                cellBox.setFromCenterAndSize(cellCenter, cellSize);
                this.boxGrid.push(cellBox);
                this.cells.push([]);
            }
        }

        this.topLeft = [ box.min.x, box.max.y ];

       //console.log( [ box.min.x, box.max.y ] );
        //console.log( [ box.max.x, box.min.y ] );

        this.cols = cols;
        this.rows = rows;
        //= cells;
        this.length = this.cells.length;
        this.center = center;
        this.size = size;
    }

    toObj()
    {
        var cells = this.cells.map ( cell => {
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

function toZDoomPos ( BoxGrid, v )
{
    v = v.multiplyScalar(MAPSCALEINV).floor().set(v.x, v.z * -1, v.y);
    growGrid( BoxGrid, v );
    return v;
}


function zdoomNode( BoxGrid, node, masterID, groupID )
{
    let znode = {};
    znode.c = toZDoomPos(BoxGrid, node.centroid).toArray();
    znode.d = node.id; // group index
    znode.p = node.portals; //portals
    znode.v = node.vertexIds; //vertices
    znode.n = node.neighbours; //neighbor indices
    znode.m = masterID; //index
    znode.g = groupID; //group
    znode.b = []; //cell space partiationing

    if (node.flags)
    {
        znode.f = node.flags;
    }

    if (node.helper)
    {
        znode.h = node.helper;
    }
    
    //znode.f = (node.flags !== null && node.flags !== undefined) ? node.flags : 0; //flags

    return znode;
}

var makeZoneJSON = function(mesh , alt)
{
    var BoxGrid = new THREE.Box2();
    let zone = alt;

    let vertices = zone.vertices.map( v => toZDoomPos(BoxGrid, v).toArray() ).flat();

    let masterID = 0;

    var nodes = [];
    
    var groups = zone.groups.map ((group, groupIndex) => {
        return group.map( node => {
            var znode = zdoomNode(BoxGrid, node, masterID, groupIndex);
            nodes.push(znode);
            masterID++;
            return znode.m;
        });
    });

    nodes = nodes.sort( (a,b) => a.m - b.m );

    nodes = nodes.map (znode => {
        var grpID = znode.g; 
        znode.n = znode.n.map ( neighborID => {
            return nodes.findIndex( n => n.g == grpID && n.d == neighborID );
        });
        return znode;
    });


    nodes = nodes.map (znode => {
        delete znode.d;
        //delete znode.m;
        return znode;
    });
    
    var boxmap = new BlockMap (BoxGrid);

    nodes.forEach (node => {
        boxmap.addPolygon( vertices, node );
    });

   // nodes = nodes
    
    var boxmapData = boxmap.toObj();

    nodes.forEach (node => {
        if (node.b.indexOf(-1) > 0)
        {
            console.log(node.b);
        }
    });

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


    let nodecount = chalk.whiteBright(obj.nodes.length);
    let vertcount = chalk.whiteBright(obj.vertices.length);
    let grpcount = chalk.whiteBright(groups.length);

let details = 
`triangles:  ${nodecount}
vertices:   ${vertcount}
groups:     ${grpcount}`;

    let msg = chalk.greenBright(details);
    console.log(msg);
    //console.log(nodes);
    return obj;
};

var makeZoneJSONOLD = function(mesh , alt)
{
    var BoxGrid = new THREE.Box2();
    let zone = Pathfinding.createZone(mesh.geometry);
    let vertices = zone.vertices.map( v => toZDoomPos(BoxGrid, v).toArray() ).flat();
    let masterID = 0;

    var nodes = [];
    
    var groups = zone.groups.map ((group, groupIndex) => {
        return group.map( node => {
            var znode = zdoomNode(BoxGrid, node, masterID, groupIndex);
            nodes.push(znode);
            masterID++;
            return znode.m;
        });
    });

    nodes = nodes.sort( (a,b) => a.m - b.m );

    nodes = nodes.map (znode => {
        var grpID = znode.g; 
        znode.n = znode.n.map ( neighborID => {
            return nodes.findIndex( n => n.g == grpID && n.d == neighborID );
        });
        return znode;
    });


    nodes = nodes.map (znode => {
        delete znode.d;
        //delete znode.m;
        return znode;
    });
    
    var boxmap = new BlockMap (BoxGrid);

    nodes.forEach (node => {
        boxmap.addPolygon( vertices, node );
    });

   // nodes = nodes

    boxmap = boxmap.toObj();
    let obj = { 
        vertices: vertices, 
        nodes: nodes, 
        groups: groups.length, 
        length: boxmap.length, 
        sizex: boxmap.size[0], 
        sizey: boxmap.size[1],
        originx: boxmap.origin[0],
        originy: boxmap.origin[1],
        res: GRIDRES
    };


    let nodecount = chalk.whiteBright(obj.nodes.length);
    let vertcount = chalk.whiteBright(obj.vertices.length);
    let grpcount = chalk.whiteBright(groups.length);

let details = 
`triangles:  ${nodecount}
vertices:   ${vertcount}
groups:     ${grpcount}`;

    let msg = chalk.greenBright(details);
    console.log(msg);

    /*

    let position = new THREE.Vector2(896, -640);
    let offset = new THREE.Vector2().fromArray(boxmap.origin);
    position.setX( position.x - offset.x );
    position.setY( offset.y - position.y );
    position.divideScalar(GRIDRES).floor();
    var index = (( boxmap.size[0] + 1 ) * position.y ) + position.x;
    
    */

    
    
    //position.setX( position.x + origin.x );
    //.divideScalar(GRIDRES).floor();

    //position

 
    //console.log(obj.nodes);
    //console.log('pos', position);
    //console.log('index', index);
    //console.log('cell', boxmap.cells[index]);
    //console.log('length', boxmap.length);

    return obj;
};

module.exports = { makeZoneJSON };