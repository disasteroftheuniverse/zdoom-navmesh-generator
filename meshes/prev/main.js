//let AFRAME = require('aframe');

import { GUI } from './dat.gui.module.js';

var lastLevel = localStorage.getItem('level');
//console.log(lastLevel);
if (!lastLevel)
{
    lastLevel = 'DEV01';
}

var availableLevels = {};
availableLevels[lastLevel] = lastLevel;


function getTemplate()
{
    var temp = {
        triangulation: "libtess",      //choose one of the above triangulation types
        options: {
            cellSize        : 0.25, 
            cellHeight      : 0.1 ,  
            agentHeight     : 1.0 , 
            agentRadius     : 0.5 , 
            agentMaxClimb   : 0.3 , 
            agentMaxSlope   : 40.0,  
            regionMinSize   : 12.0, 
            regionMergeSize : 32.0, 
            edgeMaxLen      : 16.0,
            edgeMaxError    : 2.5   
        },
        merge_distance    :   1.0,    
        solo            :   true
    };
}

function getModelScene()
{
    let modelEL = document.querySelector('#levelmesh');
    return modelEL.object3D;
}

var CONFIG;
var CURRENT_LEVEL;

function getLevelNames()
{
    var xmlHttp = new XMLHttpRequest();
    xmlHttp.open( "GET", `/wads`, false); // false for synchronous request
    xmlHttp.send( null );
    let levellist = JSON.parse(xmlHttp.responseText);
    if (levellist)
    {
        levellist.forEach( lvl => {
            availableLevels[lvl] = lvl;
        });
    }
}
getLevelNames();


let gui = new GUI();

gui.add ({ 'Shut Down Server' : function(){ 

    var xmlHttp = new XMLHttpRequest();
    xmlHttp.open("POST", `/shutdown`, false);
    xmlHttp.send( null );
    //console.log(xmlHttp.responseText);
        

}}, 'Shut Down Server');

function getLevel(levelname)
{
    //currentLevel = levelname;

    levelname = _.toUpper(levelname);
    CONFIG = null;
    CURRENT_LEVEL = null;

    let modelEL = document.querySelector('#levelmesh');
    
    if (modelEL.object3D.children)
    {
        modelEL.object3D.children.forEach ( child => {
            child.removeFromParent();
        });
    }

    var onload = function( responsetext )
    {
        let response = responsetext;
        let data = JSON.parse(response);

        if (data.error)
        {
            alert(' could not load the requested map');
            console.log(data.error);
            return;
        }
    
        CONFIG = data.config;
        CURRENT_LEVEL = levelname;
        localStorage.setItem( 'level', CURRENT_LEVEL);
        setConfig(CONFIG);


        var loader = new THREE.ObjectLoader();

        loader.parse(data.scene, (obj) => {
            
            let level = new THREE.Object3D();

            let levelSolid = obj.clone();
            levelSolid.name = 'level.solid';
            level.add(levelSolid);

            let levelEdges = new THREE.Object3D();

            levelEdges.name = 'level.edges';
            
            levelSolid.traverse( node => {
                if ( node.geometry );
                {
                    var edges = new THREE.EdgesGeometry( node.geometry );
                    var line = new THREE.LineSegments( edges, new 
                        THREE.LineBasicMaterial( { color: 0x5600DD, linewidth: 2 } ) ); 
                    levelEdges.add(line);
                }
            });

            levelEdges.scale.multiplyScalar( 1 / 64 );
            level.add(levelEdges);
            
            let triangleMTL = new THREE.MeshBasicMaterial( { 
                color: 0x5600DD, 
                side: THREE.DoubleSide, 
                wireframe: true, 
                wireframeLinewidth: 1,
                transparent: true,
                opacity: 0.05
            });

            let levelTriangulated = levelSolid.clone(true);
            levelTriangulated.name = 'level.triangles';

            levelTriangulated.traverse( node => {
                if (node.material)
                {
                    node.material = triangleMTL;
                    node.material.needsUpdate = true;
                }
            });

            levelTriangulated.visible = false;

            level.add(levelTriangulated);
            level.updateMatrixWorld(true);

            modelEL.setObject3D('level', level);
            let box = new THREE.Box3().setFromObject(level);
            var center = new THREE.Vector3();
            box.getCenter( center );
            level.position.sub( center );
            level.updateMatrixWorld(true);

            modelEL.emit('icons', {}, true);

        });
    };

    var xmlHttp = new XMLHttpRequest();
    xmlHttp.open( "GET", `/level?level=${levelname}`); // false for synchronous request
    xmlHttp.send( null );
    xmlHttp.onreadystatechange = function() {
        if (xmlHttp.readyState == XMLHttpRequest.DONE) {
            onload(xmlHttp.responseText);
        }
    };

    //return xmlHttp.responseText;
}


