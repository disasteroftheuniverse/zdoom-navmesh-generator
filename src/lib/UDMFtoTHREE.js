// jshint esversion: 8

// Load THREE.js core and custom extensions for OBJ export/import and geometry utilities
let _three = require('three');
_three.OBJExporter = require('./../three/OBJExport');
_three.OBJLoader = require('./../three/OBJLoader');
_three.BufferGeometryUtils = require('./../three/BufferUtils');

const THREE = _three;
const { MAPSCALE } = require ('./../config');

const ZShapes = require('./ZShapes'); // UDMF-to-geometry utilities
const Color = require('color');        // Color manipulation library
const _ = require('lodash');           // General utility library

// Filter navigation-related "things" by type for navmesh placement
function navThingFilter ( thing ) {
	return thing.type >= 16006 && thing.type <= 16013;
}

class UDMFtoTHREE {

	// Converts a wall polygon (array of vertices) into a BufferGeometry
	static wallToBufferGeometry(wall) {
		const vertices = wall.map( vert => vert.toArray() ).flat();
		var geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
		return geometry;
	}

	// Converts an array of walls into BufferGeometry objects
	static getBufferGeometryFromWalls(walls) {
		return walls.map(UDMFtoTHREE.wallToBufferGeometry);
	}

	// Generate a THREE.js scene from UDMF data including floors, steps, walls, and nav nodes
	static makeScene(udmf) {

		// Main scene container and root object
		var scene = new THREE.Scene();
		var obj = new THREE.Object3D();
		scene.add(obj);

		// Materials for floors and walls
		let sectorMTL = new THREE.MeshBasicMaterial({ color: 0x110022, side: THREE.DoubleSide });
		let wallMTL   = new THREE.MeshBasicMaterial({ color: 0x110022, side: THREE.FrontSide });

		// Dark material for nocast areas (preview)
		let DarkColor = new THREE.Color().fromArray(
			Color(0x000000).darken(0.3).rgb().color.map(val => val / 255)
		);
		let darkmtl = new THREE.MeshBasicMaterial({ color: DarkColor, side: THREE.DoubleSide });

		let geometries = [];

		// Generate floor geometry from UDMF data
		let floorplanes = ZShapes.create(udmf);
		let floorTris   = floorplanes.getTrianglesBy(fp => !fp.isFree && !fp.is3DFloor && !fp.isModel && !fp.model.user_nocast);
		let steps       = floorplanes.getSteps();
		let stepTris    = steps.triangles;

		// Convert each floor triangle set into BufferGeometry
		floorTris.forEach(triangles => {
			let vertices = triangles.map(v => v.clone().setZ(v.z * -1).toArray()).flat();
			var geometry = new THREE.BufferGeometry();
			geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
			geometries.push(geometry);
		});

		// Convert steps to geometry if walkable (small height)
		stepTris.forEach(triangles => {
			let vertices = triangles.map(v => v.clone().toArray()).flat();
			var geometry = new THREE.BufferGeometry();
			geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

			let box = new THREE.Box3().setFromBufferAttribute(geometry.getAttribute('position'));
			var size = new THREE.Vector3();
			box.getSize(size);

			if (size.y <= 24) geometries.push(geometry);
		});

		// Merge all floor/step geometries into a single mesh for efficiency
		let mergedgeometries = THREE.BufferGeometryUtils.mergeBufferGeometries(geometries);
		mergedgeometries = THREE.BufferGeometryUtils.mergeVertices(mergedgeometries);

		var mesh = new THREE.Mesh(mergedgeometries, sectorMTL);
		mesh.name = 'floors';
		obj.add(mesh);

		/* 3D floors and walls */

		let floorTris3D = floorplanes.getTrianglesBy(fp => fp.is3DFloor && !fp.model.user_nocast);
		let geometry3D = [];

		// Add 3D floors
		floorTris3D.forEach(triangles => {
			let vertices = triangles.map(v => v.clone().setZ(v.z * -1).toArray()).flat();
			var geometry = new THREE.BufferGeometry();
			geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
			geometry3D.push(geometry);
		});

		// Add 3D walls
		let wallTris3D = steps.triangles3D;
		wallTris3D.forEach(triangles => {
			let vertices = triangles.map(v => v.clone().toArray()).flat();
			var geometry = new THREE.BufferGeometry();
			geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
			geometry3D.push(geometry);
		});

		// Merge all 3D floor and wall geometries
		if (geometry3D.length) {
			let mergedgeometries3D = THREE.BufferGeometryUtils.mergeBufferGeometries(geometry3D);
			mergedgeometries3D = THREE.BufferGeometryUtils.mergeVertices(mergedgeometries3D);
			var mesh3D = new THREE.Mesh(mergedgeometries3D, sectorMTL);
			obj.add(mesh3D);
		}

		/* Preview scene for visualization */
		var scenePreview = new THREE.Scene();
		var previewObj = new THREE.Object3D();
		scenePreview.add(previewObj);

		let previewGeometries = [];

		// Add floor triangles to preview
		let floorTrisPreview = floorplanes.getTrianglesBy(fp => !fp.isFree && !fp.is3DFloor && !fp.isModel && !fp.model.user_nocast);
		floorTrisPreview.forEach(triangles => {
			let vertices = triangles.map(v => v.clone().setZ(v.z * -1).toArray()).flat();
			var geometry = new THREE.BufferGeometry();
			geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
			previewGeometries.push(geometry);
		});

		// Add darkened preview areas for nocast floors
		let previewGeometriesDark = [];
		let floorTrisPreviewDark = floorplanes.getTrianglesBy(fp => !fp.isFree && !fp.is3DFloor && !fp.isModel && fp.model.user_nocast);
		if (floorTrisPreviewDark.length) {
			floorTrisPreviewDark.forEach(triangles => {
				let vertices = triangles.map(v => v.clone().setZ(v.z * -1).toArray()).flat();
				var geometry = new THREE.BufferGeometry();
				geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
				previewGeometriesDark.push(geometry);
			});
			let mergedDark = THREE.BufferGeometryUtils.mergeBufferGeometries(previewGeometriesDark);
			mergedDark = THREE.BufferGeometryUtils.mergeVertices(mergedDark, 0.001);
			var previewMeshDark = new THREE.Mesh(mergedDark, darkmtl);
			previewMeshDark.name = 'floors';
			previewObj.add(previewMeshDark);
		}

		// Add step previews, mark tall steps separately
		stepTris.forEach(triangles => {
			let vertices = triangles.map(v => v.clone().toArray()).flat();
			var geometry = new THREE.BufferGeometry();
			geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

			let box = new THREE.Box3().setFromBufferAttribute(geometry.getAttribute('position'));
			var size = new THREE.Vector3();
			box.getSize(size);
			geometry.name = (size.y <= 24) ? 'step' : 'tall';
			previewGeometries.push(geometry);
		});

		// Add walls to preview
		let previewWallTris = steps.triangles2;
		let previewWalls = [];
		previewWallTris.forEach(triangles => {
			let vertices = triangles.map(v => v.clone().toArray()).flat();
			var geometry = new THREE.BufferGeometry();
			geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
			geometry.name = 'walls.preview';
			let mergedWalls = THREE.BufferGeometryUtils.mergeVertices(geometry);
			previewWalls.push(mergedWalls);
		});

		// Build preview wall objects
		let wallPreview = new THREE.Object3D();
		wallPreview.name = 'walls.preview';
		let wallsSolid = new THREE.Object3D();
		wallsSolid.name = 'walls.solid';

		if (previewWalls.length) {
			let mergedPreview = THREE.BufferGeometryUtils.mergeBufferGeometries(previewWalls);
			mergedPreview = THREE.BufferGeometryUtils.mergeVertices(mergedPreview);

			var mesh3DPreview = new THREE.Mesh(mergedPreview, wallMTL);
			mesh3DPreview.name = 'walls.preview';
			wallPreview.add(mesh3DPreview);

			previewWalls.forEach(wall => {
				var meshSolid = new THREE.Mesh(wall, wallMTL);
				wallsSolid.add(meshSolid);
			});
		}

		previewObj.add(wallPreview);
		obj.add(wallPreview.clone());

		// Merge all preview floor geometry
		let mergedPreviewFloors = THREE.BufferGeometryUtils.mergeBufferGeometries(previewGeometries);
		mergedPreviewFloors = THREE.BufferGeometryUtils.mergeVertices(mergedPreviewFloors, 0.001);
		var previewMesh = new THREE.Mesh(mergedPreviewFloors, sectorMTL);
		previewMesh.name = 'floors';
		previewObj.add(previewMesh);

		// Add 3D floors to preview
		let floorTris3DPreview = floorplanes.getTrianglesBy(fp => fp.is3DFloor);
		let geometry3DPreview = [];
		floorTris3DPreview.forEach(triangles => {
			let vertices = triangles.map(v => v.clone().setZ(v.z * -1).toArray()).flat();
			var geometry = new THREE.BufferGeometry();
			geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
			geometry3DPreview.push(geometry);
		});
		wallTris3D.forEach(triangles => {
			let vertices = triangles.map(v => v.clone().toArray()).flat();
			var geometry = new THREE.BufferGeometry();
			geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
			geometry3DPreview.push(geometry);
		});
		if (geometry3DPreview.length) {
			let merged3DPrev = THREE.BufferGeometryUtils.mergeBufferGeometries(geometry3DPreview);
			merged3DPrev = THREE.BufferGeometryUtils.mergeVertices(merged3DPrev);
			var mesh3DPreview = new THREE.Mesh(merged3DPrev, sectorMTL);
			mesh3DPreview.name = 'sectors3D';
			previewObj.add(mesh3DPreview);
		}

		// Add navigation nodes for preview
		if (udmf.things) {
			let nodeVis = new THREE.Object3D();
			nodeVis.name = 'nav.nodes';

			let nodeMTL = new THREE.MeshBasicMaterial({ color: 0xFF00AA, side: THREE.DoubleSide });

			let visibleNodes = udmf.things.filter(navThingFilter).map(thing => {
				let flat = _.clone(_.toPlainObject(thing));
				if (flat.tagGroups) delete flat.tagGroups;
				return flat;
			});

			// Place nav nodes on floor surfaces
			visibleNodes.forEach(thing => {
				var candidates = [];
				floorplanes.floorplanes.forEach(floorplane => {
					var result = floorplane.hasThing(thing);
					if (result.hasThing) {
						let z = floorplane.getZAtPoint(thing.v);
						if (thing.height) z += thing.height;
						thing.z = z;
						let offMeshNode = new THREE.Object3D();
						offMeshNode.userData.thing = thing;
						offMeshNode.name = 'navnode';
						offMeshNode.position.set(thing.v.x, z, -thing.v.y);
						candidates.push(offMeshNode);
					}
				});
				var candidate = candidates.sort((a, b) => a.position.y - b.position.y).shift();
				nodeVis.add(candidate);
			});

			previewObj.add(nodeVis);
			obj.add(nodeVis.clone());
		}

		// Apply global map scale to scene and preview
		obj.scale.set(MAPSCALE, MAPSCALE, MAPSCALE);
		obj.updateMatrix();
		scene.updateMatrixWorld(true);

		previewObj.scale.set(MAPSCALE, MAPSCALE, MAPSCALE);
		previewObj.updateMatrix();
		scenePreview.updateMatrixWorld(true);

		return { navScene: scene, scenePreview: scenePreview };
	}

