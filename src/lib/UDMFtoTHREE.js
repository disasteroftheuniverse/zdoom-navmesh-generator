//jshint esversion: 8
let _three = require('three');
_three.OBJExporter = require('./../three/OBJExport');
_three.OBJLoader = require('./../three/OBJLoader');
_three.BufferGeometryUtils = require('./../three/BufferUtils');

const THREE = _three;
const { MAPSCALE } = require ('./../config');

//const path = require('path');
//const fs = require('fs');
const ZShapes = require('./ZShapes');
const Color = require('color');
const _ = require('lodash');

function navThingFilter ( thing )
{
	return thing.type >= 16006 && thing.type <= 16013;
}


class UDMFtoTHREE
{
	static wallToBufferGeometry(wall)
	{
		const vertices = wall.map( vert=> vert.toArray() ).flat();

		var geometry = new THREE.BufferGeometry();

		geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( vertices, 3 ) );
		
		return geometry;
	}

	static getBufferGeometryFromWalls(walls) 
	{
		return walls.map( UDMFtoTHREE.wallToBufferGeometry );
	}


	static makeScene( udmf )
	{
		//set up THREE.JS scene
		var scene = new THREE.Scene();
		var obj = new THREE.Object3D();

		scene.add(obj);

		//0xbab49e

		let sectorMTL = new THREE.MeshBasicMaterial ( 
			{ color: 0x110022, side: THREE.DoubleSide } 
		);

		let wallMTL = new THREE.MeshBasicMaterial ( 
			{ color: 0x110022, side: THREE.FrontSide } 
		);


		let DarkColor = new THREE.Color().fromArray(Color(0x000000).darken(0.3).rgb().color.map( val => val / 255 )  );

		//console.log( DarkColor) );

		let darkmtl = new THREE.MeshBasicMaterial ( 
			{ color: DarkColor, side: THREE.DoubleSide } 
		);

		let geometries = [];

		let floorplanes = ZShapes.create(udmf);
		let floorTris = floorplanes.getTrianglesBy( fp => !fp.isFree && !fp.is3DFloor && !fp.isModel && !fp.model.user_nocast );
		let steps = floorplanes.getSteps();
		let stepTris = steps.triangles;

		// sectors as geometry
		floorTris.forEach( function(triangles) {
			let vertices = triangles.map( v => v.clone().setZ(v.z * -1 ).toArray()).flat();
			var geometry = new THREE.BufferGeometry();
			geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( vertices, 3 ) );
			geometries.push(geometry);
		});

		// walkable steps as geometry
		stepTris.forEach( function(triangles) {
			let vertices = triangles.map( v => v.clone().toArray() ).flat();
			var geometry = new THREE.BufferGeometry();
			geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( vertices, 3 ) );

			let box = new THREE.Box3().setFromBufferAttribute( geometry.getAttribute('position') );
			var size = new THREE.Vector3();
			box.getSize(size);

			if ( size.y <= 24 )
			{
				geometries.push(geometry);
			}
		});

		let mergedgeometries = THREE.BufferGeometryUtils.mergeBufferGeometries(geometries);
		mergedgeometries = THREE.BufferGeometryUtils.mergeVertices(mergedgeometries);

		var mesh = new THREE.Mesh( mergedgeometries, sectorMTL );
		mesh.name = 'floors';
		obj.add(mesh);

		/* 3d Floors */

		let floorTris3D = floorplanes.getTrianglesBy(fp => fp.is3DFloor && !fp.model.user_nocast );
		let geometry3D = [];

		floorTris3D.forEach( function(triangles) {
			let vertices = triangles.map( v => v.clone().setZ(v.z * -1 ).toArray()).flat();
			var geometry = new THREE.BufferGeometry();
			geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( vertices, 3 ) );
			geometry3D.push(geometry);
		}); 

		let wallTris3D = steps.triangles3D;

		wallTris3D.forEach( function(triangles) {
			let vertices = triangles.map( v => v.clone().toArray()).flat();
			var geometry = new THREE.BufferGeometry();
			geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( vertices, 3 ) );
			geometry3D.push(geometry);
		}); 

		if (geometry3D.length)
		{
			let mergedgeometries3D = THREE.BufferGeometryUtils.mergeBufferGeometries(geometry3D);
			mergedgeometries3D = THREE.BufferGeometryUtils.mergeVertices(mergedgeometries3D);
			var mesh3D = new THREE.Mesh( mergedgeometries3D, sectorMTL );
			obj.add(mesh3D);
		}
		//end 


		// preview scene
		var scenePreview = new THREE.Scene();
		var previewObj = new THREE.Object3D();
		scenePreview.add(previewObj);

		let previewGeometries = [];

		let floorTrisPreview = floorplanes.getTrianglesBy( fp => !fp.isFree && !fp.is3DFloor && !fp.isModel && !fp.model.user_nocast );

		floorTrisPreview.forEach( function(triangles) {
			let vertices = triangles.map( v => v.clone().setZ(v.z * -1 ).toArray()).flat();
			var geometry = new THREE.BufferGeometry();
			geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( vertices, 3 ) );
			previewGeometries.push(geometry);
		});


		let previewGeometriesDark = [];
		let floorTrisPreviewDark = floorplanes.getTrianglesBy( fp => !fp.isFree && !fp.is3DFloor && !fp.isModel && fp.model.user_nocast );

		if (floorTrisPreviewDark.length)
		{
			floorTrisPreviewDark.forEach( function(triangles) {
				let vertices = triangles.map( v => v.clone().setZ(v.z * -1 ).toArray()).flat();
				var geometry = new THREE.BufferGeometry();
				geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( vertices, 3 ) );
				previewGeometriesDark.push(geometry);
			});
	
	
			let mergedGeometriesPreviewDark = THREE.BufferGeometryUtils.mergeBufferGeometries(previewGeometriesDark);
			mergedGeometriesPreviewDark = THREE.BufferGeometryUtils.mergeVertices(mergedGeometriesPreviewDark, 0.001);
			var previewMeshDark = new THREE.Mesh( mergedGeometriesPreviewDark, darkmtl );
			previewMeshDark.name = 'floors';
			previewObj.add(previewMeshDark);
		}

		stepTris.forEach( function(triangles) {
			let vertices = triangles.map( v => v.clone().toArray() ).flat();
			var geometry = new THREE.BufferGeometry();
			geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( vertices, 3 ) );
			let box = new THREE.Box3().setFromBufferAttribute( geometry.getAttribute('position') );
			var size = new THREE.Vector3();
			box.getSize(size);
			if ( size.y <= 24 )
			{
				geometry.name = 'step';
			} else {
				geometry.name = 'tall';
			}
			previewGeometries.push(geometry);
		});

		let previewWallTris = steps.triangles2;
		let previewWalls = [];

		previewWallTris.forEach( function(triangles) {
			let vertices = triangles.map( v => v.clone().toArray() ).flat();
			var geometry = new THREE.BufferGeometry();
			geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( vertices, 3 ) );
			geometry.name = 'walls.preview';
			let mergedWalls = THREE.BufferGeometryUtils.mergeVertices( geometry );
			previewWalls.push( mergedWalls );
		});

		let wallPreview = new THREE.Object3D();
		wallPreview.name = 'walls.preview';

		let wallsSolid = new THREE.Object3D();
		wallsSolid.name = 'walls.solid';

		if (previewWalls.length)
		{
			let mergedgeometries3DPreview = THREE.BufferGeometryUtils.mergeBufferGeometries( previewWalls );
			mergedgeometries3DPreview = THREE.BufferGeometryUtils.mergeVertices( mergedgeometries3DPreview );


			var mesh3DPreview = new THREE.Mesh( mergedgeometries3DPreview, wallMTL );
			mesh3DPreview.name = 'walls.preview';
			wallPreview.add(mesh3DPreview);
			previewWalls.forEach ( wall => {
				var meshSolid = new THREE.Mesh( wall, wallMTL );
				wallsSolid.add( meshSolid );
			});
		}

		previewObj.add( wallPreview );

		let mergedGeometriesPreview = THREE.BufferGeometryUtils.mergeBufferGeometries(previewGeometries);
		mergedGeometriesPreview = THREE.BufferGeometryUtils.mergeVertices(mergedGeometriesPreview, 0.001);
		var previewMesh = new THREE.Mesh( mergedGeometriesPreview, sectorMTL );
		previewMesh.name = 'floors';
		previewObj.add(previewMesh);

		let floorTris3DPreview = floorplanes.getTrianglesBy(fp => fp.is3DFloor );
		let geometry3DPreview = [];

		floorTris3DPreview.forEach( function(triangles) {
			let vertices = triangles.map( v => v.clone().setZ(v.z * -1 ).toArray()).flat();
			var geometry = new THREE.BufferGeometry();
			geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( vertices, 3 ) );
			geometry3DPreview.push(geometry);
		}); 

		wallTris3D.forEach( function(triangles) {
			let vertices = triangles.map( v => v.clone().toArray()).flat();
			var geometry = new THREE.BufferGeometry();
			geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( vertices, 3 ) );
			geometry3DPreview.push(geometry);
		}); 

		if (geometry3DPreview.length)
		{
			let mergedgeometries3DPreview = THREE.BufferGeometryUtils.mergeBufferGeometries(geometry3DPreview);
			mergedgeometries3DPreview = THREE.BufferGeometryUtils.mergeVertices(mergedgeometries3DPreview);
			var mesh3DPreview = new THREE.Mesh( mergedgeometries3DPreview, sectorMTL );
			mesh3DPreview.name = 'sectors3D';
			previewObj.add(mesh3DPreview);
		}

		// things preview
		if ( udmf.things )
		{
			let nodeVis = new THREE.Object3D();
			nodeVis.name = 'nav.nodes';

			let nodeMTL = new THREE.MeshBasicMaterial ( 
				{ color: 0xFF00AA, side: THREE.DoubleSide } 
			);

			let visibleNodes = udmf.things.filter ( navThingFilter ).map( thing => {
				let flatthing = _.clone(_.toPlainObject(thing));
				if ( flatthing.tagGroups ) delete flatthing.tagGroups;
				return flatthing;
			});

			

			visibleNodes.forEach( thing => {
				var candidates = [];

				floorplanes.floorplanes.forEach( floorplane => {
					var result = floorplane.hasThing ( thing );

					if ( result.hasThing )
					{
						let z = floorplane.getZAtPoint( thing.v );
						if (thing.height) z+=thing.height;

						thing.z = z;
						let offMeshNode = new THREE.Object3D();
						offMeshNode.userData.thing = thing;
						offMeshNode.name = 'navnode';
						offMeshNode.position.set ( thing.v.x, z, -thing.v.y );
						candidates.push(offMeshNode);
						//nodeVis.add( nodeMesh );
						//nodeMesh.position.set ( thing.v.x, z, -thing.v.y );*/
					}

				});

				var candidate = candidates.sort( (a, b) => a.position.y - b.position.y).shift();
				nodeVis.add(candidate);
			});

			previewObj.add( nodeVis );
			obj.add( nodeVis.clone() );
		}

		obj.scale.set(MAPSCALE, MAPSCALE, MAPSCALE);
		obj.updateMatrix();
		scene.updateMatrixWorld(true);

		previewObj.scale.set(MAPSCALE, MAPSCALE, MAPSCALE);
		previewObj.updateMatrix();
		scenePreview.updateMatrixWorld(true);

		return { navScene: scene, scenePreview: scenePreview };
	}

	static getOBJ (scene)
	{
		let exporter = new THREE.OBJExporter();
		let OBJData = exporter.parse(scene);

		return OBJData;
	}

	static createModelFromUDMF (udmf)
	{
		let scenes = UDMFtoTHREE.makeScene ( udmf );
		let scene = scenes.navScene;
		let scenePreview = scenes.scenePreview;

		let OBJData = UDMFtoTHREE.getOBJ(scene);
		return { OBJData, scenePreview };
	}

	static createModelFromUDMFXXX (udmf)
	{
		//let objfile = Buffer.from(OBJData);
		//fs.writeFileSync(TEST_LEVEL_PATH, objfile, {encoding: 'utf-8'});


		let previewScene = new THREE.Scene(); //.clone(scene);
		previewScene.add(obj);

		previewScene.updateMatrixWorld(true);
		previewScene.updateMatrix();

		let box = new THREE.Box3().setFromObject(previewScene);
		var center = new THREE.Vector3();
		box.getCenter( center );
		//previewScene.position.sub( center );
		
		previewScene.updateMatrixWorld(true);
		previewScene.updateMatrix();

		let helper = new THREE.Box3Helper(box, 0x00FF00);
		helper.visible = true;
		previewScene.add(helper);
		

		let jsonfile = Buffer.from( JSON.stringify(previewScene.toJSON()) );
		//fs.writeFileSync(TEST_JSON_PATH, jsonfile, {encoding: 'utf-8'});
	
		return OBJData;
	}
}


module.exports = UDMFtoTHREE;

/*
		//create triangulated geometry from sectors
		/*zsectors.forEach( function(zsector) {
			zsector.positions.forEach(shape=>{
				var vertices = [];

				shape.forEach( (vert) => {
					let vert3 =  new THREE.Vector3(vert.x, zsector.sector.heightfloor, vert.y);
					vertices.push(vert3);
				});

				vertices = vertices.reverse().map( v => v.toArray()).flat();
				var geometry = new THREE.BufferGeometry();
				geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( vertices, 3 ) );
				geometries.push(geometry);
			});
		});
		
*/