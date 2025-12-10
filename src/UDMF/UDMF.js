// jshint esversion: 8
// External dependencies
const _ = require('lodash');                  // Utility library for common operations
const short = require('short-uuid');         // Generates short UUIDs
const {
    Vector2,
    Vector3,
    Box2,
    Plane,
    Line3
} = require('three');                        // Three.js classes for geometry operations

/**
 * UDMFValidator
 * Helper class to validate and process UDMF key-value pairs
 */
class UDMFValidator {

    /**
     * Convert string 'true'/'false' to Boolean
     * @param { Object } pair - { key, val }
     * @returns { Object } updated pair
     */
    static toBool(pair) {
        if (pair.val == 'true') {
            pair.val = true;
        } else if (pair.val == 'false') {
            pair.val = false;
        }
        return pair;
    }

    /**
     * Inverts or adjusts Y value if key is 'y'
     * @param { Object } pair - { key, val }
     * @returns { Object } updated pair
     */
    static invertY(pair) {
        if (pair.key == 'y') {
            pair.val = pair.val * 1; // Placeholder: could invert or scale
        }
        return pair;
    }

    /**
     * Validate a key-value pair against a list of validator functions
     * @param { string } key
     * @param { any } val
     * @param { Array<Function> } options - validators
     * @returns { Object } validated pair
     */
    static validate(key, val, options) {
        var pair = { key, val };

        if (!options || (options && !options.length)) {
            return pair;
        }

        for (var i = 0; i < options.length; i++) {
            if (!pair) return null;
            pair = options[i](pair);
        }

        return pair;
    }

    /**
     * Split a space-separated string of IDs into an array of numbers
     * Used for the 'moreids' key
     * @param { Object } pair
     */
    static tagList(pair) {
        if (pair.key == 'moreids') {
            pair.val = pair.val.split(' ').map(tag => Number(tag));
        }
        return pair;
    }
}

/**
 * UDMFBlock
 * Base class representing a generic UDMF entity
 */
class UDMFBlock {

    /**
     * Compute 2D distance between two points
     */
    static getDistance(x1, y1, x2, y2) {
        return Math.sqrt(((y2 - y1) ** 2) + ((x2 - x1) ** 2));
    }

    /**
     * Build an 'args' array from arg0..arg4
     * @param { UDMFBlock } block
     */
    static appendArgs(block) {
        block.args = new Array(5);

        for (var i = 0; i < 5; i++) {
            const argStr = `arg${i}`;
            block.args[i] = _.has(block, argStr) ? block[argStr] : 0;
        }
    }

    /**
     * Build a 'tags' array from id and moreids
     * @param { UDMFBlock } block
     */
    static appendTags(block) {
        if (block.id !== undefined || block.moreids !== undefined) {
            block.tags = [];

            if (block.id) block.tags.push(block.id);
            if (block.moreids) block.tags = block.tags.concat(block.moreids);

            // Register tags in the level
            block.tags.forEach(tag => block.level.registerTag(tag, block));
        }
    }

    /**
     * Constructor for generic UDMF block
     */
    constructor(level, block, index, options) {
        this.UUID = short.uuid();   // Unique identifier
        this.index = index;

        // Non-enumerable reference to the parent level
        Object.defineProperty(this, 'level', {
            enumerable: false,
            value: level
        });

        // Validate and assign all properties from input block
        let props = Object.keys(block);
        props.forEach((prop) => {
            const pair = UDMFValidator.validate(prop, block[prop], options);
            if (pair) this[pair.key] = pair.val;
        });
    }

    /**
     * Get a UDMF block by type and index
     */
    getBlock(name, index) {
        return this.level[name][index];
    }
}

/**
 * Vertex
 * Represents a map vertex
 */
class Vertex extends UDMFBlock {
    constructor(level, block, index) {
        // Apply boolean and Y validators
        super(level, block, index, [UDMFValidator.toBool, UDMFValidator.invertY]);
        this.isVertex = true;
        this.v = new Vector2(this.x, this.y); // Three.js vector representation
        return this;
    }

