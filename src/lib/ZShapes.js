//jshint esversion: 8
const earcut = require('earcut');
const _ = require('lodash');
const short = require('short-uuid');
const chalk = require('chalk');

const {
    Vector2,
    Vector3,
    Box2,
    Plane,
    Line3
} = require('three');

//this class just defines collections of linedefs which define the contours and holes of a polygon
class ZShape 
{
    static isPointInShape(shape, pt) {
        let poly = shape.vertices.map( vert => vert.v );

        for (var c = false, i = -1, l = poly.length, j = l - 1; ++i < l; j = i)
          ((poly[i].y <= pt.y && pt.y < poly[j].y) || (poly[j].y <= pt.y && pt.y < poly[i].y)) && (pt.x < (poly[j].x - poly[i].x) * (pt.y - poly[i].y) / (poly[j].y - poly[i].y) + poly[i].x) && (c = !c);
        return c;
    }

    static getNorthMost (linelist) 
    {
        var northMostPoint = Infinity;
        var northMostLine;
        linelist.forEach(linedef => {
            if (linedef.vertices[0].y < northMostPoint || linedef.vertices[1].y < northMostPoint) {
                northMostPoint = Math.min(linedef.vertices[0].y, linedef.vertices[1].y);
                northMostLine = linedef;
            }
        });
        return northMostLine;
    }

    static findConnected(list, CurLine, CurVertex)
    {
        let child = _.find(list, function(linedef) {
            return linedef.hasVertex(CurVertex) && !linedef.isFree && linedef.index !== CurLine.index;
        });

        if (child) return child;

        return null;
    }


    static findConnectedParents(list, CurLine, CurVertex, sector)
    {
        let child = _.find(list, function(linedef) {
            return linedef.hasVertex(CurVertex) && 
            !linedef.isFree && 
            sector.vertices.indexOf( linedef.getOtherVertex(CurVertex)) > -1 &&
            linedef.index !== CurLine.index;
        });

        if (child) return child;

        return null;
    }

    static areSectorsTheSame(sector1, sector2)
    {
        if (sector1 == null && sector2 == null) return true;
        if (sector1 == null  && sector2 !== null || sector1 !== null  && sector2 == null) return false;
        if (sector1.uuid == sector2.uuid) return true;
        return false;
    }


    static areSharedSectorsTheSame(sector1, sector2)
    {
        if (sector1 == null || sector2 == null) return false;
        //if (sector1 == null && sector2 !== null || sector1 !== null && sector2 == null) return false;
        if (sector1.uuid == sector2.uuid) return true;
        return false;
    }

    static linesShareSectors(linedef1, linedef2)
    {
        let shared =  (
            (ZShape.areSectorsTheSame(linedef1.sectors[0], linedef2.sectors[0]) && ZShape.areSectorsTheSame(linedef1.sectors[1], linedef2.sectors[1])) ||
            (ZShape.areSectorsTheSame(linedef1.sectors[0], linedef2.sectors[1]) && ZShape.areSectorsTheSame(linedef1.sectors[1], linedef2.sectors[0]))
        );
        return shared;
    }

    static findConnectedAndSector(list, CurLine, CurVertex)
    {
        let child = _.find(list, function(linedef) {
            return linedef.hasVertex(CurVertex) && !linedef.isFree && linedef.index !== CurLine.index && ZShape.linesShareSectors(CurLine, linedef);
        });

        if (child) return child;

        return null;
    }

    static findConnectedAndParentSector(list, CurLine, CurVertex, sector)
    {
        let child = _.find(list, function(linedef) {
            return linedef.hasVertex(CurVertex) && 
                !linedef.isFree && 
                linedef.index !== CurLine.index && 
                sector.vertices.indexOf( linedef.getOtherVertex(CurVertex)) > -1 &&
                ZShape.linesShareSectors(CurLine, linedef);
            //ZShape.areSectorsTheSame( CurLine.getOtherSector(sector), linedef.getOtherSector(sector) );
        });

        if (child) return child;

        return null;
    }

