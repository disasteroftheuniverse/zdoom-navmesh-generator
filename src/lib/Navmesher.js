// jshint esversion: 8

// Import core THREE.js library
let _three = require('three');

// Because `three/examples` modules are not standard CommonJS modules, 
// they were manually included in the project directory.
_three.OBJExporter = require('./../three/OBJExport');
_three.OBJLoader = require('./../three/OBJLoader');
_three.BufferGeometryUtils = require('./../three/BufferUtils');

const THREE = _three;

// Navigation mesh and polygon tools
const recast = require('recastjs');        // Recast.js for navigation mesh building
const earcut = require('earcut');          // Polygon triangulation
const { triangulate } = require('./tesselate'); // Custom tessellation utility
let PathUtils = require('./../three/PathUtils'); // Utilities for pathfinding

// Configuration constants
const { RecastOptions, MAPSCALE, RecastType, MAPSCALEINV, MERGE_TOLERANCE, TRIANGULATION_ALGORITHM } = require('./../config');

// Node.js utilities
const path = require('path');
const fs = require('fs');

// Utility libraries
const Color = require('color');
const _ = require('lodash');
var cdt2d = require('cdt2d');          // Constrained Delaunay triangulation
var centroid = require('polygon-centroid'); // Compute polygon centroid

/**
 * Flags used for navigation mesh nodes
 * @readonly
 * @enum { number }
 */
const FLAGS = {
    NAV_TARGET: 1,
    NAV_LEAP: 2,
    NAV_ARC: 4,
    NAV_LAND: 8,
    NAV_ACTION: 16,
    NAV_OBSTACLE: 32,
    NAV_AVOID: 64,
    NAV_ENABLED: 128
};

/**
 * Apply cubic UV mapping to a geometry
 * Maps each face to the most suitable side of a cube (XY, XZ, YZ)
 * @param {THREE.BufferGeometry} geom - Geometry to apply UVs to
 * @param {THREE.Matrix4} transformMatrix - Pre-rotation matrix to align cube sides
 * @param {THREE.Box3} bbox - Bounding box of geometry
 * @param {number} bbox_max_size - Maximum bounding box dimension
 */