    /**
     * Distance to another vertex
     */
    distanceTo(vertex) {
        return UDMFBlock.getDistance(this.x, this.y, vertex.x, vertex.y);
    }
}

/**
 * LineDef
 * Represents a linedef connecting two vertices
 */
class LineDef extends UDMFBlock {
    constructor(level, block, index) {
        // Apply boolean and tag validators
        super(level, block, index, [UDMFValidator.toBool, UDMFValidator.tagList]);
        this.isLineDef = true;

        UDMFBlock.appendArgs(this);
        UDMFBlock.appendTags(this);

        // Vertices of the linedef
        this.vertices = [this.getBlock('vertices', this.v1), this.getBlock('vertices', this.v2)];
        this.length = this.vertices[0].distanceTo(this.vertices[1]);

        this.sidedefs = [null, null];  // front and back sidedefs
        this.sectors = [null, null];   // front and back sectors
        this.isFree = false;
        this.isModel = false;

        this.back = { sector: null, sidedef: null };
        this.front = { sector: null, sidedef: null };

        // Assign front sidedef and sector
        if (_.has(this, 'sidefront') && this.sidefront > -1) {
            this.front.sidedef = this.getBlock('sidedefs', this.sidefront);
            this.front.sector = this.front.sidedef.sector;

            this.sidedefs[0] = this.front.sidedef;
            this.sectors[0] = this.front.sector;

            this.front.sector.addLineDef(this).addVertex(this.vertices[0]).addVertex(this.vertices[1]);
        }

        // Assign back sidedef and sector
        if (_.has(this, 'sideback') && this.sideback > -1) {
            var sddf = this.getBlock('sidedefs', this.sideback);
            this.back.sidedef = sddf;
            this.back.sector = this.back.sidedef.sector;

            this.sectors[1] = this.back.sector;
            this.sidedefs[1] = this.back.sidedef;

            this.back.sector.addLineDef(this).addVertex(this.vertices[0]).addVertex(this.vertices[1]);
        }

        // Check if linedef is fully internal to one sector
        if (this.sectors[0] !== null && this.sectors[1] !== null && this.sectors[0].index == this.sectors[1].index) {
            this.isFree = true;
        }

        // Determine if this linedef is part of a 3D model sector
        if (this.front.sector && this.special == 160 && this.args && this.args[0] > 0) {
            let arg0 = this.args[0];
            if (this.level.tagGroups.has('sector') && this.level.tagGroups.get('sector').has(arg0)) {
                this.isModel = true;
            }
        }

        return this;
    }

    /**
     * Get the opposite sector of this linedef
     */
    getOtherSector(sector) {
        var localSectorIndex = this.sectors.indexOf(sector);
        return (localSectorIndex < 0) ? undefined : (localSectorIndex == 0) ? this.sectors[0] : this.sectors[1];
    }

    /**
     * Checks if another linedef shares any vertex
     */
    sharesVertexWith(linedef) {
        return this.v1 == linedef.v1 || this.v2 == linedef.v2;
    }

    /**
     * Get the vertex shared with another linedef
     */
    getSharedVertex(linedef) {
        if (this.v1 == linedef.v1) return this.vertices[0];
        if (this.v2 == linedef.v2) return this.vertices[1];
        return null;
    }

    /**
     * Get the opposite vertex from a given vertex
     */
    getOtherVertex(vertex) {
        return (this.vertices.indexOf(vertex) < 0) ? null :
            (this.vertices[0].index == vertex.index) ? this.vertices[1] : this.vertices[0];
    }

    hasVertex(vertex) {
        return this.v1 == vertex.index || this.v2 == vertex.index;
    }

    getLeftmostVertex() {
        return (this.vertices[0].x < this.vertices[1].x) ? this.vertices[0] : this.vertices[1];
    }

    getRightmostVertex() {
        return (this.vertices[0].x > this.vertices[1].x) ? this.vertices[0] : this.vertices[1];
    }