var levelFolder = gui.addFolder('Level');

var nameField = { 'Level Name': lastLevel };
var nameGUI = levelFolder.add(nameField, 'Level Name', availableLevels );


var loadLevelField = {'Load Level': 
    function() {
            //console.log(nameGUI.getValue());
            getLevel( nameGUI.getValue() );
    }
};
var loadLevelGUI = levelFolder.add(loadLevelField, 'Load Level');

levelFolder.add({'Clear Level' : function(){
    let modelEL = document.querySelector('#levelmesh');
    
    if (modelEL.object3D.children)
    {
        modelEL.object3D.children.forEach ( child => {
            child.removeFromParent();
        });
    }
}}, 'Clear Level');

levelFolder.closed = false;

var NavMeshFolder = gui.addFolder('Triangulation');

var RecastOpts = {
    'Mesh Type': 'solo',
    Triangulation: 'libtess',
    'Merge Distance' : 0.1,
    'Cell Size'        : 0.25,   // voxelization cell size
    'Cell Height'      : 0.1 ,   // voxelization cell height
    
    'Height'     : 1.0 ,   // agent capsule  height
    'Radius'    : 0.5 ,   // agent capsule  radius
    'Max Step Height'   : 0.3 ,   // how high steps agents can climb, in voxels
    'Max Slope'   : 40.0,   // maximum slope angle, in degrees

    'Region Min Size'   : 12.0,   // minimum isolated region size that is still kept
    'Region Merge Size' : 32.0,   // how large regions can be still merged
    'Edge Max Length'      : 16.0,   // maximum edge length, in voxels
    'Edge Max Error'    : 2.5     // how loosely the simplification is done
};

var soloTypeGUI = NavMeshFolder.add( RecastOpts, 'Mesh Type', { solo: 'solo', tiled: 'tiled'} );
/*var triangulationGUI = NavMeshFolder.add(RecastOpts, 'Triangulation', [
    "libtess",  // this will produce the most accurate results most of the time. if you get holes use earcut
    "earcut",   // use earcut algorithm if libtess has missing polys,
    "delaunay", // sometimes gives prettier results
    "smallest" // use all triangulation algorithms and automatically choose the result with lowest polys (slower)
]);*/

//var merge_distanceGUI = NavMeshFolder.add( RecastOpts, 'Merge Distance').min(0.0).max(10.0).step(0.05);
NavMeshFolder.closed = false;

var cellSizeGUI = NavMeshFolder.add( RecastOpts, 'Cell Size').min(0.1).max(1.0).step(0.05);
var cellHeightGUI = NavMeshFolder.add( RecastOpts, 'Cell Height').min(0.1).max(1.0).step(0.05);

var AgentFolder = gui.addFolder('Agent');
var agentHeightGUI = AgentFolder.add( RecastOpts, 'Height').min(0.1).max(3.0).step(0.05);
var agentRadiusGUI = AgentFolder.add( RecastOpts, 'Radius').min(0.1).max(3.0).step(0.05);

var agentMaxClimbGUI = AgentFolder.add( RecastOpts, 'Max Step Height').min(0.05).max(2.0).step(0.05);
var agentMaxSlopeGUI = AgentFolder.add( RecastOpts, 'Max Slope').min(1).max(90).step(1);
AgentFolder.closed = false;

var RegionFolder = gui.addFolder('Region');
var regionMinSizeGUI = RegionFolder.add(RecastOpts, 'Region Min Size').min(0).max(50).step(1);
var regionMergeSizeGUI = RegionFolder.add(RecastOpts, 'Region Merge Size').min(0).max(50).step(1);

