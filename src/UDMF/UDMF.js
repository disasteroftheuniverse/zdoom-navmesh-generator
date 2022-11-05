//jshint esversion: 8
const _ = require('lodash');
const short = require('short-uuid');
const {
    Vector2,
    Vector3,
    Box2,
    Plane,
    Line3
} = require('three');




class UDMFValidator {
    static toBool(pair) {
        if (pair.val == 'true') {
            pair.val = true;
        } else if (pair.val == 'false') {
            pair.val = false;
        }
        return pair;
    }

    static invertY(pair) {

        if (pair.key == 'y') {
            pair.val = pair.val * 1;
        }
        return pair;
    }

    static validate(key, val, options) {
        var pair = { key, val };

        if (!options || (options && !options.length)) {
            return pair;
        }

        var validator;

        for (var i = 0; i < options.length; i++) {

            if (!pair) return null;
            validator = options[i];
            pair = validator(pair);

        }

        return pair;
    }

    static tagList(pair) {

        if (pair.key == 'moreids') {
            //if (pair.val)
            pair.val = pair.val.split(' ').map(tag => Number(tag));
        }

        return pair;
    }
}

class UDMFBlock {
    /**
     * Get Distance between two points
     * @param { Number } x1 
     * @param { Number } y1 
     * @param { Number } x2 
     * @param { Number } y2 
     * @returns { Number }
     */
    static getDistance(x1, y1, x2, y2) {
        return Math.sqrt(((y2 - y1) * (y2 - y1)) + ((x2 - x1) * (x2 - x1)));
    }

    /**
     * make an array out of standard args
     * @param { UDMFBlock } block 
     */
    static appendArgs(block) {
        block.args = new Array(5);
        var argStr = 'arg0';

        for (var i = 0; i < 5; i++) {
            argStr = `arg${i}`;
            if (_.has(block, argStr)) {
                block.args[i] = block[argStr];
            } else {
                block.args[i] = 0;
            }
        }
    }

    /**
     * make an array out of ids
     * @param { UDMFBlock } block 
     */
    static appendTags(block) {
        if (block.id !== undefined || block.moreids !== undefined) {

            block.tags = [];

            if (block.id) block.tags.push(block.id);
            if (block.moreids) block.tags = block.tags.concat(block.moreids);

            block.tags.forEach (tag => {
                block.level.registerTag(tag, block);
            }, block);
        }
    }

    constructor(level, block, index, options) {

        this.UUID = short.uuid();
        this.index = index;

        Object.defineProperty(this, 'level', {
            enumerable: false,
            value: level
        });

        let props = Object.keys(block);

        props.forEach((prop) => {
            var pair = UDMFValidator.validate(prop, block[prop], options);
            if (pair) this[pair.key] = pair.val;
        }, this);
    }

    /**
     * Get a UDMF block from Level using the type and index
     * @param { ('vertex' | 'thing' | 'sidedef' | 'linedef' | 'sector') } name The type of entity to get
     * @param { Number } index position of entity in an array
     * @returns { ( Vertex | LineDef | Sector | Thing | SideDef) } returns a type of UDMF block
     */
    getBlock(name, index) {
        return this.level[name][index];
    }
}

class Vertex extends UDMFBlock {
    constructor(level, block, index) 
    {
        super(level, block, index, [UDMFValidator.toBool, UDMFValidator.invertY]);
        this.isVertex = true;
        this.v = new Vector2(this.x, this.y);

        return this;
    }

    /**
     * Get 2D distance to another vertex
     * @param { Vertex } vertex Another vertex
     * @returns { Number } distance in map units
     */
    distanceTo(vertex) {
        return UDMFBlock.getDistance(this.x, this.y, vertex.x, vertex.y);
    }
}