	// Export a THREE.js scene to OBJ format
	static getOBJ(scene) {
		let exporter = new THREE.OBJExporter();
		let OBJData = exporter.parse(scene);
		return OBJData;
	}

	// Build OBJ and preview scene from UDMF
	static createModelFromUDMF(udmf) {
		let scenes = UDMFtoTHREE.makeScene(udmf);
		let scene = scenes.navScene;
		let scenePreview = scenes.scenePreview;

		let OBJData = UDMFtoTHREE.getOBJ(scene);
		return { OBJData, scenePreview };
	}

	// Legacy preview method (unused)
	static createModelFromUDMFXXX(udmf) {
		let previewScene = new THREE.Scene();
		previewScene.add(obj);

		previewScene.updateMatrixWorld(true);
		previewScene.updateMatrix();

		let box = new THREE.Box3().setFromObject(previewScene);
		var center = new THREE.Vector3();
		box.getCenter(center);

		previewScene.updateMatrixWorld(true);
		previewScene.updateMatrix();

		let helper = new THREE.Box3Helper(box, 0x00FF00);
		helper.visible = true;
		previewScene.add(helper);

		let jsonfile = Buffer.from(JSON.stringify(previewScene.toJSON()));
		return OBJData;
	}
}

module.exports = UDMFtoTHREE;