    static createGroups(shapes) {

        shapes = shapes.sort((a, b) => a.getArea() - b.getArea());

        var runaway = 0;
        var RemainingShapes = _.clone(shapes);
        var curshape = RemainingShapes.shift();

        while (true) {

            runaway++;
            if (runaway > 10000) {
                console.log('script ranaway');
                break;
            }

            var foundParent = false;

            for (var i = 0; i < shapes.length; i++) {

                var parentCandidate = shapes[i];

                if (parentCandidate.is(curshape)) continue;

                if (parentCandidate.containsShape(curshape)) {
                    foundParent = true;
                    parentCandidate.addChild(curshape);
                    curshape = parentCandidate;

                    var curShapeIndex = RemainingShapes.indexOf(curshape);
                    if (curShapeIndex > -1) RemainingShapes.splice(curShapeIndex, 1);
                    break;
                }
            }

            if (!foundParent) {

                if (curshape) curshape.isRoot = true;

                if (RemainingShapes.length) {
                    curshape = RemainingShapes.shift();
                } else {
                    break;
                }
            }
        }

        var holes = [];

        shapes = shapes
        .map(shape => {
            if (shape.parent) {
                if (shape.parent.isRoot) {
                    shape.isHole = true;
                    holes.push(shape);
                } else {
                    shape.isRoot = true;
                    var childIndex = shape.parent.shapes.indexOf(shape);
                    shape.parent.shapes.splice(childIndex, 1);
                    shape.parent = null;
                }
            } else {
                shape.isRoot = true;
            }

            return shape;
        })
        .filter(shape => shape.isRoot);

        return shapes;
    }

    static getShapesFromSector(target)
    {
        var LinesWithOutShapes = target.linedefs.filter(linedef => !linedef.isFree);
        var availableLines = _.clone(LinesWithOutShapes);

        var startLineDef = ZShape.getNorthMost(LinesWithOutShapes);
        //var startSector = startLineDef.getOtherSector(target);

        var startVertex = startLineDef.vertices[0];
        var CurVertex = startVertex;
        var CurLine = startLineDef;

        var borders = [];
        var border = [];

        border.push(CurLine);

        var firstIndex = LinesWithOutShapes.indexOf(startLineDef);
        LinesWithOutShapes.splice(firstIndex, 1);

        var limitrunaway = 0;

        while (true) {

            limitrunaway++;

            if (limitrunaway > 20000) 
            {
                let problemLines = availableLines.map(ld => ld.index).join(', ');
                let runawaymsg = chalk.redBright(`found a problem with linedefs: ${problemLines}`);
                console.error(runawaymsg);
                break;
            }

            let child = ZShape.findConnectedAndParentSector(LinesWithOutShapes, CurLine, CurVertex, target);

            if (!child) {
                child = ZShape.findConnectedAndParentSector(LinesWithOutShapes, CurLine, CurVertex, target);
            }

            if (!child && border.length > 2) {
                child = ZShape.findConnectedAndParentSector(availableLines, CurLine, CurVertex, target);
            }

            if (!child) {
                child = ZShape.findConnectedParents(availableLines, CurLine, CurVertex, target);
            }

            if (child) 
            {
                
                var UsedIndex = LinesWithOutShapes.indexOf(child);
                
                if (UsedIndex > -1) LinesWithOutShapes.splice(UsedIndex, 1);

                if (child.index == border[0].index) {
                    borders.push(_.clone(border));
                    border = [];

                    if (LinesWithOutShapes.length) {

                        CurLine = ZShape.getNorthMost(LinesWithOutShapes);
                        CurVertex = CurLine.vertices[0];
                        border.push(CurLine);

                    } else {
                        break;
                    }

                } else {
                    border.push(child);
                    CurLine = child;
                    CurVertex = child.getOtherVertex(CurVertex);
                }
            } else {
                break;
            }
        }

        //let zshapes = [];

        borders = borders
        .map(border => {

            let vertices = [];
            let linedefs = [];

            border.forEach(linedef => {
                linedefs.push(linedef);
                if (vertices.indexOf(linedef.vertices[0]) < 0) {
                    vertices.push(linedef.vertices[0]);
                } else {
                    vertices.push(linedef.vertices[1]);
                }
            });

            if (linedefs[0].vertices[0].x > linedefs[0].vertices[1])
            {
                linedefs = linedefs.reverse();
                vertices = vertices.reverse();
            }

            return new ZShape({ linedefs, vertices } );
        });

        let groups = ZShape.createGroups(borders);

        return groups;
    }