    /**
     * Generate 3D walls if sector heights differ
     */
    getWalls() {
        if (this.sectors[0] !== null && this.sectors[1] !== null && !this.isFree && this.sectors[0].heightfloor != this.sectors[1].heightfloor) {
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

            if (this.sectors[0].heightfloor > this.sectors[1].heightfloor) {
                corners = corners.reverse();
            }

            return [
                corners[1], corners[2], corners[0],
                corners[0], corners[2], corners[3]
            ].reverse();
        }
        return null;
    }

    /**
     * Get outline shape for sector height differences
     */
    getShapes() {
        if (this.sectors[0] !== null && this.sectors[1] !== null && !this.isFree && this.sectors[0].heightfloor != this.sectors[1].heightfloor) {
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

/**
 * Sector
 * Represents a map sector
 */
class Sector extends UDMFBlock {
    constructor(level, block, index) {
        super(level, block, index, [UDMFValidator.toBool, UDMFValidator.tagList]);

        this.isSector = true;

        // Arrays for sector geometry
        this.sidedefs = [];
        this.linedefs = [];
        this.vertices = [];
        this.sectors = [];

        this.bounds = new Box2();      // Bounding box for vertices
        this.isFree = false;

        // Floor/ceiling properties
        this.slopedFloor = false;
        this.slopedCeiling = false;
        this.terrainFloor = false;
        this.terrainCeiling = false;

        // Model info
        this.isModel = false;
        this.hasFloors3D = false;
        this.modelLines = [];
        this.modelSectors = [];

        // Register tags
        UDMFBlock.appendTags(this);

        return this;
    }

    /**
     * Add model association to this sector
     */
    addModel(linedef, sector) {
        if (this.modelLines.indexOf(linedef) < 0) this.modelLines.push(linedef);
        if (this.modelSectors.indexOf(sector) < 0) this.modelSectors.push(sector);
    }

    addSideDef(sidedef) {
        if (this.sidedefs.indexOf(sidedef) < 0) this.sidedefs.push(sidedef);
        return this;
    }

    addLineDef(linedef) {
        if (this.linedefs.indexOf(linedef) < 0) this.linedefs.push(linedef);
        return this;
    }

    addVertex(vertex) {
        if (this.vertices.indexOf(vertex) < 0) {
            this.vertices.push(vertex);
            this.bounds.expandByPoint(vertex.v);
        }
        return this;
    }

    hasVertex(vertex) {
        return this.vertices.indexOf(vertex) > -1;
    }

    /**
     * Set slopes and terrain flags based on vertices and planes
     */
    setSlopes() {
        this.linedefs.forEach(linedef => {
            let other = linedef.getOtherSector(this);
            if (other) this.sectors.push(other);
        });

        if (!this.sectors.length) this.isFree = true;

        // Detect sloped floor
        if (_.has(this, 'floorplane_a') || _.has(this, 'floorplane_b') || _.has(this, 'floorplane_c') || _.has(this, 'floorplane_d')) {
            this.slopedFloor = true;
        }

        // Detect sloped ceiling
        if (_.has(this, 'ceilingplane_a') || _.has(this, 'ceilingplane_b') || _.has(this, 'ceilingplane_c') || _.has(this, 'ceilingplane_d')) {
            this.slopedCeiling = true;
        }

        // Detect terrain from vertices
        if (this.vertices.length == 3) {
            let hasFloorTerrain = false;
            let hasCeilTerrain = false;
            this.vertices.forEach(vertex => {
                if (vertex.zfloor !== undefined && !hasFloorTerrain) hasFloorTerrain = true;
                if (vertex.zceiling !== undefined && !hasCeilTerrain) hasCeilTerrain = true;
            });

            if (hasFloorTerrain) this.terrainFloor = true;
            if (hasCeilTerrain) this.terrainCeiling = true;
        }
    }
}

/**
 * SideDef
 * Represents a side of a linedef
 */
class SideDef extends UDMFBlock {
    constructor(level, block, index) {
        super(level, block, index, [UDMFValidator.toBool]);
        this.isSideDef = true;

        // Link to sector
        this.sector = this.getBlock('sectors', this.sector);
        this.sector.addSideDef(this);

        return this;
    }
}

/**
 * Thing
 * Represents a map object/thing
 */
class Thing extends UDMFBlock {
    constructor(level, block, index) {
        super(level, block, index, [UDMFValidator.toBool, UDMFValidator.invertY, UDMFValidator.tagList]);
        UDMFBlock.appendArgs(this);
        UDMFBlock.appendTags(this);

        this.v = new Vector2(this.x, this.y);
        return this;
    }
}

/**
 * TaggedList
 * Maintains list of entities grouped by tag
 */
class TaggedList {
    constructor(type, tag) {
        this.type = type;
        this.uuid = short();
        this.tag = tag;
        this[type] = [];
    }

    add(item) {
        if (this[this.type].indexOf(item) < 0) {
            this[this.type].push(item);
        }
    }

    getList() {
        return this[this.type];
    }
}

/**
 * Level
 * Main map structure holding all entities
 */
class Level {
    constructor(data) {
        this.tagGroups = new Map();    // Tag-indexed groups for quick lookup

        this.modelLines = [];
        this.modelSectors = [];

        this.sectors = [];
        this.sidedefs = [];
        this.vertices = [];
        this.linedefs = [];
        this.things = [];
        this.shapes = null;

        this.ingest(data);              // Load data
    }

    /**
     * Ingest raw map data
     */
    ingest(data) {
        var textmapjson = data;
        this.raw = JSON.parse(JSON.stringify(_.toPlainObject(textmapjson)));

        // Create vertices
        textmapjson.vertex.forEach((block, index) => this.addVertex(block, index));
        this.vertices.sort((a, b) => a.index - b.index);

        // Create sectors
        textmapjson.sector.forEach((block, index) => this.addSector(block, index));
        this.sectors.sort((a, b) => a.index - b.index);

        // Create sidedefs
        textmapjson.sidedef.forEach((block, index) => this.addSideDef(block, index));
        this.sidedefs.sort((a, b) => a.index - b.index);

        // Create linedefs
        textmapjson.linedef.forEach((block, index) => this.addLineDef(block, index));
        this.linedefs.sort((a, b) => a.index - b.index);

        // Create things
        textmapjson.thing.forEach((block, index) => this.addThing(block, index));
        this.things.sort((a, b) => a.index - b.index);

        // Calculate slopes for all sectors
        this.sectors = this.sectors.map(sector => { sector.setSlopes(); return sector; });
    }

    addVertex(block, index) {
        this.vertices.push(new Vertex(this, block, index));
    }

    addSideDef(block, index) {
        this.sidedefs.push(new SideDef(this, block, index));
    }

    addLineDef(block, index) {
        let ldef = new LineDef(this, block, index);
        this.linedefs.push(ldef);

        // Handle 3D model lines
        if (ldef.isModel) {
            this.modelLines.push(ldef);
            let modelsector = ldef.front.sector;

            if (this.modelSectors.indexOf(modelsector) < 0) {
                modelsector.isModel = true;
                this.modelSectors.push(modelsector);
            }

            this.tagGroups.get('sector').get(ldef.args[0]).getList().forEach(taggedSector => {
                taggedSector.hasFloors3D = true;
                taggedSector.addModel(ldef, modelsector);
            });
        }
    }

    addSector(block, index) {
        this.sectors.push(new Sector(this, block, index));
    }

    /**
     * Register a tag for an entity
     */
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

        if (item.tagGroups == undefined) item.tagGroups = [];
        if (item.tagGroups.indexOf(taggedlist) < 0) item.tagGroups.push(taggedlist);
    }

    addThing(block, index) {
        this.things.push(new Thing(this, block, index));
    }
}

// Exported UDMF API
const UDMF = {
    Level, Sector, Vertex, Thing, SideDef, LineDef
};

module.exports = UDMF;