var edgeMaxLenGUI = RegionFolder.add(RecastOpts, 'Edge Max Length').min(0).max(50).step(1);
var edgeMaxErrorGUI = RegionFolder.add(RecastOpts, 'Edge Max Error').min(0.0).max(3.0).step(0.05);

RegionFolder.closed = false;

function buildNavMesh()
{
    if (!CONFIG)
    {
        alert("no configuration!");
        return;
    }

    if (!CURRENT_LEVEL)
    {
        alert("NO LEVEL");
        return;
    }

    let modelEL = document.querySelector('#levelmesh');
    let sceneEl = document.querySelector('a-scene');

    sceneEl.emit('nuke');

    CONFIG.solo = soloTypeGUI.getValue() == 'solo' ? true : false;
    CONFIG.options = 
    {
        cellSize        : cellSizeGUI.getValue(), 
        cellHeight      : cellHeightGUI.getValue() ,  
        agentHeight     : agentHeightGUI.getValue() , 
        agentRadius     : agentRadiusGUI.getValue() , 
        agentMaxClimb   : agentMaxClimbGUI.getValue(), 
        agentMaxSlope   : agentMaxSlopeGUI.getValue(),  
        regionMinSize   : regionMinSizeGUI.getValue(), 
        regionMergeSize : regionMergeSizeGUI.getValue(), 
        edgeMaxLen      : edgeMaxLenGUI.getValue(),
        edgeMaxError    : edgeMaxErrorGUI.getValue()  
    };
    
    //console.log(CONFIG);

    var xmlHttp = new XMLHttpRequest();

    var onready = function (response) {

        let data = JSON.parse(response);

        if (data.error)
        {
            console.log(data.error);
            return;
        }
    
        var loader = new THREE.ObjectLoader();
        loader.parse(data, (obj) => {
            
            //let wrapper = new THREE.Object3D();
            let navmesh = new THREE.Object3D();
            let wiremodel = obj.clone();

            let sectorMTL = 
            new THREE.MeshBasicMaterial( { 
                color: 0xFF6F00, 
                side: THREE.DoubleSide, 
                wireframe: true, 
                //wireframeLinewidth: 1,
                blendEquation: THREE.AdditiveBlending,
                transparent: true, 
                //opacity: 0.05 
            });


            /*obj.traverse( (node) => {
                if ( node.name == 'offnode.vis' && node.userData.isOffMesh );
                {
                    removeList.push(node);
                    let iconPlane = new THREE.PlaneGeometry (64, 64, 1, 1);
                    let iconMesh = new THREE.Mesh(iconPlane, iconMTL);
                    let iconObj = new THREE.Object3D();

                    iconObj.add(iconMesh);
                    iconObj.name = 'nav.icon';
                    iconObj.position.copy( node.position );
                    icons.add(iconObj);
                }
            });*/

            //removeList.forEach ( item => item.removeFromParent() );

            //console.log(icons);
        
            wiremodel.traverse( o3d => {
                if (o3d.material && o3d.name !== 'nowire')
                {
                    o3d.material = sectorMTL;
                    o3d.material.needsUpdate = true;
                }
            });

            let levelEdges = new THREE.Object3D();

            obj.traverse( node => {
                if ( node.geometry );
                {
                    var edges = new THREE.EdgesGeometry( node.geometry );
                    var line = new THREE.LineSegments( edges, new THREE.LineBasicMaterial( { color: 0xFF6F00 } ) ); 
                    levelEdges.add(line);
                }
            });
            
            levelEdges.name = 'nav.edges';
            wiremodel.name = 'nav.triangles';
            obj.name = 'nav.solid';

            wiremodel.position.setY(wiremodel.position.y + 0.003 );

            navmesh.add(wiremodel);

            navmesh.add(obj);

            navmesh.add(levelEdges);

            navmesh.name = 'navmesh';
            navmesh.position.add (  new THREE.Vector3(0, 0.33, 0));
    
            let level = modelEL.object3DMap.level;
           // level.add(icons);
            level.add(navmesh);
            modelEL.emit('icons', {}, true);

        });
    };

    xmlHttp.open("POST", `/build?level=${CURRENT_LEVEL}`);
    xmlHttp.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
    xmlHttp.send(JSON.stringify( CONFIG ));
    
    xmlHttp.onreadystatechange = function() {
        if (xmlHttp.readyState == XMLHttpRequest.DONE) {
            onready(xmlHttp.responseText);
        }
    };
}

