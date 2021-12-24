const express = require("express")
const bodyParser = require("body-parser")
const cors = require('cors')
const { MongoClient } = require("mongodb")
const crypto = require("crypto");
const Config = require("../Config/Config.json");

const ConnString = Config.MongoReader;
const client = new MongoClient(ConnString, { useUnifiedTopology: true, maxPoolSize: 20 });

const LocalStringManager = Config.MongoLocalProxy;
const LocalClient = new MongoClient(LocalStringManager, { useUnifiedTopology: true, maxPoolSize: 1000 });


const PORT = Config.PubSubPort;
const app = express();
app.use(bodyParser.json( { limit: '20mb'} ));
app.use(bodyParser.urlencoded({ extended: true, limit: '20mb' }));
app.use(cors());

const pipeline = [
    {
        '$match': {  $or : [ { operationType: { $eq: 'insert' } }, { operationType: { $eq: 'delete' } }, { operationType: { $eq: 'update' } } ]},
    }
  ];

const headers = {
    'Content-Type': 'text/event-stream',
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache',
    "Access-Control-Allow-Origin": "*",
    'X-Accel-Buffering': 'no'
  };

//------------------------------------------------------- CACHING + BROADCAST FUNCTION ------------------------------------------------------
var ArchiveWatcher;
var ArchiveSubs = [];
var ScheduleWatcher;
var ScheduleSubs = [];
var RoomWatcher;
var RoomSubs = [];

function InitArchiveCaching (){
    ArchiveWatcher = client.db("Archive").collection("List").watch(pipeline);
    ArchiveWatcher.on('change', (next) => {
        if (next.operationType == "insert"){
            if (next.fullDocument["Hidden"] != true){
                if (!next.fullDocument.ExtShare) {next.fullDocument.ExtShare = false};
                if (!next.fullDocument.Downloadable) {next.fullDocument.Downloadable = false};
                var dt = {};

                if (!next.fullDocument.AuxLink) {
                    next.fullDocument.AuxLink = [];
                }

                dt._id = crypto.createHash('sha256').update(next.fullDocument._id.toString()).digest('hex');
                dt.Nick = next.fullDocument.Nick;
                dt.Room = next.fullDocument.Room;
                dt.Pass = next.fullDocument.Pass;
                dt.StreamLink = next.fullDocument.StreamLink;
                dt.Tags = next.fullDocument.Tags;
                dt.Note = next.fullDocument.Note;
                dt.ExtShare = next.fullDocument.ExtShare;
                dt.Downloadable = next.fullDocument.Downloadable;
                dt.Link = next.fullDocument.Link;
                dt.AuxLink = next.fullDocument.AuxLink;
                ArchiveBroadcast("{ \"flag\":\"new\", \"content\":" + JSON.stringify(dt) + " }");
            }
        } else if (next.operationType == "update") {
          LocalClient.db("Archive").collection("List").findOne({ _id: { $eq: next.documentKey._id } }, {projection:{ _id: 0, Nick: 1, Room: 1, Pass: 1, StreamLink: 1, Tags: 1, ExtShare: 1, Downloadable: 1, Note: 1, Link: 1, AuxLink: 1} }).then( 
            function(result) {
                if (result["Hidden"] != true){
                    if (!result.ExtShare) {result.ExtShare = false;}
                    if (!result.Downloadable) {result.Downloadable = false;}
                    if (!result.AuxLink) {result.AuxLink = [];}
                    result._id = crypto.createHash('sha256').update(next.documentKey._id.toString()).digest('hex');
                    ArchiveBroadcast("{ \"flag\":\"change\", \"content\":" + JSON.stringify(result) + " }");
                }
            }); 
        } else if (next.operationType == "delete") {
          ArchiveBroadcast("{ \"flag\":\"delete\", \"content\":" + JSON.stringify({ _id: crypto.createHash('sha256').update(next.documentKey._id.toString()).digest('hex') }) + " }");
        }
    });
  }

function ArchiveBroadcast(data){
    ArchiveSubs.forEach(c => c.res.write("data:" + data + "\n\n"));
}