function _applyBoxUV(geom, transformMatrix, bbox, bbox_max_size) {
    let coords = [];
    coords.length = 2 * geom.attributes.position.array.length / 3;

    // Initialize UV attribute if missing
    if (geom.attributes.uv === undefined) {
        geom.setAttribute('uv', new THREE.Float32BufferAttribute(coords, 2));
    }

    // Helper function to calculate UVs for one face
    let makeUVs = function (v0, v1, v2) {
        v0.applyMatrix4(transformMatrix);
        v1.applyMatrix4(transformMatrix);
        v2.applyMatrix4(transformMatrix);

        // Compute normalized face normal
        let n = new THREE.Vector3();
        n.crossVectors(v1.clone().sub(v0), v1.clone().sub(v2)).normalize();
        n.x = Math.abs(n.x);
        n.y = Math.abs(n.y);
        n.z = Math.abs(n.z);

        let uv0 = new THREE.Vector2();
        let uv1 = new THREE.Vector2();
        let uv2 = new THREE.Vector2();

        // Determine which cube face to project onto
        if (n.y > n.x && n.y > n.z) { // Y-dominant: XZ plane
            uv0.x = (v0.x - bbox.min.x) / bbox_max_size;
            uv0.y = (bbox.max.z - v0.z) / bbox_max_size;
            uv1.x = (v1.x - bbox.min.x) / bbox_max_size;
            uv1.y = (bbox.max.z - v1.z) / bbox_max_size;
            uv2.x = (v2.x - bbox.min.x) / bbox_max_size;
            uv2.y = (bbox.max.z - v2.z) / bbox_max_size;
        } else if (n.x > n.y && n.x > n.z) { // X-dominant: YZ plane
            uv0.x = (v0.z - bbox.min.z) / bbox_max_size;
            uv0.y = (v0.y - bbox.min.y) / bbox_max_size;
            uv1.x = (v1.z - bbox.min.z) / bbox_max_size;
            uv1.y = (v1.y - bbox.min.y) / bbox_max_size;
            uv2.x = (v2.z - bbox.min.z) / bbox_max_size;
            uv2.y = (v2.y - bbox.min.y) / bbox_max_size;
        } else if (n.z > n.y && n.z > n.x) { // Z-dominant: XY plane
            uv0.x = (v0.x - bbox.min.x) / bbox_max_size;
            uv0.y = (v0.y - bbox.min.y) / bbox_max_size;
            uv1.x = (v1.x - bbox.min.x) / bbox_max_size;
            uv1.y = (v1.y - bbox.min.y) / bbox_max_size;
            uv2.x = (v2.x - bbox.min.x) / bbox_max_size;
            uv2.y = (v2.y - bbox.min.y) / bbox_max_size;
        }

        return { uv0, uv1, uv2 };
    };

    // Apply UVs for indexed geometry
    if (geom.index) {
        for (let vi = 0; vi < geom.index.array.length; vi += 3) {
            let idx0 = geom.index.array[vi];
            let idx1 = geom.index.array[vi + 1];
            let idx2 = geom.index.array[vi + 2];

            let v0 = new THREE.Vector3(...geom.attributes.position.array.slice(3 * idx0, 3 * idx0 + 3));
            let v1 = new THREE.Vector3(...geom.attributes.position.array.slice(3 * idx1, 3 * idx1 + 3));
            let v2 = new THREE.Vector3(...geom.attributes.position.array.slice(3 * idx2, 3 * idx2 + 3));

            let uvs = makeUVs(v0, v1, v2);
            coords[2 * idx0] = uvs.uv0.x;
            coords[2 * idx0 + 1] = uvs.uv0.y;
            coords[2 * idx1] = uvs.uv1.x;
            coords[2 * idx1 + 1] = uvs.uv1.y;
            coords[2 * idx2] = uvs.uv2.x;
            coords[2 * idx2 + 1] = uvs.uv2.y;
        }
    } else { // Non-indexed geometry
        for (let vi = 0; vi < geom.attributes.position.array.length; vi += 9) {
            let v0 = new THREE.Vector3(...geom.attributes.position.array.slice(vi, vi + 3));
            let v1 = new THREE.Vector3(...geom.attributes.position.array.slice(vi + 3, vi + 6));
            let v2 = new THREE.Vector3(...geom.attributes.position.array.slice(vi + 6, vi + 9));

            let uvs = makeUVs(v0, v1, v2);
            let idx0 = vi / 3;
            let idx1 = idx0 + 1;
            let idx2 = idx0 + 2;

            coords[2 * idx0] = uvs.uv0.x;
            coords[2 * idx0 + 1] = uvs.uv0.y;
            coords[2 * idx1] = uvs.uv1.x;
            coords[2 * idx1 + 1] = uvs.uv1.y;
            coords[2 * idx2] = uvs.uv2.x;
            coords[2 * idx2 + 1] = uvs.uv2.y;
        }
    }

    geom.attributes.uv.array = new Float32Array(coords);
}

/**
 * Wrapper to apply cubic UV mapping
 * @param {THREE.BufferGeometry} bufferGeometry 
 * @param {THREE.Matrix4} transformMatrix optional transform
 * @param {number} boxSize optional cube size
 */
function applyBoxUV(bufferGeometry, transformMatrix, boxSize) {
    if (!transformMatrix) transformMatrix = new THREE.Matrix4();

    if (!boxSize) {
        let geom = bufferGeometry;
        geom.computeBoundingBox();
        let bbox = geom.boundingBox;
        let bbox_size_x = bbox.max.x - bbox.min.x;
        let bbox_size_y = bbox.max.y - bbox.min.y;
        let bbox_size_z = bbox.max.z - bbox.min.z;
        boxSize = Math.max(bbox_size_x, bbox_size_y, bbox_size_z);
    }

    let uvBbox = new THREE.Box3(
        new THREE.Vector3(-boxSize / 2, -boxSize / 2, -boxSize / 2),
        new THREE.Vector3(boxSize / 2, boxSize / 2, boxSize / 2)
    );

    _applyBoxUV(bufferGeometry, transformMatrix, uvBbox, boxSize);
}

/**
 * Class for building navigation meshes from 3D models
 */
class NavMesher {
    /**
     * Build Recast polygon mesh from OBJ file string
     * @param {String} OBJData 
     * @param {Object} config Recast options
     * @returns {Promise} Resolves with polygon data
     */
    static async BuildRecastFromOBJ(OBJData, config) {
        recast.settings(config.options);

        return new Promise((resolve, reject) => {
            recast.OBJDataLoader(OBJData, function () {
                if (config.solo) {
                    recast.buildSolo();
                } else {
                    recast.buildTiled();
                }

                // Query all polygons in the mesh
                recast.queryPolygons(
                    0, 0, 0, 10000, 10000, 10000, 200000,
                    recast.cb(polys => resolve(polys))
                );
            });
        });
    }