class LineDef extends UDMFBlock {
    constructor(level, block, index) {
        super(level, block, index, [UDMFValidator.toBool, UDMFValidator.tagList]);
        this.isLineDef = true;

        UDMFBlock.appendArgs(this);
        UDMFBlock.appendTags(this);
        
        this.vertices = [this.getBlock('vertices', this.v1), this.getBlock('vertices', this.v2)];
        this.length = this.vertices[0].distanceTo(this.vertices[1]);

        this.sidedefs = [null, null];
        this.sectors = [null, null];
        this.isFree = false;

        this.isModel = false;

        this.back = {
            sector: null,
            sidedef: null
        };

        this.front = {
            sector: null,
            sidedef: null
        };

        if (_.has(this, 'sidefront')) {
            this.front.sidedef = this.getBlock('sidedefs', this.sidefront);
            this.front.sector = this.front.sidedef.sector;

            this.sidedefs[0] = this.front.sidedef;
            this.sectors[0] = this.front.sector;

            this.front.sector
                .addLineDef(this)
                .addVertex(this.vertices[0])
                .addVertex(this.vertices[1]);
        }

        if (_.has(this, 'sideback')) {
            this.back.sidedef = this.getBlock('sidedefs', this.sideback);
            this.back.sector = this.back.sidedef.sector;

            this.sectors[1] = this.back.sector;
            this.sidedefs[1] = this.back.sidedef;

            this.back.sector
                .addLineDef(this)
                .addVertex(this.vertices[0])
                .addVertex(this.vertices[1]);
        }

        if (
            this.sectors[0] !== null &&
            this.sectors[1] !== null &&
            this.sectors[0].index == this.sectors[1].index
        ) {
            this.isFree = true;
        }

        if (this.front.sector && 
            this.special && 
            this.special == 160 && 
            this.args &&
            this.args[0] > 0
        )
        {
            let arg0 = this.args[0];

            if ( this.level.tagGroups.has('sector') )
            {
                if ( this.level.tagGroups.get('sector').has( arg0 ) )
                {
                    this.isModel = true;
                }
            }
        }

        return this;
    }

    /**
     * Get the sector opposite of the one provided, if it belongs to the same sector
     * @param { Sector } sector 
     * @returns Sector 
     */
    getOtherSector(sector) {
        var localSectorIndex = this.sectors.indexOf(sector);
        return (localSectorIndex < 0) ? undefined : (localSectorIndex == 0) ? this.sectors[0] : this.sectors[1];
    }

    /**
     * checks if provided linedef shares any vertices with this one
     * @param { LineDef } linedef 
     * @returns boolean
     */
    sharesVertexWith(linedef) {
        return this.v1 == linedef.v1 || this.v2 == linedef.v2;
    }

    getSharedVertex(linedef) {
        if (this.v1 == linedef.v1) return this.vertices[0];
        if (this.v2 == linedef.v2) return this.vertices[1];
        return null;
    }

    /**
     * Get the other vertex in this linedef provided one known vertex
     * @param { Vertex } Vertex 
     * @returns { Vertex }
     */
    getOtherVertex(vertex) {
        return (this.vertices.indexOf(vertex) < 0) ? null : (this.vertices[0].index == vertex.index) ? this.vertices[1] : this.vertices[0];
    }

    hasVertex(vertex) {
        if (this.v1 == vertex.index) return true;
        if (this.v2 == vertex.index) return true;
        return false;
    }

    getLeftmostVertex() {
        if (this.vertices[0].x < this.vertices[1].x) return this.vertices[0];
        return this.vertices[1];
    }

    getRightmostVertex() {
        if (this.vertices[0].x > this.vertices[1].x) return this.vertices[0];
        return this.vertices[1];
    }

    getWalls() {
        let v1 = this.vertices[0];
        let v2 = this.vertices[1];

        if (this.sectors[0] !== null &&
            this.sectors[1] !== null &&
            !this.isFree &&
            this.sectors[0].heightfloor != this.sectors[1].heightfloor
        ) {
            let floorLower = Math.min(this.sectors[0].heightfloor, this.sectors[1].heightfloor);
            let floorHigher = Math.max(this.sectors[0].heightfloor, this.sectors[1].heightfloor);


            let corners = [
                new Vector3(v1.x, floorLower, v1.y),
                new Vector3(v1.x, floorHigher, v1.y),
                new Vector3(v2.x, floorHigher, v2.y),
                new Vector3(v2.x, floorLower, v2.y),
            ];

            if (this.sectors[0].heightfloor > this.sectors[1].heightfloor) {
                corners = corners.reverse();
            }

            let triangulated =
                [
                    corners[1], corners[2], corners[0],
                    corners[0], corners[2], corners[3]
                ].reverse();

            //earcut( corners.map( v => v.toArray()).flat(), null, 3 ).map(index => corners[index]);
            return triangulated;

        }

        return null;
    }

