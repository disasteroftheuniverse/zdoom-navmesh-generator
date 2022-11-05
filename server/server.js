const express = require('express');
const app = express();
const fs = require('fs');
const path = require('path');
const figlet = require('figlet');
const chalk = require('chalk');
const build = require ('./../build');
const { MasterConfigPath } = require('./../src/config');
var MasterConfig;

//it wouldn't be right if at least half the code wasn't dedicated to useless flair that makes reading
//debug messages harder
let divmsg = '------------------------------------';
let startMSG = 'UDMF TOOLS';
let fig = figlet.textSync( startMSG, { font: 'Slant' } );
let colormsg = chalk.greenBright(divmsg) + '\n' + chalk.greenBright(fig) + '\n' + chalk.greenBright(divmsg);
console.log(colormsg);

var htmlPath = path.resolve(__dirname, './../meshes');


function doubleError (res, msg)
{
  console.log( chalk.redBright(msg) );
  return res.send(msg);
}



//too lazy to figure out how to send a proper error message,
//just use this nonsense
class Err
{
  constructor(msg)
  {
    this.error = msg;
  }
}

//allow the server to 
//parse JSON sent from
//the client. this is a giant fucking security issue
//do not run this program on any network that's not 
//behind a firewall
app.use( express.json() );

// the command /wads gets a list of wads in the selected director
app.get('/wads', (req, res) => { 

  let waddir = MasterConfig.wadspath;

  if ( fs.existsSync( waddir ) )
  {
    let contents = fs.readdirSync(waddir);
    let mapfiles = contents
      .map( file => path.parse(file) )
      .filter( file => file.ext == '.wad')
      .map ( file => file.name );
    return res.send( mapfiles );
  }

  return res.send( new Err ('no such file') );
});

//parse and load a level
app.get('/level', (req, res) => { 
  build.getLevel(req.query.level, true, MasterConfig)
  .then( scene => {
    return res.send(scene);
  })
  .catch( err => 
  {
    return res.send(new Err('invalid request'));
  });
});

// build a nav mesh
app.post('/build', (req, res)=> {

  //console.log(req.body);
  console.log(req.query.level);

  build.buildNavMesh (req.query.level, req.body, MasterConfig)
  .then( scene => {
    //console.log(scene);
    return res.send(scene);
  })
  .catch( err => 
  {
    //console.log(err);
    return res.send(new Err(err));
  });

});

//API to kill the server
app.post('/shutdown', (req, res)=> {
  shutDown();
  res.send('shutting down');
});

app.post('/cfg', (req, res)=> {

  if (!req.body) return doubleError(res, 'invalid config');
  let data = req.body;
  //console.log(data);

  if (!data.wadspath) return doubleError(res, 'invalid wad path');
  if (!fs.existsSync(data.wadspath) ) return doubleError(res, 'invalid wad path');

  if (!data.configspath) return doubleError(res, 'invalid config path');
  if (!fs.existsSync(data.configspath) ) return doubleError(res, 'invalid config path');

  if (!data.configspath) return doubleError(res, 'invalid mesh path');
  if (!fs.existsSync(data.configspath) ) return doubleError(res, 'invalid mesh path');

  let blob = Buffer.from(JSON.stringify(data,null,'\t'));

  //let masterConfigPath = path.join(__dirname, 'config.json');
  fs.writeFileSync(MasterConfigPath, blob, {encoding:'utf-8'}); 
  console.log(chalk.greenBright('Config Accepted!'));

  return res.send('OK');
});

app.use( express.static(htmlPath) );

var server = app.listen(8080, function () {
    var host = 'localhost';
    var port = server.address().port;
    let configmsg = chalk.greenBright('Configure Server: ') + chalk.whiteBright ('http://'+host+':'+port+'/config.html');
    let msg = chalk.greenBright('Create Navigation Mesh: ') + chalk.whiteBright ('http://'+host+':'+port+'/');
    console.log(msg);
    console.log(configmsg);

    if ( !fs.existsSync(MasterConfigPath) )
    {
      let warnMsg = chalk.redBright('No configuration file found. Please Visit: ') + chalk.whiteBright ('http://'+host+':'+port+'/config.html');
      console.log(warnMsg);
    } else {
      MasterConfig = JSON.parse(fs.readFileSync(MasterConfigPath, {encoding: 'utf8'}));
      console.log(MasterConfig);
    }

});

/*shutdown the server*/
function shutDown()
{
  console.log('recieved kill signal');
  server.close( ()=> {
    console.log('closed out connections');
    process.exit(0);
  });
}