    // Convert a Recast vertex to 2D and 3D THREE vectors
    static getVectorsFromRecastVertex(vert) {
        let v2 = new THREE.Vector2(vert.x, vert.z);
        let v3 = new THREE.Vector3(vert.x, vert.y, vert.z);
        return { v2, v3 };
    }

    // Convert polygon vertex references to vectors
    static getVerticesFromRecastPoly(poly) {
        return poly.vertices.map(NavMesher.getVectorsFromRecastVertex);
    }

    // Triangulation using Earcut
    static useEarcut(vertices, poles) {
        let splitVerts = vertices.map(v => v);
        let indices = earcut(splitVerts.map(v => v.v2.toArray()).flat(), poles, 2);
        return indices.map(i => splitVerts[i].v3).reverse();
    }

    // Triangulation using custom tessellation
    static useTess(vertices) {
        let vec3Verts = vertices.map(v => v.v3);
        let findMatching = function (v3) {
            for (let j = 0; j < vec3Verts.length; j++) {
                let vtx = vec3Verts[j];
                if (vtx.x == v3.x && vtx.z == v3.z) return vtx.y;
            }
            return 0;
        };

        let contours = [vertices.map(v => v.v2.toArray()).flat(), []];
        let triangulated = triangulate(contours);
        let triangles = [];

        for (let i = 0; i < triangulated.length; i += 2) {
            let vertex = new THREE.Vector3(triangulated[i], 0, triangulated[i + 1]);
            vertex.setY(findMatching(vertex));
            triangles.push(vertex);
        }

        return triangles.reverse();
    }

    // Triangulation using Delaunay
    static useDelaunay(vertices) {
        let points = vertices.map(v => v.v2.toArray()).reverse();
        let points3D = vertices.reverse();
        let triangulated = cdt2d(points, null, { interior: false, exterior: true, delaunay: true });

        return triangulated.map(tri => [points3D[tri[0]].v3, points3D[tri[1]].v3, points3D[tri[2]].v3]).flat().reverse();
    }

    // Use all triangulation methods and pick the one with the fewest triangles
    static useAll(vertices) {
        let a = NavMesher.useEarcut(vertices);
        let b = NavMesher.useTess(vertices);
        let c = NavMesher.useDelaunay(vertices);

        let triangles = [a, b, c];
        let shortest = Infinity;
        let shortestList;

        triangles.forEach(list => {
            if (list.length < shortest) {
                shortest = list.length;
                shortestList = list;
            }
        });

        return shortestList;
    }

    // Compute centroid of polygon
    static getPolyCentroid(vertices) {
        let center = centroid(vertices.map(v => v.v2.clone()));
        let vecA = new THREE.Vector3();
        let vecB = new THREE.Vector3();
        let box = new THREE.Box3();

        vertices.forEach(vert => box.expandByPoint(vert.v3));
        box.getCenter(vecB);

        vecA.setX(center.x);
        vecA.setZ(center.y);
        vecA.setY(vecB.y);

        return vecA;
    }