    getShapes() {

        if (this.sectors[0] !== null &&
            this.sectors[1] !== null &&
            !this.isFree &&
            this.sectors[0].heightfloor != this.sectors[1].heightfloor
        ) {
            let v1 = this.vertices[0];
            let v2 = this.vertices[1];
            let floorLower = Math.min(this.sectors[0].heightfloor, this.sectors[1].heightfloor);
            let floorHigher = Math.max(this.sectors[0].heightfloor, this.sectors[1].heightfloor);


            let corners = [
                new Vector3(v1.x, floorLower, v1.y),
                new Vector3(v1.x, floorHigher, v1.y),
                new Vector3(v2.x, floorHigher, v2.y),
                new Vector3(v2.x, floorLower, v2.y),
            ];

            return { outline: corners };
        }

        return null;
    }
}


class Sector extends UDMFBlock {

    constructor(level, block, index) 
    {
        super(level, block, index, [UDMFValidator.toBool, UDMFValidator.tagList]);

        this.isSector = true;

        this.sidedefs = [];
        this.linedefs = [];
        this.vertices = [];
        this.sectors = [];

        this.bounds = new Box2();

        this.isFree = false;

        this.slopedFloor = false;
        this.slopedCeiling = false;

        this.terrainFloor = false;
        this.terrainCeiling = false;

        this.isModel = false;
        this.hasFloors3D = false;

        this.modelLines = [];
        this.modelSectors = [];

        //this.floorplane = new Plane();

        

        UDMFBlock.appendTags(this);


        return this;
    }

    addModel( linedef, sector)
    {
        if ( this.modelLines.indexOf (linedef) < 0)
        {
            this.modelLines.push(linedef);
        }

        if ( this.modelSectors.indexOf (sector) < 0)
        {
            this.modelSectors.push(sector);
        }
    }

    addSideDef(sidedef) {
        if (this.sidedefs.indexOf(sidedef) < 0) {
            this.sidedefs.push(sidedef);
        }

        return this;
    }

    addLineDef(linedef) {

        if (this.linedefs.indexOf(linedef) < 0) {
            this.linedefs.push(linedef);
        }

        return this;
    }

    addVertex(vertex) {
        if (this.vertices.indexOf(vertex) < 0) {
            this.vertices.push(vertex);
            this.bounds.expandByPoint(vertex.v);
        }

        return this;
    }

    hasVertex(vertex)
    {
        return this.vertices.indexOf(vertex) > -1;
    }

    setSlopes()
    {
        this.linedefs.forEach ( linedef => {
            let other = linedef.getOtherSector(this);

            if ( other )
            {
                this.sectors.push(other);
            }

        }, this);

        if (!this.sectors.length)
        {
            this.isFree = true;
        }

        if (
            _.has(this, 'floorplane_a') || _.has(this, 'floorplane_b') || _.has(this, 'floorplane_c') || _.has(this, 'floorplane_d')) {
            this.slopedFloor = true;
        }

        if (_.has(this, 'ceilingplane_a') || _.has(this, 'ceilingplane_b') || _.has(this, 'ceilingplane_c') || _.has(this, 'ceilingplane_d')) {
            this.slopedCeiling = true;
        }

        if ( this.vertices.length == 3 )
        {
            let hasFloorTerrain = false;
            let hasCeilTerrain = false;

            this.vertices.forEach( vertex => {

                if (vertex.zfloor !== undefined && !hasFloorTerrain)
                {
                    hasFloorTerrain = true;
                }

                if (vertex.zceiling !== undefined && !hasCeilTerrain)
                {
                    hasCeilTerrain = true;
                }

            }, this);

            if (hasFloorTerrain) this.terrainFloor = true;
            if (hasCeilTerrain) this.terrainCeiling = true;

        }

        if (this.slopedFloor)
        {

        }

    }


}

class SideDef extends UDMFBlock {
    constructor(level, block, index) {
        super(level, block, index, [UDMFValidator.toBool]);
        this.isSideDef = true;

        this.sector = this.getBlock('sectors', this.sector);

        this.sector.addSideDef(this);

        return this;
    }
}