function setNodeVis (name, visible)
{
    return function(node)
    {
        if (node && node.name == name)
        {
            node.visible = visible;
        }
    };
}

function setModelVis (name, parent)
{
    return function() {
        getModelScene().traverse ( setNodeVis(name, parent.getValue()) );
    };
}

gui.add ({ 'Build Navigation Mesh' : function(){ 
    buildNavMesh();
}}, 'Build Navigation Mesh');

//var displayfolders = gui.addFolder('Display');
//displayfolders.closed = false;

var navdisplayfolder = gui.addFolder('Nav Mesh Display');
//navdisplayfolder.closed = false;

var navDispTriCtrl = navdisplayfolder.add ({ 'Show Triangles' : true}, 'Show Triangles');
navDispTriCtrl.onChange( setModelVis('nav.triangles', navDispTriCtrl) );

var navDispEdgeCtrl = navdisplayfolder.add ({ 'Show Edges' : true}, 'Show Edges');
navDispEdgeCtrl.onChange( setModelVis('nav.edges', navDispEdgeCtrl) );

var levelDisplayFolder = gui.addFolder('Level Mesh Display');

var lvlDispTriCtrl = levelDisplayFolder.add ({ 'Show Triangles' : false}, 'Show Triangles');
lvlDispTriCtrl.onChange( setModelVis('level.triangles', lvlDispTriCtrl) );

var lvlDispEdgeCtrl = levelDisplayFolder.add ({ 'Show Edges' : true}, 'Show Edges');
lvlDispEdgeCtrl.onChange( setModelVis('level.edges', lvlDispEdgeCtrl) );

var lvlDispWalls= levelDisplayFolder.add ({ 'Show Edges' : true}, 'Show Edges');
lvlDispWalls.onChange( setModelVis('walls.preview', lvlDispWalls) );

/*lvlDispSolidCtrl.onChange( ()=>{
    getModelScene().traverse ( setVisibilty('level.triangles', lvlDispSolidCtrl.getValue()) );
});*/

//levelDisplayFolder.closed = false;

gui.closed = false;

function setConfig(cfg)
{
    //triangulationGUI.setValue(cfg.triangulation);
    //merge_distanceGUI.setValue(cfg.merge_distance);
    soloTypeGUI.setValue(  cfg.solo ? 'solo' : 'tiled' );

    cellSizeGUI.setValue(cfg.options.cellSize); 
    cellHeightGUI.setValue(cfg.options.cellHeight); 
    agentHeightGUI.setValue(cfg.options.agentHeight); 
    agentRadiusGUI.setValue(cfg.options.agentRadius); 
    agentMaxClimbGUI.setValue(cfg.options.agentMaxClimb); 
    agentMaxSlopeGUI.setValue(cfg.options.agentMaxSlope);  
    regionMinSizeGUI.setValue(cfg.options.regionMinSize); 
    regionMergeSizeGUI.setValue(cfg.options.regionMergeSize); 
    edgeMaxLenGUI.setValue(cfg.options.edgeMaxLen);
    edgeMaxErrorGUI.setValue(cfg.options.edgeMaxError);
}


/*
gui.remember(obj);

gui.add(obj, 'message');
gui.add(obj, 'displayOutline');
gui.add(obj, 'explode');

gui.add(obj, 'maxSize').min(-10).max(10).step(0.25);
gui.add(obj, 'height').step(5); // Increment amount

// Choose from accepted values
gui.add(obj, 'type', [ 'one', 'two', 'three' ] );

// Choose from named values
gui.add(obj, 'speed', { Stopped: 0, Slow: 0.1, Fast: 5 } );

var f1 = gui.addFolder('Colors');
f1.addColor(obj, 'color0');
f1.addColor(obj, 'color1');
f1.addColor(obj, 'color2');
f1.addColor(obj, 'color3');

var f2 = gui.addFolder('Another Folder');
f2.add(obj, 'noiseStrength');

var f3 = f2.addFolder('Nested Folder');
f3.add(obj, 'growthSpeed');

obj['Button with a long description'] = function () {
  console.log('Button with a long description pressed');
};
gui.add(obj, 'Button with a long description');
*/