    static getBufferGeometryFromRecastPoly(poly, config, offMeshNodes) {
        // Extract vertices from the polygon
        var vertices = NavMesher.getVerticesFromRecastPoly(poly);
        var triangulation = _.toLower(config.triangulation); // Triangulation method from config
        var poles = []; // Optional poles for earcut

        let geoname = 'nonode'; // Default geometry name
        var triangles;

        // Select triangulation method
        switch (triangulation) {
            case 'smallest':
                triangles = NavMesher.useAll(vertices); // Try all methods and pick the smallest
                break;

            case 'earcut':
                triangles = NavMesher.useEarcut(vertices, poles); // Use Earcut
                break;

            case 'delaunay':
                triangles = NavMesher.useDelaunay(vertices); // Use Delaunay
                break;

            default:
                triangles = NavMesher.useTess(vertices); // Use custom tessellation
                break;
        }

        // Warn if triangle array is not divisible by 3
        if (triangles.length % 3 !== 0) {
            //console.log('not divisible by 3');
        }

        // Group triangles into sets of 3 vertices
        let sortedTriangles = _.chunk(triangles, 3);
        let finalTriangles = [];

        sortedTriangles.forEach((triangle) => {
            // Scale vertices
            let verts = triangle.map(v3 => v3.clone().multiplyScalar(64));

            let a = triangle[0];
            let b = triangle[1];
            let c = triangle[2];
            let d = null;

            let subTriangles = [];

            // Check if any off-mesh nodes are inside this polygon
            offMeshNodes.forEach((node, nodeindex) => {
                var inPoly = PathUtils.isVectorInPolygon(node.position, verts);

                if (inPoly) {
                    console.log(`node ${nodeindex} is in poly`);
                    geoname = 'hasnode';

                    // Split polygon into triangles using the node as vertex
                    d = node.position.clone().multiplyScalar(1 / 64);
                    subTriangles =
                        [
                            a, d, b,
                            b, d, c,
                            c, d, a
                        ];
                }
            });

            // Use either original triangle or subdivided ones
            if (!subTriangles.length) {
                finalTriangles.push(a, b, c);
            } else {
                subTriangles.forEach(pt => finalTriangles.push(pt));
            }
        });

        if (geoname == 'hasnode') {
            //console.log(triangles);
        }

        // Create BufferGeometry from triangle points
        let geometry = new THREE.BufferGeometry().setFromPoints(triangles);
        geometry.name = geoname;

        return geometry;
    }

    // Create BufferGeometry for an entire mesh of polygons
    static getBufferGeometryFromRecastMesh(polys, config, offMeshNodes) {
        // Sort polygons by reference
        polys = polys.sort((a, b) => a.ref - b.ref);

        // Convert each polygon to BufferGeometry
        return polys.map(poly => {
            return NavMesher.getBufferGeometryFromRecastPoly(poly, config, offMeshNodes);
        });
    }

    /**
     * Create a THREE.Scene from Recast polygons
     * @param { Object } polys - Recast polygon data
     * @param { Object } config
     * @param { THREE.Scene } threescene - optional original scene
     */
    static CreateSceneFromRecast(polys, config, threescene) {
        let scene = new THREE.Scene();
        let obj = new THREE.Object3D();
        scene.add(obj);

        // Build alternative groups and off-mesh nodes
        let { alt, offMeshNodes } = NavMesher.buildAltGroups(polys, threescene);

        // Material for the mesh
        let sectorMTL = new THREE.MeshBasicMaterial({ color: 0xFF6F00, side: THREE.DoubleSide, transparent: true, opacity: 0.65, blendEquation: THREE.AdditiveBlending });

        let geometries = [];
        let previewNodes = new THREE.Object3D(); // Group to preview polygons
        let previewOffMeshNodes = new THREE.Object3D(); // Group to preview off-mesh nodes
        var nodeCount = 0;

        // Iterate over groups of polygons
        alt.groups.forEach(group => {
            group.forEach(poly => {
                // Random material for each polygon
                let polyMTL = new THREE.MeshBasicMaterial({
                    color: new THREE.Color(Math.random(), Math.random(), Math.random()),
                    side: THREE.DoubleSide,
                    transparent: true,
                    opacity: 0.65,
                    blendEquation: THREE.AdditiveBlending
                });

                // Map vertex IDs to actual vertices
                let verts = poly.vertexIds.map(id => alt.vertices[id]);
                // Triangulate polygon for geometry
                let indices = earcut(verts.map(v => new THREE.Vector2(v.x, v.z).toArray()).flat(), null, 2);
                let positions = indices.map(id => verts[id]).reverse();
                let geometry = new THREE.BufferGeometry().setFromPoints(positions);
                geometry = THREE.BufferGeometryUtils.mergeVertices(geometry);
                geometries.push(geometry);

                // Create mesh for polygon
                let polyMesh = new THREE.Mesh(geometry, polyMTL);
                polyMesh.userData.nodeIndex = nodeCount;
                polyMesh.userData.centroid = poly.centroid;
                previewNodes.add(polyMesh);
                nodeCount++;
            });
        });

        // Merge all polygon geometries into one mesh
        let mergedgeometries = THREE.BufferGeometryUtils.mergeBufferGeometries(geometries);
        mergedgeometries = THREE.BufferGeometryUtils.mergeVertices(mergedgeometries);

        // Clean up user data if present
        if (mergedgeometries && mergedgeometries.userData && mergedgeometries.userData.mergedUserData) {
            delete mergedgeometries.userData.mergedUserData;
        }

        // Create main mesh
        var mesh = new THREE.Mesh(mergedgeometries, sectorMTL);
        mesh.updateMatrix();
        obj.add(mesh);
        obj.updateMatrix();

        // Add off-mesh nodes to preview
        offMeshNodes.forEach(node => {
            previewOffMeshNodes.add(node);
        });

        scene.updateMatrixWorld(true);

        // Create preview Scene with polygons and off-mesh nodes
        let previewScene = new THREE.Scene();
        let previewMesh = new THREE.Object3D();
        previewMesh.add(previewNodes);
        previewScene.add(previewMesh);
        previewScene.add(previewOffMeshNodes);

        previewScene.updateMatrixWorld(true);
        previewScene.updateMatrix();

        // Find all off-mesh nodes in the preview scene
        let iconNodes = [];
        previewScene.traverse(node => {
            if (node.name == 'offnode.vis') {
                iconNodes.push(node);
            }
        });

        console.log(`off mesh connections: ${iconNodes.length}`);

        // Prepare mesh for exporting
        let OBJScene = new THREE.Scene();
        let GZPreviewMesh = mesh.clone();

        // Compute bounding box for UV mapping
        mesh.geometry.computeBoundingBox();
        let bboxSize = new THREE.Vector3();
        mesh.geometry.boundingBox.getSize(bboxSize);
        let uvMapSize = Math.min(bboxSize.x, bboxSize.y, bboxSize.z);

        // Apply box UV mapping
        applyBoxUV(GZPreviewMesh.geometry, new THREE.Matrix4().copy(mesh.matrixWorld).invert(), uvMapSize);
        GZPreviewMesh.geometry.attributes.uv.needsUpdate = true;

        // Add cloned mesh to OBJ scene
        OBJScene.add(GZPreviewMesh);
        let sceneScale = new THREE.Vector3(MAPSCALEINV, MAPSCALEINV, MAPSCALEINV);
        GZPreviewMesh.scale.multiply(sceneScale);
        GZPreviewMesh.updateMatrix();
        GZPreviewMesh.updateMatrixWorld(true);
        OBJScene.updateMatrix();
        OBJScene.updateMatrixWorld(true);

        // Export scene to Wavefront OBJ format
        let exporter = new THREE.OBJExporter();
        let wavefront = exporter.parse(OBJScene);

        return { mesh: mesh, preview: previewScene, alt: alt, wavefront: wavefront };
    }