    /**
     * A list of vertices and linedefs that define the outer border of a sector
     * and child shapes that define sub-sectors. used to generate geometry from UDMF data.
     * @param { Object } def 
     */
    constructor(def) {

        //unique identifier
        this.UUID = short.uuid();
        this.bounds = new Box2();

        this.vertices = def.vertices;
        this.linedefs = def.linedefs;

        this.isRoot = false;
        this.isHole = false;

        this.parent = null;
        this.shapes = [];

        this.vertices.forEach(vertex => {
            this.bounds.expandByPoint(vertex.v);
        });

        this.area = this.getArea();
    }

    /**
     * Append a shape to parent to be used as a hole in the mesh
     * @param { ZShape } zshape 
     * @returns { Boolean }
     */
    addChild(zshape) {
        if (this.is(zshape)) return false;

        if (this.shapes.indexOf(zshape) < 0) {
            zshape.parent = this;
            this.shapes.push(zshape);
            return true;
        }

        return false;
    }

    /**
     * Check if shape is the same as another
     * @param { ZShape } zshape 
     * @returns { Boolean }
     */
    is(zshape) {
        return this.UUID == zshape.UUID;
    }

    /**
     * Get the 2D area of a ZShape
     * @returns { Number }
     */
    getArea() {
        let v = new Vector2();
        this.bounds.getSize(v);
        this.area = v.x * v.y;
        return v.x * v.y;
    }

    /**
     * Check if another shape is contained by this one
     * @param { ZShape } zshape 
     * @returns { Boolean }
     */
    containsShape(zshape) {
        return this.bounds.containsBox(zshape.bounds);
    }

    /**
     * Check if another shape overlaps this one at all
     * @param { ZShape } zshape 
     * @returns { Boolean }
     */
    overlaps(zshape) {
        return this.bounds.intersectsBox(zshape.bounds);
    }

}

//this class just defines a walkable surface that can be turned into triangles
class FloorPlane
{
    static getTrianglesFromShape2D(shape)
    {
        var index = 0;
        let vertices = [];
        let holeIndices = [];

        shape.vertices.forEach (vertex => {
            vertices.push( vertex );
            index++;
        });

        shape.shapes.forEach (shape => {
            holeIndices.push(index);
            shape.vertices.forEach( vertex => {
                vertices.push( vertex );
                index++;
            });
        });

        if (!holeIndices.length) holeIndices = null;

        let triangulated = 
            earcut( vertices.map ( vert => vert.v.toArray() ).flat(), holeIndices, 2 )
            .map( vindex => vertices[vindex] );

        return triangulated;
    }

    static sectorSlopeNames(isFloor)
    {
        var prefix = isFloor ? 'floor' : 'ceiling';
        return {
            a: `${prefix}plane_a`,
            b: `${prefix}plane_b`,
            c: `${prefix}plane_c`,
            d: `${prefix}plane_d`
        };
    }

    static sectorSlopesBy(sector, names)
    {
        return {
            a: sector[names.a],
            b: sector[names.b],
            c: sector[names.c],
            d: sector[names.d],
        };
    }

    static getVertexZ (sector, vertex, isFloor)
    {

        if (!sector) return 0;

        let isSloped = isFloor ? sector.slopedFloor : sector.slopedCeiling;
        
        if (isSloped)
        {
            var { a, b, c, d } = FloorPlane.sectorSlopesBy(sector, FloorPlane.sectorSlopeNames(isFloor));

            var q = Math.sqrt(Math.pow(a, 2) + Math.pow(b, 2) + Math.pow(c, 2) );
            var normal = new Vector3(a, b, c).divideScalar(q);
            var p = d / q;

            return (-p - (normal.x * vertex.x + normal.y * vertex.y)) / normal.z;
        }

        let isTerrain = isFloor ? sector.terrainFloor : sector.terrainCeiling;

        if (isTerrain)
        {
            let zproperty = isFloor ? 'zfloor' : 'zceiling';

            if (vertex[zproperty] !== undefined)
            {
                
                return vertex[zproperty];
            }
        }

        let sectorz = isFloor ? sector.heightfloor : sector.heightceiling;
        return sectorz;
    }

