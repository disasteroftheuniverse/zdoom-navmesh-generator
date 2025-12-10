// jshint esversion: 8
// Import required libraries
const earcut = require('earcut'); // Polygon triangulation library
const _ = require('lodash');      // Utility library
const short = require('short-uuid'); // Generates short unique identifiers
const chalk = require('chalk');   // Colored console output

const {
    Vector2,
    Vector3,
    Box2,
    Plane,
    Line3
} = require('three'); // Three.js math classes

// Class representing collections of linedefs forming polygonal shapes
class ZShape 
{
    // Determine if a 2D point is inside this shape using ray-casting
    static isPointInShape(shape, pt) {
        let poly = shape.vertices.map( vert => vert.v );
        for (var c = false, i = -1, l = poly.length, j = l - 1; ++i < l; j = i)
          ((poly[i].y <= pt.y && pt.y < poly[j].y) || (poly[j].y <= pt.y && pt.y < poly[i].y)) && (pt.x < (poly[j].x - poly[i].x) * (pt.y - poly[i].y) / (poly[j].y - poly[i].y) + poly[i].x) && (c = !c);
        return c;
    }

    // Find the topmost linedef in a list (smallest Y-coordinate)
    static getNorthMost(linelist) {
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

    // Find a connected linedef sharing a vertex, excluding current line
    static findConnected(list, CurLine, CurVertex) {
        let child = _.find(list, function(linedef) {
            return linedef.hasVertex(CurVertex) && !linedef.isFree && linedef.index !== CurLine.index;
        });
        return child || null;
    }

    // Find a connected linedef sharing a vertex and belongs to a specific parent sector
    static findConnectedParents(list, CurLine, CurVertex, sector) {
        let child = _.find(list, function(linedef) {
            return linedef.hasVertex(CurVertex) && 
                   !linedef.isFree && 
                   sector.vertices.indexOf(linedef.getOtherVertex(CurVertex)) > -1 &&
                   linedef.index !== CurLine.index;
        });
        return child || null;
    }

    // Check if two sectors are identical (or both null)
    static areSectorsTheSame(sector1, sector2) {
        if (sector1 == null && sector2 == null) return true;
        if (sector1 == null || sector2 == null) return false;
        return sector1.uuid == sector2.uuid;
    }

    // Check if two sectors are non-null and identical
    static areSharedSectorsTheSame(sector1, sector2) {
        if (sector1 == null || sector2 == null) return false;
        return sector1.uuid == sector2.uuid;
    }

    // Check if two linedefs share the same sectors on either side
    static linesShareSectors(linedef1, linedef2) {
        let shared =  (
            (ZShape.areSectorsTheSame(linedef1.sectors[0], linedef2.sectors[0]) && ZShape.areSectorsTheSame(linedef1.sectors[1], linedef2.sectors[1])) ||
            (ZShape.areSectorsTheSame(linedef1.sectors[0], linedef2.sectors[1]) && ZShape.areSectorsTheSame(linedef1.sectors[1], linedef2.sectors[0]))
        );
        return shared;
    }

    // Find a connected linedef sharing the same sector as the current line
    static findConnectedAndSector(list, CurLine, CurVertex) {
        let child = _.find(list, function(linedef) {
            return linedef.hasVertex(CurVertex) && !linedef.isFree && linedef.index !== CurLine.index && ZShape.linesShareSectors(CurLine, linedef);
        });
        return child || null;
    }

    // Find a connected linedef that shares a vertex, sector, and parent sector
    static findConnectedAndParentSector(list, CurLine, CurVertex, sector) {
        let child = _.find(list, function(linedef) {
            return linedef.hasVertex(CurVertex) && 
                   !linedef.isFree && 
                   linedef.index !== CurLine.index && 
                   sector.vertices.indexOf(linedef.getOtherVertex(CurVertex)) > -1 &&
                   ZShape.linesShareSectors(CurLine, linedef);
        });
        return child || null;
    }

    // Organize shapes into hierarchical groups with holes
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
                    shape.isHole = true; // Mark shapes inside a root as holes
                    holes.push(shape);
                } else {
                    shape.isRoot = true;
                    var childIndex = shape.parent.shapes.indexOf(shape);
                    shape.parent.shapes.splice(childIndex, 1);
                    shape.parent = null;
                }
            } else {
                shape.isRoot = true; // Shapes with no parent are root shapes
            }
            return shape;
        })
        .filter(shape => shape.isRoot);

        return shapes;
    }

    // Extract all shapes from a sector's linedefs
    static getShapesFromSector(target) {
        var LinesWithOutShapes = target.linedefs.filter(linedef => !linedef.isFree);
        var availableLines = _.clone(LinesWithOutShapes);

        var startLineDef = ZShape.getNorthMost(LinesWithOutShapes);
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
            if (limitrunaway > 20000) {
                let problemLines = availableLines.map(ld => ld.index).join(', ');
                let runawaymsg = chalk.redBright(`found a problem with linedefs: ${problemLines}`);
                console.error(runawaymsg);
                break;
            }

            let child = ZShape.findConnectedAndParentSector(LinesWithOutShapes, CurLine, CurVertex, target) ||
                        ZShape.findConnectedParents(availableLines, CurLine, CurVertex, target);

            if (child) {
                var UsedIndex = LinesWithOutShapes.indexOf(child);
                if (UsedIndex > -1) LinesWithOutShapes.splice(UsedIndex, 1);

                if (child.index == border[0].index) { // Closed loop detected
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

        // Convert borders to ZShape instances
        borders = borders.map(border => {
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

            if (linedefs[0].vertices[0].x > linedefs[0].vertices[1]) {
                linedefs = linedefs.reverse();
                vertices = vertices.reverse();
            }

            return new ZShape({ linedefs, vertices });
        });

        let groups = ZShape.createGroups(borders);
        return groups;
    }

    // Constructor: defines a polygon shape with vertices and linedefs
    constructor(def) {
        this.UUID = short.uuid(); // Unique ID for this shape
        this.bounds = new Box2(); // Bounding box for quick checks
        this.vertices = def.vertices;
        this.linedefs = def.linedefs;
        this.isRoot = false;
        this.isHole = false;
        this.parent = null;
        this.shapes = [];

        this.vertices.forEach(vertex => {
            this.bounds.expandByPoint(vertex.v); // Expand bounding box
        });

        this.area = this.getArea(); // Precompute area
    }

    // Add a shape as a child (hole) to this shape
    addChild(zshape) {
        if (this.is(zshape)) return false;
        if (this.shapes.indexOf(zshape) < 0) {
            zshape.parent = this;
            this.shapes.push(zshape);
            return true;
        }
        return false;
    }

    // Check if shape is the same as another
    is(zshape) {
        return this.UUID == zshape.UUID;
    }

    // Compute the 2D area of this shape using its bounding box
    getArea() {
        let v = new Vector2();
        this.bounds.getSize(v);
        this.area = v.x * v.y;
        return v.x * v.y;
    }

    // Check if this shape fully contains another shape
    containsShape(zshape) {
        return this.bounds.containsBox(zshape.bounds);
    }

    // Check if this shape overlaps another shape at all
    overlaps(zshape) {
        return this.bounds.intersectsBox(zshape.bounds);
    }
}

// Class representing a walkable 3D floor plane
class FloorPlane
{
    // Triangulate a 2D shape (with holes) into triangles for rendering
    static getTrianglesFromShape2D(shape) {
        var index = 0;
        let vertices = [];
        let holeIndices = [];

        shape.vertices.forEach(vertex => { vertices.push(vertex); index++; });

        shape.shapes.forEach(shape => {
            holeIndices.push(index); // Index where hole vertices start
            shape.vertices.forEach(vertex => { vertices.push(vertex); index++; });
        });

        if (!holeIndices.length) holeIndices = null;

        let triangulated = earcut(
            vertices.map(vert => vert.v.toArray()).flat(), // Flatten 2D points
            holeIndices,
            2
        ).map(vindex => vertices[vindex]);

        return triangulated;
    }

    // Generate standardized slope property names for a sector
    static sectorSlopeNames(isFloor) {
        var prefix = isFloor ? 'floor' : 'ceiling';
        return { a: `${prefix}plane_a`, b: `${prefix}plane_b`, c: `${prefix}plane_c`, d: `${prefix}plane_d` };
    }

    // Get slope values from sector properties
    static sectorSlopesBy(sector, names) {
        return { a: sector[names.a], b: sector[names.b], c: sector[names.c], d: sector[names.d] };
    }

    // Calculate Z position for a vertex given a sector's floor or ceiling slope
    static getVertexZ(sector, vertex, isFloor) {
        if (!sector) return 0;

        let isSloped = isFloor ? sector.slopedFloor : sector.slopedCeiling;
        if (isSloped) {
            var { a, b, c, d } = FloorPlane.sectorSlopesBy(sector, FloorPlane.sectorSlopeNames(isFloor));
            var q = Math.sqrt(a * a + b * b + c * c);
            var normal = new Vector3(a, b, c).divideScalar(q);
            var p = d / q;
            return (-p - (normal.x * vertex.x + normal.y * vertex.y)) / normal.z;
        }

        let isTerrain = isFloor ? sector.terrainFloor : sector.terrainCeiling;
        if (isTerrain) {
            let zproperty = isFloor ? 'zfloor' : 'zceiling';
            if (vertex[zproperty] !== undefined) return vertex[zproperty];
        }

        return isFloor ? sector.heightfloor : sector.heightceiling;
    }

    static getCeilingVertexZ(sector, vertex) {
        if (sector.terrainCeiling && vertex.zceiling !== undefined) return vertex.zceiling;
        return sector.heightceiling;
    }

    static getFloorVertexZ(sector, vertex) {
        if (sector.terrainFloor && vertex.zfloor !== undefined) return vertex.zfloor;
        return sector.heightfloor;
    }

    // Constructor for a floor plane associated with a group
    constructor(group) {
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

    addShapeToGroup(shape) {
        this.group.shapes.push(shape);
    }

    // Build floor plane geometry from a sector
    setFromSector(sector) {
        this.model = sector;
        this.target = sector;
        this.isFree = sector.isFree;
        this.floorz = sector.heightfloor;
        this.is3DFloor = false;
        if (sector.isModel) this.isModel = true;

        this.shapes = ZShape.getShapesFromSector(this.target);
        this.triangles2D = this.shapes.map(FloorPlane.getTrianglesFromShape2D, this);

        this.triangles3D = this.triangles2D.map(triangle => {
            return triangle.map(vertex => new Vector3(vertex.x, FloorPlane.getVertexZ(this.target, vertex, true), vertex.y));
        }, this);

        if (sector.slopedFloor) {
            var { a, b, c, d } = FloorPlane.sectorSlopesBy(sector, FloorPlane.sectorSlopeNames(true));
            var q = Math.sqrt(a * a + b * b + c * c);
            var normal = new Vector3(a, b, c).divideScalar(q);
            var p = d / q;
            this.plane.set(normal, p);
            this.isSloped = true;
        } else if (sector.terrainFloor) {
            this.isSloped = true;
            let { getFloorVertexZ } = FloorPlane;
            this.plane.setFromCoplanarPoints(
                new Vector3(sector.vertices[0].x, getFloorVertexZ(sector, sector.vertices[0]), sector.vertices[0].y),
                new Vector3(sector.vertices[1].x, getFloorVertexZ(sector, sector.vertices[1]), sector.vertices[1].y),
                new Vector3(sector.vertices[2].x, getFloorVertexZ(sector, sector.vertices[2]), sector.vertices[2].y)
            );
        }

        return this;
    }

    // Get Z position at a specific 2D point
    getZAtPoint(v) {
        if (this.isSloped) {
            var { a, b, c, d } = FloorPlane.sectorSlopesBy(this.model, FloorPlane.sectorSlopeNames(!this.is3DFloor));
            var q = Math.sqrt(a * a + b * b + c * c);
            var normal = new Vector3(a, b, c).divideScalar(q);
            var p = d / q;
            return (-p - (normal.x * v.x + normal.y * v.y)) / normal.z;
        }

        if (this.terrainFloor) {
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

    // Get 3D ceiling Z at a point
    get3DCeilingAtPoint(v) {
        let { model } = this;

        if (model.slopedFloor) {
            var { a, b, c, d } = FloorPlane.sectorSlopesBy(model, FloorPlane.sectorSlopeNames(true));
            var q = Math.sqrt(a * a + b * b + c * c);
            var normal = new Vector3(a, b, c).divideScalar(q);
            var p = d / q;
            return (-p - (normal.x * v.x + normal.y * v.y)) / normal.z;
        }

        if (model.terrainFloor) {
            var ray = new Line3();
            var hitpt = new Vector3();
            var startpt = new Vector3(v.x, Number.MAX_SAFE_INTEGER, v.y);
            var endpt = startpt.clone().setY(-Number.MAX_SAFE_INTEGER);
            ray.set(startpt, endpt);

            let { getFloorVertexZ } = FloorPlane;

            let plane = new Plane().setFromCoplanarPoints(
                new Vector3(model.vertices[0].x, getFloorVertexZ(model, model.vertices[0]), model.vertices[0].y),
                new Vector3(model.vertices[1].x, getFloorVertexZ(model, model.vertices[1]), model.vertices[1].y),
                new Vector3(model.vertices[2].x, getFloorVertexZ(model, model.vertices[2]), model.vertices[2].y)
            );

            plane.intersectLine(ray, hitpt);
            return hitpt.y;
        }

        return model.heightfloor;
    }

    // Build 3D floor plane from a model sector
    setFromModel(target, model, floorplane) {
        this.is3DFloor = true;
        this.target = target;
        this.model = model;
        this.floorz = model.heightceiling;

        this.shapes = floorplane.shapes;
        this.triangles2D = floorplane.triangles2D;

        // Sloped ceiling processing
        if (model.slopedCeiling) {
            this.isSloped = true;
            var { a, b, c, d } = FloorPlane.sectorSlopeNames(false);
            var normal = new Vector3(model[a], model[c], model[b]);
            this.plane.set(normal, model[d]);
        } else if (model.terrainCeiling) {
            this.isSloped = true;
            let { getCeilingVertexZ } = FloorPlane;
            this.plane.setFromCoplanarPoints(
                new Vector3(model.vertices[0].x, getCeilingVertexZ(model, model.vertices[0]), model.vertices[0].y),
                new Vector3(model.vertices[1].x, getCeilingVertexZ(model, model.vertices[1]), model.vertices[1].y),
                new Vector3(model.vertices[2].x, getCeilingVertexZ(model, model.vertices[2]), model.vertices[2].y)
            );
        }

        // Build triangles for 3D mesh
        let triangles3D = this.triangles2D.map(triangle => triangle.map(vertex => new Vector3(vertex.x, this.getZAtPoint(vertex.v), vertex.y)));
        let baseTriangles = this.triangles2D.map(triangle => triangle.map(vertex => new Vector3(vertex.x, this.get3DCeilingAtPoint(vertex.v), vertex.y)));
        this.triangles3D = triangles3D.concat(baseTriangles);

        // Build walls
        var walls = this.shapes.map(shape => {
            let validLines = shape.linedefs.filter(line => !line.isFree && line.twosided !== undefined);
            return validLines.map(linedef => {
                let { vertices } = linedef;
                let corners = [
                    new Vector3(vertices[0].x, this.get3DCeilingAtPoint(vertices[0].v), -vertices[0].y),
                    new Vector3(vertices[0].x, this.getZAtPoint(vertices[0].v), -vertices[0].y),
                    new Vector3(vertices[1].x, this.getZAtPoint(vertices[1].v), -vertices[1].y),
                    new Vector3(vertices[1].x, this.get3DCeilingAtPoint(vertices[1].v), -vertices[1].y)
                ];

                return [corners[1], corners[2], corners[0], corners[0], corners[2], corners[3]]; // two triangles
            }).flat();
        });

        if (walls.length) this.walls = walls;
        return this;
    }

    // Check if a point/thing is inside any root shape of this floor plane
    hasThing(thing) {
        let roots = this.shapes.filter(s => s.isRoot);
        for (var i = 0; i < roots.length; i++) {
            let shape = roots[i];
            let inShape = ZShape.isPointInShape(shape, thing.v);
            if (inShape) return { hasThing: true, floorplane: this, shape: shape };
        }
        return { hasThing: false, floor: null, shape: null };
    }
}

// Group of FloorPlanes for a map/sector
class FloorPlaneGroup
{
    static create(udmf) {
        let group = new FloorPlaneGroup(udmf);
        udmf.sectors.forEach(sector => {
            let floorplane = new FloorPlane(group).setFromSector(sector);
            group.floorplanes.push(floorplane);

            if (sector.hasFloors3D) {
                sector.modelSectors.forEach(modelSector => {
                    let floorplane3D = new FloorPlane(group).setFromModel(sector, modelSector, floorplane);
                    group.floorplanes.push(floorplane3D);
                });
            }
        });
        return group;
    }

    constructor(udmf) {
        this.UDMF = udmf;
        this.shapes = [];
        this.floorplanes = [];
    }

    // Compute step geometry from linedefs
    getSteps() {
        let validLines = this.UDMF.linedefs.filter(line => !line.isFree && line.twosided !== undefined);

        let triangles = validLines.map(linedef => {
            let { vertices, sectors } = linedef;
            let corners = [
                new Vector3(vertices[0].x, FloorPlane.getVertexZ(sectors[0], vertices[0], true), -vertices[0].y),
                new Vector3(vertices[0].x, FloorPlane.getVertexZ(sectors[1], vertices[0], true), -vertices[0].y),
                new Vector3(vertices[1].x, FloorPlane.getVertexZ(sectors[1], vertices[1], true), -vertices[1].y),
                new Vector3(vertices[1].x, FloorPlane.getVertexZ(sectors[0], vertices[1], true), -vertices[1].y)
            ];
            if (corners[0].equals(corners[1]) && corners[2].equals(corners[3])) return null;
            return [corners[1], corners[2], corners[0], corners[0], corners[2], corners[3]].reverse();
        }).filter(tri => tri !== null);

        let wallLines = this.UDMF.linedefs.filter(line => !line.isFree && !line.twosided && line !== null);

        let triangles2 = wallLines.map(linedef => {
            if (linedef.user_nocast) return null;
            let { vertices, sectors } = linedef;
            if (sectors && sectors.length && sectors[0]) {
                let corners = [
                    new Vector3(vertices[0].x, FloorPlane.getVertexZ(sectors[0], vertices[0], true), -vertices[0].y),
                    new Vector3(vertices[0].x, sectors[0].heightceiling, -vertices[0].y),
                    new Vector3(vertices[1].x, sectors[0].heightceiling, -vertices[1].y),
                    new Vector3(vertices[1].x, FloorPlane.getVertexZ(sectors[0], vertices[0], true), -vertices[1].y)
                ];
                if (corners[0].equals(corners[1]) && corners[2].equals(corners[3])) return null;
                return [corners[1], corners[2], corners[0], corners[0], corners[2], corners[3]].reverse();
            }
            return null;
        }).filter(tri => tri !== null);

        let triangles3D = this.floorplanes.filter(fp => fp.walls !== undefined).map(fp => fp.walls).flat();

        return { triangles, triangles3D, triangles2 };
    }

    // Get all 3D triangles from floor planes
    getTriangles() {
        let tris = [];
        this.floorplanes.forEach(floorplane => {
            floorplane.triangles3D.forEach(triangle => tris.push(triangle));
        });
        return tris;
    }

    // Get 3D triangles filtered by callback
    getTrianglesBy(cb) {
        let tris = [];
        let floorplanes = this.floorplanes.filter(cb);
        floorplanes.forEach(floorplane => {
            floorplane.triangles3D.forEach(triangle => tris.push(triangle));
        });
        return tris;
    }
}

const ZShapes = FloorPlaneGroup;
module.exports = ZShapes;