    // Build alternative polygon groups and associate off-mesh nodes
    static buildAltGroups(polys, threescene) {
        let altVerts = [];
        let altPolys = [];
        let offMeshNodes = [];

        // Template for alternative polygon
        let altagonTemplate = {
            index: -1,
            centroid: [],
            vertices: [],
            edges: [],
            neighborIDs: [],
            connections: [],
            portals: [],
            hasGroup: false,
            groupID: -1,
            area: 0,
            flags: 0,
            helper: 0
        };

        // Collect off-mesh nodes from the original scene
        threescene.traverse(node => {
            if (node && node.name == 'navnode') {
                if (node.userData && node.userData.thing) {
                    if (offMeshNodes.indexOf(node) < 0) {
                        let cleanCopy = node.clone();
                        cleanCopy.name = 'offnode.vis';
                        cleanCopy.userData.isOffMesh = true;
                        offMeshNodes.push(cleanCopy);
                    }
                }
            }
        });

        // Utility function to find off-mesh node by UDMF tag
        var getOMNodeByUDMFTag = function (tag) {
            return offMeshNodes
                .find(elem =>
                    elem &&
                    elem.userData &&
                    elem.userData.thing &&
                    elem.userData.thing.tags &&
                    elem.userData.thing.tags.indexOf(tag) > -1
                ) || null;
        };

        // Utility to check if node is part of a chain
        var isInChain = function (o3d) {
            if (!o3d) return false;
            if (!o3d.userData) return false;
            return o3d.userData.inChain != undefined && o3d.userData.inChain == true;
        };

        // Create chains of leap/arc/landing nodes
        let chains = [];
        let leapSpots = offMeshNodes.filter(t => t.userData.thing.tags && t.userData.thing.tags[0] > 0 && t.userData.thing.type == 16006 && t.userData.thing.args[0] !== 0);

        leapSpots.forEach(leapSpot => {
            var arcSpot = getOMNodeByUDMFTag(leapSpot.userData.thing.args[0]);
            if (arcSpot && arcSpot.userData.thing.args[0] !== 0 && !isInChain(arcSpot)) {
                var landingSpot = getOMNodeByUDMFTag(arcSpot.userData.thing.args[0]);
                if (landingSpot && !isInChain(landingSpot)) {
                    leapSpot.userData.inChain = true;
                    arcSpot.userData.inChain = true;
                    landingSpot.userData.inChain = true;
                    let chain = { leapSpot, arcSpot, landingSpot };
                    chains.push(chain);
                }
            }
        });

        // Collect nodes in chains
        let altNodes = [];
        let groundedNodes = [];
        chains.forEach(chain => {
            altNodes.push(chain.leapSpot, chain.arcSpot, chain.landingSpot);
            groundedNodes.push(chain.leapSpot, chain.landingSpot);
        });

        // Helper functions to find shared portals
        var portalsAreTheSame = function (portal1, portal2) {
            if (portal1[0] == portal2[0] && portal1[1] == portal2[1]) return true;
            if (portal1[0] == portal2[1] && portal1[1] == portal2[0]) return true;
            return false;
        };

        var findSharedPortals = function (polya, polyb) {
            if (!polya || !polyb) return;
            if (polya.index == polyb.index) return;
            if (polya.neighborIDs.indexOf(polyb.index) > -1) return;
            if (polyb.neighborIDs.indexOf(polya.index) > -1) return;

            for (var i = 0; i < polya.edges.length; i++) {
                var candidate1 = polya.edges[i];
                var sharedIndex = polyb.edges.findIndex(edge => portalsAreTheSame(edge, candidate1));

                if (sharedIndex > -1) {
                    // Link neighbor polygons
                    polya.neighborIDs.push(polyb.index);
                    polyb.neighborIDs.push(polya.index);

                    polya.connections.push(polyb.index);
                    polyb.connections.push(polya.index);

                    polya.portals.push(candidate1);
                    polyb.portals.push(polyb.edges[sharedIndex]);

                    return;
                }
            }
        };

        // Compute centroids for each polygon
        let centroids = [];
        polys.forEach(polygon => {
            let box = new THREE.Box3();
            let points2 = [];

            polygon.vertices.forEach(vert => {
                box.expandByPoint(vert);
                let pt2 = { x: vert.x, y: vert.z };
                points2.push(pt2);
            });

            let center = new THREE.Vector3();
            let center2 = centroid(points2);
            box.getCenter(center);
            center.set(center2.x, center.y, center2.y);
            centroids.push(center);
        });

        /* Build altagon objects and edges */
        polys.forEach((poly, polyindex) => {
            let altagonbox = new THREE.Box3();
            let altagon = _.cloneDeep(altagonTemplate);
            altagon.index = polyindex;
            altagon.centroid = centroids[polyindex];

            poly.vertices.forEach((vert, ind) => {
                let vertex3 = new THREE.Vector3().copy(vert);
                altagonbox.expandByPoint(vertex3);

                let vertIndex = altVerts.findIndex(v3 => vertex3.distanceToSquared(v3) < 0.00001);

                if (vertIndex < 0) {
                    altVerts.push(vertex3);
                    vertIndex = altVerts.indexOf(vertex3);
                }
                altagon.vertices.push(vertIndex);
            });

            altPolys.push(altagon);
        });

        /* Find polygon edges */
        altPolys.forEach(polygon => {
            if (polygon) {
                polygon.vertices.forEach((vert, vertindex) => {
                    let nextVert = (vertindex + 1 >= polygon.vertices.length) ? polygon.vertices[0] : polygon.vertices[vertindex + 1];
                    let portal = [vert, nextVert];
                    polygon.edges.push(portal);
                });
            }
        });

        /* Find shared edges between polygons */
        altPolys.forEach(polyA => {
            altPolys.forEach(polyB => {
                findSharedPortals(polyA, polyB);
            });
        });

        /* Associate grounded off-mesh nodes with polygons */
        altPolys.forEach(poly => {
            let verts = poly.vertices.map(id => altVerts[id].clone().multiplyScalar(64));

            groundedNodes.forEach((node, nodeInd) => {
                var inPoly = PathUtils.isVectorInPolygon(node.position, verts);
                if (inPoly) {
                    console.log(`node ${nodeInd} is in polygon ${poly.index}`);
                    node.userData.hasPolygon = true;
                    poly.hasNode = true;
                    node.userData.poly = poly;
                }
            });
        });

        /* Assign any leftover grounded nodes to closest polygons */
        groundedNodes.forEach(spot => {
            if (!spot.userData.hasPolygon) {
                var closestPoly;
                var closestDistance = Infinity;
                var closestDistanceToCenter = Infinity;
                altPolys.forEach(poly => {
                    let c3 = poly.centroid.clone().multiplyScalar(64);
                    let dist = spot.position.distanceToSquared(c3);
                    if (dist <= closestDistanceToCenter) {
                        closestDistanceToCenter = dist;
                        let verts = poly.vertices.map(id => altVerts[id].clone().multiplyScalar(64));
                        verts.forEach(v3 => {
                            dist = spot.position.distanceToSquared(v3);
                            if (dist < closestDistance) {
                                closestPoly = poly;
                                closestDistance = dist;
                            }
                        });
                    }
                });

                spot.userData.poly = closestPoly;
                closestPoly.hasNode = true;
            }
        });

        /* Build alternative nodes for leap/arc/landing chains */
        chains.forEach(chain => {
            let { arcSpot, leapSpot, landingSpot } = chain;

            let polyStart = leapSpot.userData.poly;
            let polyEnd = landingSpot.userData.poly;

            let arcNode = _.cloneDeep(altagonTemplate);
            let leapNode = _.cloneDeep(altagonTemplate);
            let landingNode = _.cloneDeep(altagonTemplate);

            // Flag nodes
            leapNode.flags |= FLAGS.NAV_LEAP;
            arcNode.flags |= FLAGS.NAV_ARC;
            landingNode.flags |= FLAGS.NAV_LAND;

            // Assign helper values
            leapNode.helper = leapSpot.userData.thing.tags[0];
            arcNode.helper = arcSpot.userData.thing.tags[0];
            landingNode.helper = landingSpot.userData.thing.tags[0];

            // Positions scaled down
            let arcPos = arcSpot.position.clone().multiplyScalar(1 / 64);
            let leapPos = leapSpot.position.clone().multiplyScalar(1 / 64);
            let landingPos = landingSpot.position.clone().multiplyScalar(1 / 64);

            altVerts.push(arcPos, leapPos, landingPos);

            let leapPosIndex = altVerts.indexOf(leapPos);
            let arcPosIndex = altVerts.indexOf(arcPos);
            let landingPosIndex = altVerts.indexOf(landingPos);

            leapNode.centroid = leapPos.clone();
            arcNode.centroid = arcPos.clone();
            landingNode.centroid = landingPos.clone();

            altPolys.push(leapNode, arcNode, landingNode);

            let leapPolyIndex = altPolys.indexOf(leapNode);
            let arcPolyIndex = altPolys.indexOf(arcNode);
            let landingPolyIndex = altPolys.indexOf(landingNode);

            leapNode.index = leapPolyIndex;
            arcNode.index = arcPolyIndex;
            landingNode.index = landingPolyIndex;

            // Connect nodes with polygons
            polyStart.neighborIDs.push(leapNode.index);
            polyStart.connections.push(leapNode.index);
            polyStart.portals.push([leapPosIndex, leapPosIndex]);

            leapNode.connections.push(polyStart.index, arcPolyIndex);
            leapNode.neighborIDs.push(arcPolyIndex);
            leapNode.portals.push([leapPosIndex, leapPosIndex]);
            leapNode.vertices.push(leapPosIndex, leapPosIndex, leapPosIndex);

            arcNode.connections.push(leapNode.index, landingNode.index);
            arcNode.neighborIDs.push(landingNode.index);
            arcNode.portals.push([arcPosIndex, arcPosIndex]);
            arcNode.vertices.push(arcPosIndex, arcPosIndex, arcPosIndex);

            landingNode.connections.push(polyEnd.index, arcNode.index);
            landingNode.neighborIDs.push(polyEnd.index);
            landingNode.portals.push([landingPosIndex, landingPosIndex]);
            landingNode.vertices.push(landingPosIndex, landingPosIndex, landingPosIndex);

            polyEnd.connections.push(landingNode.index);
        });

        // Assign groups to polygons using flood fill
        var groups = [];
        var group = [];
        var openList = [];
        var closedList = [];
        openList.push(altPolys[0]);

        var overflow = 0;
        while (closedList.length != altPolys.length) {
            var CurPoly = openList.pop();
            overflow++;
            if (overflow > 1000000) {
                console.log(' script ranaway ');
                break;
            }

            if (CurPoly.hasGroup) continue;

            CurPoly.hasGroup = true;
            group.push(CurPoly);
            closedList.push(CurPoly);

            let neighbors = CurPoly.connections.map(neighborID => altPolys[neighborID]).filter(neighbor => !neighbor.hasGroup);

            neighbors.forEach(neighbor => {
                if (openList.indexOf(neighbor) < 0) {
                    openList.push(neighbor);
                }
            });

            if (!openList.length) {
                groups.push(group);
                group = [];

                let NextPolyIndex = altPolys.findIndex(p => p !== null && p.hasGroup == false);
                if (NextPolyIndex > -1) openList.push(altPolys[NextPolyIndex]);
                else break;
            }
        }

        // Final cleanup of alt polygons
        groups.forEach((group, grpIndex) => {
            group.forEach((poly, polyindex) => {
                poly.groupID = grpIndex;
                poly.vertexIds = poly.vertices;
                poly.neighbours = poly.neighborIDs;
                poly.id = polyindex;
                delete poly.edges;
                delete poly.hasGroup;
                delete poly.index;
                delete poly.vertices;
            });
        });

        groups.forEach((group, grpIndex) => {
            group.forEach((poly, polyindex) => {
                poly.neighbours = poly.neighbours.map(neighborID => altPolys[neighborID].id);
            });
        });

        let ret = {
            vertices: altVerts,
            groups: groups
        };

        console.log('altNodes: ', altNodes.length);
        return { alt: ret, offMeshNodes: altNodes };
    }