    static getCeilingVertexZ(sector, vertex)
    {
        if (sector.terrainCeiling)
        {
            if (vertex.zceiling !== undefined)
            {
                return vertex.zceiling;
            }
        }

        return sector.heightceiling;
    }

    static getFloorVertexZ(sector, vertex)
    {
        if (sector.terrainFloor)
        {
            if (vertex.zfloor !== undefined)
            {
                return vertex.zfloor;
            }
        }

        return sector.heightfloor;
    }

    constructor( group )
    {
        this.group = group;

        this.model = null;
        this.target = null;

        this.is3DFloor = false;
        this.isModel = false;

        this.plane = new Plane();
        this.isFree = false;
        this.isSloped = false;
        this.floorz = null;

        this.shapes = []; 
        this.triangles2D = [];
        this.triangles3D = [];

        return this;
    }

    addShapeToGroup( shape )
    {
        this.group.shapes.push(shape);
    }

    setFromSector(sector)
    {
        this.model = sector;
        this.target = sector;
        this.isFree = sector.isFree;
        this.floorz = sector.heightfloor;
        //this.isModel = false;
        this.is3DFloor = false;
        if (sector.isModel) this.isModel = true;

        this.shapes = ZShape.getShapesFromSector(this.target);

        this.triangles2D = this.shapes.map (FloorPlane.getTrianglesFromShape2D, this);

        this.triangles3D = this.triangles2D.map ( triangle => {
            return triangle.map (vertex => {
                return new Vector3(vertex.x, FloorPlane.getVertexZ(this.target, vertex, true), vertex.y);
            }, this);
        }, this);

        if ( sector.slopedFloor )
        {
            var { a, b, c, d } = FloorPlane.sectorSlopesBy(sector, FloorPlane.sectorSlopeNames(true));
            var q = Math.sqrt(Math.pow(a, 2) + Math.pow(b, 2) + Math.pow(c, 2) );
            var normal = new Vector3(a, b, c).divideScalar(q);
            var p = d / q;
            this.plane.set(normal, p);
            this.isSloped = true;
        }
        else if ( sector.terrainFloor )
        {
            this.isSloped = true;
            let { getFloorVertexZ } = FloorPlane;
            this.plane.setFromCoplanarPoints(
                new Vector3( sector.vertices[0].x, getFloorVertexZ(sector, sector.vertices[0]), sector.vertices[0].y ),
                new Vector3( sector.vertices[1].x, getFloorVertexZ(sector, sector.vertices[1]), sector.vertices[1].y ),
                new Vector3( sector.vertices[2].x, getFloorVertexZ(sector, sector.vertices[2]), sector.vertices[2].y )
            );
        } 

        return this;
    }

    getZAtPoint ( v )
    {
        if (this.isSloped)
        {
            var { a, b, c, d } = FloorPlane.sectorSlopesBy(this.model, FloorPlane.sectorSlopeNames(!this.is3DFloor));
            var q = Math.sqrt(Math.pow(a, 2) + Math.pow(b, 2) + Math.pow(c, 2) );
            var normal = new Vector3(a, b, c).divideScalar(q);
            var p = d / q;
            return (-p - (normal.x * v.x + normal.y * v.y)) / normal.z;
        }

        if (this.terrainFloor)
        {
            var ray = new Line3();
            var hitpt = new Vector3();
            var startpt = new Vector3(v.x, Number.MAX_SAFE_INTEGER, v.y);
            var endpt = startpt.clone().setY(-Number.MAX_SAFE_INTEGER);
            ray.set(startpt, endpt);
            this.plane.intersectLine(ray, hitpt);
    
            return hitpt.y;
        }

        return this.floorz;
    }

