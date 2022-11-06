# ZDoom Navigation Mesh Generator
![image](https://img.shields.io/badge/status-WIP-orange) ![image](https://img.shields.io/badge/status-concept-lightgrey)

![image](https://imgur.com/O7thc1W.png)

Robust pathfinding for [GZDoom](https://zdoom.org/index). Automatically generate navigation meshes for use with [zdoom-pathfinding](https://github.com/disasteroftheuniverse/zdoom-pathfinding).

## Installation

First, you will need to install [Node.js](https://nodejs.org/en/)

Once Node.js is installed, clone this repository to your desired directory

```sh
git clone https://github.com/disasteroftheuniverse/zdoom-navmesh-generator
```
Navigate to the main directory

```sh
cd zdoom-navmesh-generator
```

Install required dependencies

```sh
npm install
```

Once all dependencies are installed, launch the server:

```sh
npm run start
```

If successful, you will recieve a success message with links to the configuration menu and main application. Open the links in a web browser to enter the app. 

## Usage

#### Configuration

**You _must_ create a configuration file before generating a navigation mesh.**

#### Nav Mesh Settings
```
Cell Size - voxelization cell size 
Cell Height - voxelization cell height
Agent Height - Agent capsule  height
Agent Radius - Agent capsule  radius
Agent Max Step Height - how high steps agents can climb, in voxels
Agent Max Slope - maximum slope angle, in degrees
Region Min Size -  minimum isolated region size that is still kept
Region Merge Size - how large regions can be still merged
Edge Max Length - maximum edge length, in voxels
Edge Max Error  - how loosely the simplification is done
```

Once you have customized your settings, press `Build Navigation Mesh` to build the mesh.

You may press `Shut Down Server` to terminate the express server process.

#### Excluding Regions

To exclude sectors from being used to generate nav meshes, you may apply the custom UDMF field `user_nocast` to a sector, set its type to `Boolean` and its value to `true`.

To exclude linedefs from being used to generate nav meshes, you may apply the custom UDMF field `user_nocast` to the linedef, set its type to `Boolean` and its value to `true`.

#### TODO

* Support for obstacles
* Support for Patrol Nodes
* Custom off-mesh connections defined by things
* Support for blocking lines