    /**
     * Create a box grid map of the scene for visualization
     */
    static CreateBoxMap(scene) {
        let gridOBJ = new THREE.Object3D();
        gridOBJ.name = 'griddler';
        let grid = {
            origin: null,
            columns: 0,
            rows: 0,
            cells: []
        };

        let gridbox = new THREE.Box3().setFromObject(scene);
        var gridsize = new THREE.Vector3();
        var gridcenter = new THREE.Vector3();

        gridbox.getSize(gridsize);
        gridbox.getCenter(gridcenter);

        let scalefactor = 256 / MAPSCALEINV;

        gridsize.x = (Math.floor(gridsize.x / scalefactor) * scalefactor) + (scalefactor * 4);
        gridsize.z = (Math.floor(gridsize.z / scalefactor) * scalefactor) + (scalefactor * 4);

        gridcenter.x = (Math.floor(gridcenter.x / scalefactor) * scalefactor) + (scalefactor * 2);
        gridcenter.z = (Math.floor(gridcenter.z / scalefactor) * scalefactor) + (scalefactor * 2);

        let maxy = gridbox.max.y;
        let cellht = (Math.floor(maxy / scalefactor) * scalefactor) + (scalefactor * 2);

        gridbox.setFromCenterAndSize(gridcenter, gridsize);

        grid.origin = gridcenter;

        grid.columns = gridsize.x / scalefactor;
        grid.rows = gridsize.z / scalefactor;

        let mincolor = Color.rgb({ r: 255.0, g: 0, b: 0 });
        let maxcolor = Color.rgb({ r: 0, g: 0, b: 255.0 });

        let maxIndices = grid.columns * grid.rows;
        let colorStep = 1 / maxIndices;
        var alpha = 0;

        var x, z;
        var cellsize = new THREE.Vector3(scalefactor, cellht, scalefactor);

        for (x = gridbox.min.x; x < gridbox.max.x; x += scalefactor) {
            for (z = gridbox.min.z; z < gridbox.max.z; z += scalefactor) {
                let cellCenter = new THREE.Vector3(x, 0, z);
                let cellbox = new THREE.Box3().setFromCenterAndSize(cellCenter, cellsize);

                let previewColor = new Color(mincolor).mix(maxcolor, alpha);
                let indexColor = new THREE.Color(previewColor.rgbNumber());

                let cellhelper = new THREE.Box3Helper(cellbox, indexColor);

                cellhelper.userData.box =
                {
                    color: previewColor.rgbNumber(),
                    center: _.toPlainObject(cellCenter),
                    size: _.toPlainObject(cellsize)
                };

                grid.cells.push(cellbox);
                gridOBJ.add(cellhelper);
                alpha += colorStep;
            }
        }

        return { grid, gridOBJ };
    }

}

module.exports = NavMesher;

