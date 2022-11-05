AFRAME.registerComponent('icons', {
    init: function () {

        let modelEL = document.querySelector('#levelmesh');
        let sceneEl = document.querySelector('a-scene');
        let sceneObj = sceneEl.object3D;

        this.camera = document.querySelector('#camera').object3D;

        this.icons = [];
        console.log('awaiting icon');
        
        let obj = modelEL.object3D;
        let self = this;
        

        sceneEl.addEventListener('nuke', function(){
            let toRemove = [];

            self.icons.forEach(icon => {
                toRemove.push(icon);
            });

            sceneObj.traverse( node => {
                if (node.name == 'navmesh')
                {
                    toRemove.push(node);
                    //node.removeFromParent();
                }
            });

            toRemove.forEach( node => node.removeFromParent());
        });

        this.el.addEventListener( 'icons', function (){

            self.icons = [];

            let icons = new THREE.Object3D();
            //let removeList = [];

            let tex = new THREE.TextureLoader().load('prev/PNODD0.png');
            tex.anisotropy = 0;
            tex.minFilter = THREE.NearestFilter;

            let iconMTL = new THREE.MeshBasicMaterial({
                map: tex, 
                side: THREE.DoubleSide, 
                color: 0xFF00AA, 
                transparent: true ,
                depthTest: true,
                depthWrite: false,
            });


            obj.traverse( (node) => {
                if ( node.name === 'offnode.vis')
                {
                    let iconPlane = new THREE.PlaneGeometry (80, 80, 1, 1);
                    let iconMesh = new THREE.Mesh(iconPlane, iconMTL);
                    let iconObj = new THREE.Object3D();

                    iconObj.add(iconMesh);
                    iconObj.name = 'nav.icon';
                    iconObj.position.copy( node.position );
                    self.icons.push(iconObj);
                    icons.add(iconObj);
                }
            });
            let level = modelEL.object3DMap.level;
            level.add( icons );
            icons.scale.multiplyScalar(1/64);
            icons.position.setY(icons.position.y+0.1);
            console.log(self.icons);
            //console.log(self.camera);
        });
    },
    tick: function()
    {

        if (!this.camera)
        {
            this.camera = document.querySelector('#camera').object3D;
        }

        if (this.icons.length && this.camera && this.camera.position)
        {
            this.icons.forEach( icon => {
                if (icon)
                {
                    if (icon.lookAt)
                    {
                        icon.lookAt( this.camera.position );
                    }
                }
            });
        }
    }
});