function InitScheduleCaching (){
  ScheduleWatcher = client.db("RoomList").collection("Schedule").watch(pipeline);
    ScheduleWatcher.on('change', (next) => {
      if (next.operationType == "insert"){
        next.fullDocument._id = crypto.createHash('sha256').update(next.fullDocument._id.toString()).digest('hex');
        ScheduleBroadcast("{ \"flag\":\"new\", \"content\":" + JSON.stringify(next.fullDocument) + " }");
      } else if (next.operationType == "update") {
        client.db("RoomList").collection("Schedule").findOne({ _id: { $eq: next.documentKey._id } }).then( 
          function(result) {
              result._id = crypto.createHash('sha256').update(next.documentKey._id.toString()).digest('hex');
              ScheduleBroadcast("{ \"flag\":\"change\", \"content\":" + JSON.stringify(result) + " }");
          }); 
      } else if (next.operationType == "delete") {
        ScheduleBroadcast("{ \"flag\":\"delete\", \"content\":" + JSON.stringify({ _id: crypto.createHash('sha256').update(next.documentKey._id.toString()).digest('hex') }) + " }");
      }
    });
  }

function ScheduleBroadcast(data){
    ScheduleSubs.forEach(c => c.res.write("data:" + data + "\n\n"));
}

function InitBroadcastProxy (){
  RoomWatcher = client.db("DiscordBot").collection("Broadcast").watch(pipeline);
  RoomWatcher.on('change', (next) => {
    if (next.operationType == "insert"){
        LocalClient.db("RoomList").collection("List").findOne({ Nick: next.fullDocument.Room }, {projection:{ _id: 0, Nick: 1, EntryPass: 1, StreamLink: 1, Tags: 1, ExtShare: 1, AuxLink: 1} }).then( 
            function(result) {
                if (result) {
                    if (!result.ExtShare) {result.ExtShare = true;}
                    if (!result.AuxLink) {result.AuxLink = [];}
                    RoomBroadcast("{ \"flag\":\"new\", \"content\":" + JSON.stringify(result) + " }");
                } else {
                    if (!next.fullDocument.AuxLink) {next.fullDocument.AuxLink = [];}
                    RoomBroadcast("{ \"flag\":\"new\", \"content\":" + JSON.stringify({
                        Nick: next.fullDocument.Room,
                        StreamLink: next.fullDocument.Link,
                        Tags: next.fullDocument.Tag,
                        AuxLink: next.fullDocument.AuxLink
                    }) + " }");
                }
            }
        );
    }
  });
}

function RoomBroadcast(data){
    RoomSubs.forEach(c => c.res.write("data:" + data + "\n\n"));
}
//======================================================= CACHING + BROADCAST FUNCTION ======================================================



app.get('/Archive/', async function (req, res) {
    const UniqueID = Date.now();
    ArchiveSubs.push({
        ID: UniqueID,
        res
    });

    res.writeHead(200, headers);
    res.flushHeaders();
    res.write("data: { \"flag\":\"connect\", \"content\":\"SUBSCRIBED TO ARCHIVE PUBSUB SYSTEM\"}\n\n");

    req.on('close', () => {
        ArchiveSubs = ArchiveSubs.filter(e => e.ID !== UniqueID);
    });    
})

app.get('/Room/', async function (req, res) {
    const UniqueID = Date.now();
    RoomSubs.push({
        ID: UniqueID,
        res
    });

    res.writeHead(200, headers);
    res.flushHeaders();
    res.write("data: { \"flag\":\"connect\", \"content\":\"SUBSCRIBED TO ROOM PUBSUB SYSTEM\"}\n\n");

    req.on('close', () => {
        RoomSubs = RoomSubs.filter(e => e.ID !== UniqueID);
    });    
})

app.get('/Schedule/', async function (req, res) {
    const UniqueID = Date.now();
    ScheduleSubs.push({
        ID: UniqueID,
        res
    });

    res.writeHead(200, headers);
    res.flushHeaders();
    res.write("data: { \"flag\":\"connect\", \"content\":\"SUBSCRIBED TO SCHEDULE PUBSUB SYSTEM\"}\n\n");

    req.on('close', () => {
        ScheduleSubs = ScheduleSubs.filter(e => e.ID !== UniqueID);
    });    
})

function Pinger() {
    ArchiveBroadcast("{}");
    ScheduleBroadcast("{}");
    RoomBroadcast("{}");
}

async function InitServer() {
    await client.connect();
    await LocalClient.connect();
    InitArchiveCaching();
    InitBroadcastProxy();
    InitScheduleCaching();
    setInterval(Pinger, 1000*10);

    app.listen(PORT, async function () {
        console.log(`Server initialized on port ${PORT}`);
    })
}

InitServer();