class Thing extends UDMFBlock {
    constructor(level, block, index) {
        
        super(level, block, index, [UDMFValidator.toBool, UDMFValidator.invertY, UDMFValidator.tagList]);

        UDMFBlock.appendArgs(this);
        UDMFBlock.appendTags(this);

        this.v = new Vector2( this.x, this.y );

        return this;
    }
}

class TaggedList 
{

    constructor(type, tag) 
    {
        this.type = type;
        this.uuid = short();
        this.tag = tag;
        this[type] = [];
    }

    add(item) 
    {
        if (this[this.type].indexOf(item) < 0) {
            this[this.type].push(item);
        }
    }

    getList()
    {
        return this[this.type];
    }

}

class Level {
    constructor(data) {

        this.tagGroups = new Map();

        this.modelLines = [];
        this.modelSectors = [];

        this.sectors = [];
        this.sidedefs = [];
        this.vertices = [];
        this.linedefs = [];
        this.things = [];
        this.shapes = null;

        this.ingest(data);
    }

    ingest(data) {

        /*
        let textmapjson = _.filter(data[0], (candidate) => { 
            return _.isObject(candidate) && !_.isArray(candidate); 
        });
        */

        //textmapjson = _.groupBy(textmapjson, 'type');
        var textmapjson = data;
        this.raw = JSON.parse(JSON.stringify(_.toPlainObject(textmapjson)));

        //console.log(this.raw);

        /* vertices */
        textmapjson.vertex.forEach((block, index) => {
            this.addVertex(block, index);
        }, this);

        this.vertices.sort((a, b) => a.index - b.index);

        /* sectors */
        textmapjson.sector.forEach((block, index) => {
            this.addSector(block, index);
        }, this);

        this.sectors.sort((a, b) => a.index - b.index);

        /* sidedefs */
        textmapjson.sidedef.forEach((block, index) => {
            this.addSideDef(block, index);
        }, this);

        this.sidedefs.sort((a, b) => a.index - b.index);

        /* linedefs */
        textmapjson.linedef.forEach((block, index) => {
            this.addLineDef(block, index);
        }, this);

        this.linedefs.sort((a, b) => a.index - b.index);

        /* things */
        textmapjson.thing.forEach((block, index) => {
            this.addThing(block, index);
        }, this);

        this.things.sort((a, b) => a.index - b.index);

        this.sectors = this.sectors.map (sector => {
            sector.setSlopes();
            return sector;
        });

        this.things.forEach( thing => {

        });

        //console.log(this.tagGroups);

    }

    addVertex(block, index) {
        let vtx = new Vertex(this, block, index);
        this.vertices.push(vtx);
    }

    addSideDef(block, index) {
        let sdef = new SideDef(this, block, index);
        this.sidedefs.push(sdef);
    }

    addLineDef(block, index) {

        let ldef = new LineDef(this, block, index);
        this.linedefs.push(ldef);

        if ( ldef.isModel )
        {
            this.modelLines.push(ldef);
            let modelsector = ldef.front.sector;

            if ( this.modelSectors.indexOf(modelsector) < 0 )
            {
                modelsector.isModel = true;
                this.modelSectors.push(modelsector);
            }

            this.tagGroups
                .get( 'sector' )
                .get ( ldef.args[0] )
                .getList()
                .forEach (taggedSector => {
                    taggedSector.hasFloors3D = true;
                    taggedSector.addModel(ldef, modelsector);
                });
        }
    }

    addSector(block, index) 
    {
        let sec = new Sector(this, block, index);
        this.sectors.push(sec);
    }

    registerTag(tag, item) {

        if (!this.tagGroups.has(item.blocktype)) {
            this.tagGroups.set(item.blocktype, new Map());
        }

        let taggedTypeGroup = this.tagGroups.get(item.blocktype);

        if (!taggedTypeGroup.has(tag)) {
            taggedTypeGroup.set(tag, new TaggedList(item.blocktype, tag));
        }

        let taggedlist = taggedTypeGroup.get(tag);

        taggedlist.add(item);

        if ( item.tagGroups == undefined ) item.tagGroups = [];

        if ( item.tagGroups.indexOf(taggedlist) < 0 ) item.tagGroups.push(taggedlist);
    }

    addThing(block, index) {
        let thng = new Thing(this, block, index);
        this.things.push(thng);
    }

}

const UDMF = {
    Level, Sector, Vertex, Thing, SideDef, LineDef
};

module.exports = UDMF;