    get3DCeilingAtPoint ( v )
    {

        let { model } = this;

        if (model.slopedFloor)
        {
            var { a, b, c, d } = FloorPlane.sectorSlopesBy(model, FloorPlane.sectorSlopeNames(true));
            var q = Math.sqrt(Math.pow(a, 2) + Math.pow(b, 2) + Math.pow(c, 2) );
            var normal = new Vector3(a, b, c).divideScalar(q);
            var p = d / q;
            return (-p - (normal.x * v.x + normal.y * v.y)) / normal.z;
        }

        if (model.terrainFloor)
        {
            var ray = new Line3();
            var hitpt = new Vector3();
            var startpt = new Vector3(v.x, Number.MAX_SAFE_INTEGER, v.y);
            var endpt = startpt.clone().setY(-Number.MAX_SAFE_INTEGER);
            ray.set(startpt, endpt);

            let { getFloorVertexZ } = FloorPlane;

            let plane = new Plane()
            .setFromCoplanarPoints(
                new Vector3( model.vertices[0].x, getFloorVertexZ(model, model.vertices[0]), model.vertices[0].y ),
                new Vector3( model.vertices[1].x, getFloorVertexZ(model, model.vertices[1]), model.vertices[1].y ),
                new Vector3( model.vertices[2].x, getFloorVertexZ(model, model.vertices[2]), model.vertices[2].y )
            );

            plane.intersectLine(ray, hitpt);
    
            return hitpt.y;
        }

        return model.heightfloor;
    }

    setFromModel(target, model, floorplane)
    {
        this.is3DFloor = true;
        this.target = target;
        this.model = model;
        this.floorz = model.heightceiling;

        this.shapes = floorplane.shapes;
        this.triangles2D = floorplane.triangles2D;

        if ( model.slopedCeiling )
        {
            this.isSloped = true;
            var { a, b, c, d } = FloorPlane.sectorSlopeNames(false);
            var normal = new Vector3(model[a], model[c], model[b]);
            this.plane.set(normal, model[d]);

        } 
        else if ( model.terrainCeiling )
        {
            this.isSloped = true;
            let { getCeilingVertexZ } = FloorPlane;
            this.plane.setFromCoplanarPoints(
                new Vector3( model.vertices[0].x, getCeilingVertexZ(model, model.vertices[0]), model.vertices[0].y ),
                new Vector3( model.vertices[1].x, getCeilingVertexZ(model, model.vertices[1]), model.vertices[1].y ),
                new Vector3( model.vertices[2].x, getCeilingVertexZ(model, model.vertices[2]), model.vertices[2].y )
            );
        } 

        let triangles3D = this.triangles2D.map ( triangle => {
            return triangle.map (vertex => {
                return new Vector3(vertex.x, this.getZAtPoint(vertex.v), vertex.y);
            }, this);
        }, this);


        let baseTriangles = this.triangles2D.map ( triangle => {
            return triangle.map (vertex => {
                return new Vector3(vertex.x, this.get3DCeilingAtPoint(vertex.v), vertex.y);
            }, this);
        }, this);


        this.triangles3D = triangles3D.concat(baseTriangles);

        var walls = this.shapes.map (shape => {
            let validLines = 
            shape.linedefs
                .filter( 
                    line => !line.isFree && 
                    line.twosided !== undefined
                );
            let triangles = validLines.map( linedef => {

                let { vertices, sectors } = linedef;

                
                let corners = [
                    new Vector3(vertices[0].x, this.get3DCeilingAtPoint(vertices[0].v), -vertices[0].y ),
                    new Vector3(vertices[0].x, this.getZAtPoint(vertices[0].v), -vertices[0].y ),
                    new Vector3(vertices[1].x, this.getZAtPoint(vertices[1].v), -vertices[1].y ),
                    new Vector3(vertices[1].x, this.get3DCeilingAtPoint(vertices[1].v), -vertices[1].y )
                ];
    
                let triangulated = 
                [
                    corners[1], corners[2], corners[0],
                    corners[0], corners[2], corners[3]
                ];//.reverse();
    
                return triangulated;

            }, this);
            return triangles.flat();
        }, this);

        if (walls.length) this.walls = walls;
        //console.log(walls);

        //this.triangles3D = this.triangles3D.concat(walls);

        

        return this;
    }   

    hasThing( thing )
    {
        let roots = this.shapes.filter ( s => s.isRoot );

        for (var i = 0; i < roots.length; i++)
        {
            let shape = roots[i];
            let inShape = ZShape.isPointInShape( shape, thing.v );

            if (inShape)
            {
                return { hasThing: true, floorplane: this, shape: shape };
            }
        }

        return { hasThing: false, floor: null, shape: null};
    }
}

class FloorPlaneGroup
{

    static create( udmf )
    {
        let group = new FloorPlaneGroup(udmf);
        udmf.sectors.forEach ( sector=> {

            let floorplane = new FloorPlane(group).setFromSector(sector);
            group.floorplanes.push(floorplane);

            if (sector.hasFloors3D)
            {
                sector.modelSectors.forEach( modelSector => {
                    let floorplane3D = new FloorPlane(group)
                    .setFromModel(sector, modelSector, floorplane);

                    group.floorplanes.push(floorplane3D);
                });
            }
            
        });

        return group;
    }

    

    constructor(udmf)
    {
        this.UDMF = udmf;
        this.shapes = [];
        this.floorplanes = [];
    }

    getSteps()
    {
        let validLines = this.UDMF.linedefs.filter( line => !line.isFree && line.twosided !== undefined);

        let triangles = validLines.map( linedef => {

            let { vertices, sectors } = linedef;
            
            let corners = [
                new Vector3(vertices[0].x, FloorPlane.getVertexZ(sectors[0], vertices[0], true), -vertices[0].y ),
                new Vector3(vertices[0].x, FloorPlane.getVertexZ(sectors[1], vertices[0], true), -vertices[0].y ),
                new Vector3(vertices[1].x, FloorPlane.getVertexZ(sectors[1], vertices[1], true), -vertices[1].y ),
                new Vector3(vertices[1].x, FloorPlane.getVertexZ(sectors[0], vertices[1], true), -vertices[1].y )
            ];

            if ( corners[0].equals(corners[1]) && corners[2].equals(corners[3]) )
            {
                return null;
            }

            let triangulated = 
            [
                corners[1], corners[2], corners[0],
                corners[0], corners[2], corners[3]
            ].reverse();

            return triangulated;
        })
        .filter( tri => tri !== null);

        let wallLines = this.UDMF.linedefs.filter( line => !line.isFree && !line.twosided && line !== null);

        let triangles2 = wallLines.map( linedef => {

            if (linedef.user_nocast) return null;

            let { vertices, sectors } = linedef;

            if (sectors && sectors.length && sectors[0]){
                let corners = [
                    new Vector3(vertices[0].x, FloorPlane.getVertexZ(sectors[0], vertices[0], true), -vertices[0].y ),
                    new Vector3(vertices[0].x, sectors[0].heightceiling, -vertices[0].y ),
                    new Vector3(vertices[1].x, sectors[0].heightceiling, -vertices[1].y ),
                    new Vector3(vertices[1].x, FloorPlane.getVertexZ(sectors[0], vertices[0], true), -vertices[1].y )
                ];

                if ( corners[0].equals(corners[1]) && corners[2].equals(corners[3]) )
                {
                    return null;
                }

                let triangulated = 
                [
                    corners[1], corners[2], corners[0],
                    corners[0], corners[2], corners[3]
                ].reverse();

                return triangulated;
            }

            return null;
        })
        .filter( tri => tri !== null);

        //triangles = triangles.concat(triangles2);
        let triangles3D = this.floorplanes.filter( fp => fp.walls !== undefined ).map( fp => fp.walls).flat();

        //console.log(walls3D);

        //triangles = triangles.concat(walls3D);

        return { triangles, triangles3D, triangles2 };
    }
    

    getTriangles()
    {
        let tris = [];

        this.floorplanes.forEach ( floorplane => {
            floorplane.triangles3D.forEach ( triangle => {
                tris.push(triangle);
            });
        });

        return tris;
    }

    getTrianglesBy(cb)
    {
        let tris = [];
        let floorplanes = this.floorplanes.filter( cb );

        floorplanes.forEach ( floorplane => {
            floorplane.triangles3D.forEach ( triangle => {
                tris.push(triangle);
            });
        });

        return tris;
    }
}

const ZShapes = FloorPlaneGroup;
module.exports = ZShapes;
